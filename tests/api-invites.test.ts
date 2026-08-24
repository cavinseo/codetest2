// 초대 코드 발행·목록·회수가 역할 게이트와 프로그램 경계를 지키는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createInvite = vi.fn();
const findManyInvite = vi.fn();
const findUniqueInvite = vi.fn();
const updateInvite = vi.fn();
const findUniqueUser = vi.fn();
const findUniqueProgram = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        inviteCode: {
            create: createInvite, findMany: findManyInvite,
            findUnique: findUniqueInvite, update: updateInvite,
        },
        user: { findUnique: findUniqueUser },
        program: { findUnique: findUniqueProgram },
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const sendMail = vi.fn();
vi.mock('../lib/email', () => ({
    sendMail: (...args: unknown[]) => sendMail(...(args as [])),
}));

const { GET, POST, DELETE } = await import('../app/api/invites/route');

const ISSUER_ID = 'issuer_1';

function authAs(role: string) {
    requireAuth.mockResolvedValue({
        userId: ISSUER_ID, email: 'i@x.com', name: '발행자',
        isAdmin: role === 'ADMIN', role, accessExpiresAt: null,
    });
}

function jsonRequest(method: string, body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/invites', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    findUniqueUser.mockResolvedValue(null);
    findManyInvite.mockResolvedValue([]);
    // 기본값은 발행자 자신이 담당 매니저인 프로그램이다. 대부분의 테스트가
    // "이 프로그램을 만질 수 있다"는 전제를 깔고 있어, 그 전제를 여기서 채운다.
    findUniqueProgram.mockResolvedValue({ id: 'prog_1', managerId: ISSUER_ID });
    createInvite.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data, id: 'inv_1', createdAt: new Date(), usedAt: null, usedById: null,
    }));
    findUniqueInvite.mockResolvedValue({
        id: 'inv_1', usedAt: null, issuedById: ISSUER_ID,
        program: { managerId: ISSUER_ID },
    });
    updateInvite.mockResolvedValue({ id: 'inv_1' });
    sendMail.mockResolvedValue(true);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('초대 코드 발행 권한', () => {
    it('관리자는 발행할 수 있다', async () => {
        authAs('ADMIN');

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }));

        expect(res.status).toBe(200);
        expect(createInvite).toHaveBeenCalled();
    });

    it('매니저도 발행할 수 있다', async () => {
        authAs('PROGRAM_MANAGER');

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }));

        expect(res.status).toBe(200);
    });

    it('멘토는 발행할 수 없다', async () => {
        authAs('MENTOR');

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }));

        expect(res.status).toBe(403);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('멘티는 발행할 수 없다', async () => {
        authAs('MENTEE');

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }));

        expect(res.status).toBe(403);
    });
});

describe('초대 코드 발행 규칙', () => {
    beforeEach(() => authAs('ADMIN'));

    it('멘토 역할로는 코드를 만들 수 없다', async () => {
        // 멘토는 정식 등록으로만 들어온다. 코드는 프로그램에 묶이는데, 멘토는
        // 여러 프로그램의 프로젝트에 배정될 수 있어 이 모델과 맞지 않는다.
        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTOR', programId: 'prog_1' }));

        expect(res.status).toBe(400);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('매니저 역할로는 코드를 만들 수 없다', async () => {
        // 매니저는 멘토 중에서 승격으로만 생긴다.
        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'PROGRAM_MANAGER', programId: 'prog_1' }));

        expect(res.status).toBe(400);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('관리자 역할로도 코드를 만들 수 없다', async () => {
        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'ADMIN', programId: 'prog_1' }));

        expect(res.status).toBe(400);
    });

    it('프로그램을 지정하지 않으면 만들 수 없다', async () => {
        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE' }));

        expect(res.status).toBe(400);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('존재하지 않는 프로그램에는 발행할 수 없다', async () => {
        findUniqueProgram.mockResolvedValue(null);

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_missing' }));

        expect(res.status).toBe(404);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('매니저는 다른 매니저의 프로그램에는 발행할 수 없다', async () => {
        authAs('PROGRAM_MANAGER');
        findUniqueProgram.mockResolvedValue({ id: 'prog_1', managerId: 'other_manager' });

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }));

        expect(res.status).toBe(403);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('관리자는 자신이 개설하지 않은 프로그램에도 발행할 수 있다', async () => {
        findUniqueProgram.mockResolvedValue({ id: 'prog_1', managerId: 'other_manager' });

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }));

        expect(res.status).toBe(200);
    });

    it('이미 가입한 이메일에는 발행하지 않는다', async () => {
        findUniqueUser.mockResolvedValue({ id: 'user_9' });

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }));

        expect(res.status).toBe(409);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('발행한 코드에 프로그램 id 를 담는다', async () => {
        await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }));

        expect(createInvite.mock.calls[0][0].data.programId).toBe('prog_1');
    });

    it('기본 접근 기간 90일을 담는다', async () => {
        await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }));

        expect(createInvite.mock.calls[0][0].data.accessDurationDays).toBe(90);
    });

    it('메일 발송이 실패하면 코드는 만들되 실패를 알린다', async () => {
        // 코드는 이미 만들어졌으므로 관리자가 직접 전달할 수 있어야 한다.
        sendMail.mockResolvedValue(false);

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.emailSent).toBe(false);
        expect(body.code).toBeTruthy();
    });
});

