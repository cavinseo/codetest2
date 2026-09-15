// 관리자 프로그램 삭제의 권한·확인·자료 보존·경합 오류 계약을 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { findProgram, deleteProgram, queryRaw, transaction, requireAuth } = vi.hoisted(() => ({
    findProgram: vi.fn(), deleteProgram: vi.fn(), queryRaw: vi.fn(), transaction: vi.fn(), requireAuth: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({
    prisma: { program: { findUnique: findProgram }, $transaction: transaction },
}));
vi.mock('../lib/auth', () => ({ requireAuth }));

const { GET, DELETE } = await import('../app/api/programs/[id]/route');
const programId = 'program_to_delete';
const params = { params: Promise.resolve({ id: programId }) };
const tx = { program: { findUnique: findProgram, delete: deleteProgram }, $queryRaw: queryRaw };

function program(overrides: { projects?: number; mentees?: number; invites?: number; requests?: number; used?: number } = {}) {
    return {
        id: programId, name: '삭제 대상 프로그램',
        _count: { projects: overrides.projects ?? 0, mentees: overrides.mentees ?? 0, inviteCodes: overrides.invites ?? 0, projectRequests: overrides.requests ?? 0 },
        inviteCodes: Array.from({ length: overrides.used ?? 0 }, (_, i) => ({ id: `used_${i}` })),
    };
}

function request(method: 'GET' | 'DELETE', body: unknown = { confirm: true, inviteCount: 0, requestCount: 0 }) {
    return new NextRequest(`http://localhost/api/programs/${programId}`, {
        method, headers: { 'Content-Type': 'application/json' },
        ...(method === 'DELETE' ? { body: JSON.stringify(body) } : {}),
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    requireAuth.mockResolvedValue({ userId: 'admin_1', email: 'admin@example.com', name: '관리자', role: 'ADMIN', isAdmin: true, accessExpiresAt: null });
    findProgram.mockResolvedValue(program());
    queryRaw.mockResolvedValue([{ id: programId }]);
    deleteProgram.mockResolvedValue({ id: programId });
    transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
});

afterEach(() => vi.restoreAllMocks());

describe.each([['GET', GET], ['DELETE', DELETE]] as const)('%s 프로그램 삭제 권한', (method, handler) => {
    it('로그인하지 않으면 DB에 접근하지 않는다', async () => {
        requireAuth.mockResolvedValue(NextResponse.json({ error: 'Login required.' }, { status: 401 }));
        expect((await handler(request(method), params)).status).toBe(401);
        expect(findProgram).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });

    it.each(['PROGRAM_MANAGER', 'MENTOR', 'MENTEE'])('%s는 관리자 플래그가 남아 있어도 접근하지 못한다', async role => {
        requireAuth.mockResolvedValue({ userId: 'other', email: 'other@example.com', name: '회원', role, isAdmin: true, accessExpiresAt: null });
        expect((await handler(request(method), params)).status).toBe(403);
        expect(findProgram).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });
});

describe('프로그램 삭제 미리보기', () => {
    it('대상의 연결 건수를 표시하고 미사용 초대와 신청 이력만 있으면 삭제 가능하다', async () => {
        findProgram.mockResolvedValue(program({ invites: 3, requests: 2 }));
        const response = await GET(request('GET'), params);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ program: {
            id: programId, name: '삭제 대상 프로그램', projectCount: 0, menteeCount: 0,
            inviteCount: 3, requestCount: 2, usedInviteCount: 0, canDelete: true, blockReason: '',
        } });
        expect(findProgram).toHaveBeenCalledWith(expect.objectContaining({ where: { id: programId } }));
        expect(deleteProgram).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });

    it('프로젝트·회원·사용 초대가 남으면 모두 표시하고 삭제 불가로 알린다', async () => {
        findProgram.mockResolvedValue(program({ projects: 2, mentees: 4, invites: 3, used: 1, requests: 2 }));
        const response = await GET(request('GET'), params);
        const preview = (await response.json()).program;
        expect(preview).toMatchObject({ projectCount: 2, menteeCount: 4, usedInviteCount: 1, canDelete: false });
        expect(preview.blockReason).toContain('프로젝트 2개');
        expect(preview.blockReason).toContain('멘티 4명');
        expect(preview.blockReason).toContain('초대코드 1개');
    });

    it('사용일 또는 연결 회원 중 하나만 남은 코드도 조회한다', async () => {
        await GET(request('GET'), params);
        expect(findProgram.mock.calls[0][0].select.inviteCodes.where).toEqual({
            OR: [{ usedAt: { not: null } }, { usedById: { not: null } }],
        });
    });
});

