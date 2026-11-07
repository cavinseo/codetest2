// 팀원 초대가 EDITOR 만 허용하고 COACH(멘토) 배정 경로를 막으며, 같은 프로그램에서 이용 중인
// 멘티만 받는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueProject = vi.fn();
const findUniqueUser = vi.fn();
const findUniqueMember = vi.fn();
const createMember = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: findUniqueProject },
        user: { findFirst: findUniqueUser },
        projectMember: { findUnique: findUniqueMember, create: createMember },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST } = await import('../app/api/projects/[id]/members/route');

const params = { params: Promise.resolve({ id: 'proj_1' }) };

function jsonRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/proj_1/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const eligibleInvitee = {
    id: 'invitee_1', email: 'i@x.com', name: '초대대상', role: 'MENTEE', status: 'APPROVED', isAdmin: false,
    accessExpiresAt: null, programId: 'program_1', usedInviteCode: null,
};

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: { userId: 'owner_1' }, role: 'OWNER' });
    findUniqueProject.mockResolvedValue({ id: 'proj_1', ownerId: 'owner_1', programId: 'program_1' });
    findUniqueUser.mockResolvedValue(eligibleInvitee);
    findUniqueMember.mockResolvedValue(null);
    createMember.mockResolvedValue({ id: 'member_1', role: 'EDITOR', joinedAt: new Date() });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('팀원 초대 역할', () => {
    it('EDITOR 초대는 허용한다', async () => {
        const res = await POST(jsonRequest({ email: 'i@x.com', role: 'EDITOR' }), params);

        expect(res.status).toBe(200);
        expect(createMember.mock.calls[0][0].data.role).toBe('EDITOR');
    });

    it('COACH 초대는 거부한다', async () => {
        // 멘토(COACH) 배정은 대상의 시스템 역할을 검사하는 /mentors 로만 해야 한다.
        // 이 경로로 COACH 행을 만들면 그 검사를 우회하는 두 번째 배정 경로가 생긴다.
        const res = await POST(jsonRequest({ email: 'i@x.com', role: 'COACH' }), params);

        expect(res.status).toBe(400);
        expect(createMember).not.toHaveBeenCalled();
    });
});

describe('팀원 초대 대상', () => {
    it('이메일 대소문자를 무시하고 찾는다', async () => {
        await POST(jsonRequest({ email: 'I@X.com', role: 'EDITOR' }), params);

        expect(findUniqueUser.mock.calls[0][0].where).toEqual({ email: { equals: 'I@X.com', mode: 'insensitive' } });
    });

    it.each([
        ['없는 이메일', null],
        ['승인 대기 계정', { ...eligibleInvitee, status: 'PENDING' }],
        ['다른 프로그램 멘티', { ...eligibleInvitee, programId: 'program_2' }],
        ['프로그램 없는 멘티', { ...eligibleInvitee, programId: null }],
        ['멘토', { ...eligibleInvitee, role: 'MENTOR' }],
        ['관리자', { ...eligibleInvitee, isAdmin: true }],
        ['이용 만료 계정', { ...eligibleInvitee, accessExpiresAt: new Date('2020-01-01') }],
        ['초대 코드 첫 로그인 전 계정', {
            ...eligibleInvitee,
            usedInviteCode: {
                usedAt: null, expiresAt: new Date('2099-01-01'), accessExpiresAt: null, accessDurationDays: 90,
                programId: 'program_1', program: { endsAt: new Date('2099-01-01') },
            },
        }],
    ])('%s은(는) 같은 404 문구로 거부해 가입 여부를 드러내지 않는다', async (_label, invitee) => {
        findUniqueUser.mockResolvedValue(invitee);

        const res = await POST(jsonRequest({ email: 'i@x.com', role: 'EDITOR' }), params);
        const body = await res.json();

        expect(res.status).toBe(404);
        expect(body.error).toBe('같은 프로그램에서 이용 중인 멘티만 팀원으로 초대할 수 있습니다. 이메일을 확인하세요.');
        expect(body.name).toBeUndefined();
        expect(createMember).not.toHaveBeenCalled();
    });
});