describe('초대 코드 회수', () => {
    beforeEach(() => authAs('ADMIN'));

    it('삭제가 아니라 만료 처리한다', async () => {
        // 누가 누구에게 무엇을 발급했는지가 이력으로 남아야 한다.
        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(200);
        expect(updateInvite).toHaveBeenCalled();
        const data = updateInvite.mock.calls[0][0].data;
        expect(data.expiresAt).toBeInstanceOf(Date);
    });

    it('이미 사용된 코드는 회수할 수 없다', async () => {
        findUniqueInvite.mockResolvedValue({
            id: 'inv_1', usedAt: new Date(), issuedById: ISSUER_ID,
            program: { managerId: ISSUER_ID },
        });

        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(400);
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('매니저도 회수할 수 있다', async () => {
        // 이 라우트를 /api/admin/ 밖에 둔 이유가 매니저도 쓰기 때문이다.
        // 게이트가 관리자 전용으로 좁아지면 여기서 잡힌다.
        authAs('PROGRAM_MANAGER');

        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(200);
        expect(updateInvite).toHaveBeenCalled();
    });

    it('멘토는 회수할 수 없다', async () => {
        authAs('MENTOR');

        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(403);
        expect(updateInvite).not.toHaveBeenCalled();
    });

    it('다른 매니저가 개설한 프로그램의 코드는 회수할 수 없다', async () => {
        authAs('PROGRAM_MANAGER');
        findUniqueInvite.mockResolvedValue({
            id: 'inv_1', usedAt: null, issuedById: 'other_manager',
            program: { managerId: 'other_manager' },
        });

        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(403);
        expect(updateInvite).not.toHaveBeenCalled();
    });
});

describe('초대 코드 목록', () => {
    it('멘토는 목록을 볼 수 없다', async () => {
        authAs('MENTOR');

        const res = await GET(new NextRequest('http://localhost/api/invites'));

        expect(res.status).toBe(403);
    });

    it('매니저는 목록을 본다', async () => {
        authAs('PROGRAM_MANAGER');

        const res = await GET(new NextRequest('http://localhost/api/invites'));

        expect(res.status).toBe(200);
    });

    it('매니저는 자신이 개설한 프로그램의 코드만 조회 범위에 둔다', async () => {
        authAs('PROGRAM_MANAGER');

        await GET(new NextRequest('http://localhost/api/invites'));

        expect(findManyInvite.mock.calls[0][0].where).toEqual({ program: { managerId: ISSUER_ID } });
    });

    it('관리자는 전체를 조회 범위에 둔다', async () => {
        authAs('ADMIN');

        await GET(new NextRequest('http://localhost/api/invites'));

        expect(findManyInvite.mock.calls[0][0].where).toEqual({});
    });
});
