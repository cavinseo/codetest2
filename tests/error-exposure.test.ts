// 내부 오류 문구와 이메일이 응답·로그로 새지 않는지 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createLogger, redactEmails } from '../lib/logger';

const m = vi.hoisted(() => ({
    access: vi.fn(), project: vi.fn(), existing: vi.fn(), create: vi.fn(), send: vi.fn(),
}));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: m.access }));
vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: m.project },
        kanoSurveyInvitation: { findMany: m.existing, create: m.create },
    },
}));
vi.mock('../lib/email', () => ({ sendSurveyInvitation: m.send }));

const { POST } = await import('../app/api/projects/[id]/kano/invite/bulk/route');
const params = { params: Promise.resolve({ id: 'project' }) };

function jsonRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects/project/kano/invite/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
}

function fileRequest(file: File): NextRequest {
    const form = new FormData();
    form.set('file', file);
    return new NextRequest('http://localhost/api/projects/project/kano/invite/bulk', { method: 'POST', body: form });
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.resetAllMocks();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    m.access.mockResolvedValue({ user: { userId: 'owner', role: 'MENTEE' }, role: 'OWNER' });
    m.project.mockResolvedValue({ name: '프로젝트' });
    m.existing.mockResolvedValue([]);
    m.create.mockResolvedValue({});
    m.send.mockResolvedValue(true);
});

afterEach(() => {
    errorSpy.mockRestore();
});

describe('redactEmails', () => {
    it('오류 메시지 속 이메일 주소를 가린다', () => {
        expect(redactEmails('Unique constraint failed: hong.gil-dong+a@mail.example.co.kr already exists'))
            .toBe('Unique constraint failed: [email] already exists');
        expect(redactEmails('a@b.com, c@d.org')).toBe('[email], [email]');
    });

    it('이메일이 아닌 문구는 그대로 둔다', () => {
        expect(redactEmails('relation "users" does not exist @ line 3')).toBe('relation "users" does not exist @ line 3');
        expect(redactEmails('')).toBe('');
    });

    it('로거는 오류 메시지를 가려서 기록한다', () => {
        createLogger('test').error('조회 실패', new Error('Invalid `prisma.user.findFirst()` where email = victim@example.com'));

        const line = String(errorSpy.mock.calls[0][0]);
        expect(line).toContain('[email]');
        expect(line).not.toContain('victim@example.com');
    });
});

describe('Kano 일괄 초대의 오류 응답', () => {
    it('예상하지 못한 예외는 내부 메시지 대신 고정 문구와 500 으로 응답한다', async () => {
        // 예전에는 모든 예외의 message 를 400 으로 그대로 돌려줘 Prisma 내부가 보였다.
        m.existing.mockRejectedValue(new Error('Invalid `prisma.kanoSurveyInvitation.findMany()` invocation: column "email" of relation "kano_survey_invitations"'));

        const res = await POST(jsonRequest({ emails: ['a@customer.test'] }), params);
        const text = await res.text();

        expect(res.status).toBe(500);
        expect(text).toContain('일괄 초대에 실패했습니다.');
        expect(text).not.toContain('prisma');
        expect(text).not.toContain('kano_survey_invitations');
    });

    it('사용자가 고칠 수 있는 입력 오류는 문구를 그대로 400 으로 알려준다', async () => {
        const res = await POST(jsonRequest({}), params);

        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('초대할 이메일 주소가 없습니다.');
    });

    it('크기 한도를 넘는 파일은 413 으로 알려준다', async () => {
        const huge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], '명단.xlsx');

        const res = await POST(fileRequest(huge), params);

        expect(res.status).toBe(413);
        expect((await res.json()).error).toContain('10MB');
    });

    it('엑셀이 아닌 내용의 .xlsx 는 400 으로 거절하고 파서 내부 문구를 내보내지 않는다', async () => {
        const res = await POST(fileRequest(new File(['엑셀이 아닌 내용'], '명단.xlsx')), params);

        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('올바른 .xlsx 압축 파일이 아닙니다.');
    });

    it('정상 요청은 그대로 초대한다', async () => {
        const res = await POST(jsonRequest({ emails: ['a@customer.test'] }), params);

        expect(res.status).toBe(200);
        expect((await res.json()).summary.invited).toBe(1);
    });
});