describe('프로그램 삭제 실행', () => {
    it.each([{}, { confirm: false }, { confirm: 'true' }, { confirm: 1 }, null])('명시적인 확인 true 없이 실행하지 않는다 (%j)', async body => {
        const payload = body ? { ...body, inviteCount: 0, requestCount: 0 } : body;
        expect((await DELETE(request('DELETE', payload), params)).status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
        expect(deleteProgram).not.toHaveBeenCalled();
    });

    it('깨진 JSON을 받으면 실행하지 않는다', async () => {
        const malformed = new NextRequest(`http://localhost/api/programs/${programId}`, { method: 'DELETE', body: '{', headers: { 'Content-Type': 'application/json' } });
        expect((await DELETE(malformed, params)).status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });

    it.each([
        {}, { inviteCount: 0 }, { requestCount: 0 },
        { inviteCount: -1, requestCount: 0 }, { inviteCount: 0, requestCount: -1 },
        { inviteCount: 0.5, requestCount: 0 }, { inviteCount: 0, requestCount: 0.5 },
        { inviteCount: '0', requestCount: 0 }, { inviteCount: 0, requestCount: null },
    ])('미리보기 건수가 없거나 0 이상 정수가 아니면 거부한다 (%j)', async counts => {
        expect((await DELETE(request('DELETE', { confirm: true, ...counts }), params)).status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });

    it.each([
        ['프로젝트', { projects: 1 }], ['회원', { mentees: 1 }], ['사용 초대코드', { invites: 1, used: 1 }],
    ] as const)('%s가 하나라도 남으면 확인 여부와 관계없이 보존한다', async (_, counts) => {
        findProgram.mockResolvedValue(program(counts));
        const response = await DELETE(request('DELETE'), params);
        expect(response.status).toBe(409);
        expect((await response.json()).program.canDelete).toBe(false);
        expect(deleteProgram).not.toHaveBeenCalled();
    });

    it('미리보기가 비어 있었어도 실행 직전에 추가된 회원을 재확인한다', async () => {
        expect((await GET(request('GET'), params)).status).toBe(200);
        findProgram.mockResolvedValue(program({ mentees: 1 }));
        expect((await DELETE(request('DELETE'), params)).status).toBe(409);
        expect(deleteProgram).not.toHaveBeenCalled();
    });

    it.each([{ invites: 1 }, { requests: 2 }])('확인 후 삭제 대상 이력 건수가 바뀌면 새 건수로 재확인을 요구한다 (%j)', async counts => {
        findProgram.mockResolvedValue(program(counts));
        const response = await DELETE(request('DELETE'), params);
        expect(response.status).toBe(409);
        expect((await response.json()).program).toMatchObject({ inviteCount: counts.invites ?? 0, requestCount: counts.requests ?? 0, canDelete: true });
        expect(deleteProgram).not.toHaveBeenCalled();
    });

    it('대상 하나만 행 잠금·재검사 후 삭제하고 이름을 반환한다', async () => {
        findProgram.mockResolvedValue(program({ invites: 2, requests: 3 }));
        const response = await DELETE(request('DELETE', { confirm: true, inviteCount: 2, requestCount: 3 }), params);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, deletedProgram: '삭제 대상 프로그램' });
        expect(transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
        expect(queryRaw).toHaveBeenCalledTimes(1);
        const [sql, id] = queryRaw.mock.calls[0];
        expect((sql as TemplateStringsArray).join('?')).toMatch(/SELECT id FROM programs WHERE id = \? FOR UPDATE/);
        expect(id).toBe(programId);
        expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(findProgram.mock.invocationCallOrder[0]);
        expect(findProgram.mock.invocationCallOrder[0]).toBeLessThan(deleteProgram.mock.invocationCallOrder[0]);
        expect(deleteProgram).toHaveBeenCalledExactlyOnceWith({ where: { id: programId } });
    });

    it('미분류 이름의 프로그램도 연결 자료가 없으면 같은 규칙으로 삭제한다', async () => {
        findProgram.mockResolvedValue({ ...program(), name: '미분류' });
        expect((await DELETE(request('DELETE'), params)).status).toBe(200);
        expect(deleteProgram).toHaveBeenCalledOnce();
    });
});

describe('없는 대상과 DB 오류', () => {
    it.each([['GET', GET], ['DELETE', DELETE]] as const)('%s 대상이 없으면 404로 처리한다', async (method, handler) => {
        findProgram.mockResolvedValue(null);
        expect((await handler(request(method), params)).status).toBe(404);
        expect(deleteProgram).not.toHaveBeenCalled();
    });

    it.each([['P2003', 409], ['P2034', 409], ['P2025', 404]] as const)('%s를 재확인 가능한 오류 %i로 처리한다', async (code, status) => {
        transaction.mockRejectedValue(Object.assign(new Error('internal database detail'), { code }));
        const response = await DELETE(request('DELETE'), params);
        expect(response.status).toBe(status);
        expect(await response.text()).not.toContain('internal database detail');
    });

    it.each([['GET', GET], ['DELETE', DELETE]] as const)('%s의 예상 밖 오류에 내부 정보 대신 참조번호를 반환한다', async (method, handler) => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        findProgram.mockRejectedValue(new Error('private database details'));
        const response = await handler(request(method), params);
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(body.error).toMatch(/[가-힣]/);
        expect(body.error).not.toContain('private database details');
        expect(body.referenceId).toEqual(expect.any(String));
        expect(body.referenceId.length).toBeGreaterThan(0);
    });
});
