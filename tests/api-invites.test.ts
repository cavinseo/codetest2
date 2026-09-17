// 초대 코드 발행·목록·회수가 역할 게이트와 프로그램 경계를 지키는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const createInvite = vi.fn();
const findManyInvite = vi.fn();
const findUniqueInvite = vi.fn();
const updateManyInvite = vi.fn();
const findUniqueUser = vi.fn();
const findUniqueProgram = vi.fn();
const lock = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        inviteCode: {
            create: createInvite, findMany: findManyInvite,
            findUnique: findUniqueInvite, updateMany: updateManyInvite,
        },
        user: { findUnique: findUniqueUser },
        program: { findUnique: findUniqueProgram },
        $transaction: async (fn: (tx: unknown) => unknown) => fn({
            $queryRaw: lock,
            program: { findUnique: findUniqueProgram },
            user: { findFirst: findUniqueUser },
            inviteCode: { findMany: findManyInvite, create: createInvite },
        }),
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
        body: JSON.stringify(method === 'POST' ? { expiresAt: '2026-09-17', ...(body as object) } : body),
    });
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-17T03:00:00.000Z'));
    findUniqueUser.mockResolvedValue(null);
    findManyInvite.mockResolvedValue([]);
    // 기본값은 발행자 자신이 담당 매니저인 프로그램이다. 대부분의 테스트가
    // "이 프로그램을 만질 수 있다"는 전제를 깔고 있어, 그 전제를 여기서 채운다.
    findUniqueProgram.mockResolvedValue({ id: 'prog_1', managerId: ISSUER_ID, endsAt: new Date(Date.now() + 180 * 86400000) });
    createInvite.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data, id: 'inv_1', createdAt: new Date(), usedAt: null, usedById: null,
    }));
    findUniqueInvite.mockResolvedValue({
        id: 'inv_1', usedAt: null, issuedById: ISSUER_ID,
        program: { managerId: ISSUER_ID },
    });
    updateManyInvite.mockResolvedValue({ count: 1 });
    sendMail.mockResolvedValue(true);
});

afterEach(() => {
    vi.useRealTimers();
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

    it('종료된 프로그램에는 이용 기간과 무관하게 발급을 거절한다', async () => {
        findUniqueProgram.mockResolvedValue({ id: 'prog_1', managerId: ISSUER_ID, endsAt: new Date(0) });
        expect((await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }))).status).toBe(400);
        expect((await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1', accessDurationDays: 365 }))).status).toBe(400);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('같은 이메일의 유효 코드를 중복 발급하지 않는다', async () => {
        findManyInvite.mockResolvedValue([{ usedAt: null, expiresAt: new Date(Date.now() + 86400000), program: { endsAt: new Date(Date.now() + 86400000) } }]);
        expect((await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }))).status).toBe(409);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('신규 코드는 지정한 한국 날짜의 마지막 시각을 가입과 이용 기한에 저장한다', async () => {
        const res = await POST(jsonRequest('POST', {
            email: 'm@x.com', role: 'MENTEE', programId: 'prog_1', expiresAt: '2026-10-15',
        }));
        expect(res.status).toBe(200);
        expect(createInvite.mock.calls[0][0].data).toMatchObject({
            expiresAt: new Date('2026-10-15T14:59:59.999Z'),
            accessExpiresAt: new Date('2026-10-15T14:59:59.999Z'),
        });
        expect((await res.json()).invite.expiresAt).toBe('2026-10-15T14:59:59.999Z');
        expect(sendMail.mock.calls[0][0].html).toContain('/login?mode=invite');
        expect(lock).toHaveBeenCalled();
    });

    it.each([undefined, '', '2026-02-30', '2026-13-01', '2026-09-16', '2026-10-15T00:00:00Z'])('잘못된 이용 기한 %s는 발급하지 않는다', async expiresAt => {
        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1', expiresAt }));

        expect(res.status).toBe(400);
        expect(createInvite).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('한국의 오늘 날짜는 그날 마지막 시각까지 발급할 수 있다', async () => {
        vi.setSystemTime(new Date('2026-09-17T15:00:00.000Z'));
        const res = await POST(jsonRequest('POST', {
            email: 'm@x.com', role: 'MENTEE', programId: 'prog_1', expiresAt: '2026-09-18',
        }));

        expect(res.status).toBe(200);
        expect(createInvite.mock.calls[0][0].data.expiresAt).toEqual(new Date('2026-09-18T14:59:59.999Z'));
    });

    it('UTC로는 오늘이어도 한국에서 지난 날짜이면 발급하지 않는다', async () => {
        vi.setSystemTime(new Date('2026-09-17T15:00:00.000Z'));
        const res = await POST(jsonRequest('POST', {
            email: 'm@x.com', role: 'MENTEE', programId: 'prog_1', expiresAt: '2026-09-17',
        }));

        expect(res.status).toBe(400);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('프로그램 한국 종료 날짜 이후는 발급하지 않는다', async () => {
        findUniqueProgram.mockResolvedValue({ id: 'prog_1', managerId: ISSUER_ID, endsAt: new Date('2026-10-14T16:00:00.000Z') });
        const res = await POST(jsonRequest('POST', {
            email: 'm@x.com', role: 'MENTEE', programId: 'prog_1', expiresAt: '2026-10-16',
        }));

        expect(res.status).toBe(400);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('프로그램 한국 종료 날짜와 같으면 정확한 종료 시각을 저장한다', async () => {
        const endsAt = new Date('2026-10-14T16:00:00.000Z');
        findUniqueProgram.mockResolvedValue({ id: 'prog_1', managerId: ISSUER_ID, endsAt });
        const res = await POST(jsonRequest('POST', {
            email: 'm@x.com', role: 'MENTEE', programId: 'prog_1', expiresAt: '2026-10-15',
        }));

        expect(res.status).toBe(200);
        expect(createInvite.mock.calls[0][0].data).toMatchObject({ expiresAt: endsAt, accessExpiresAt: endsAt });
    });

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
        findUniqueProgram.mockResolvedValue({ id: 'prog_1', managerId: 'other_manager', endsAt: new Date(Date.now() + 86400000) });

        const res = await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }));

        expect(res.status).toBe(403);
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('관리자는 자신이 개설하지 않은 프로그램에도 발행할 수 있다', async () => {
        findUniqueProgram.mockResolvedValue({ id: 'prog_1', managerId: 'other_manager', endsAt: new Date(Date.now() + 86400000) });

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

    it('발급 메일은 멘티 초대코드 로그인으로 연결하고 실제 지정일을 안내한다', async () => {
        const res = await POST(jsonRequest('POST', {
            email: 'm@x.com', role: 'MENTEE', programId: 'prog_1', expiresAt: '2026-10-15',
        }));

        expect(res.status).toBe(200);
        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
            to: 'm@x.com', html: expect.stringContaining('href="http://localhost/login?mode=invite"'),
        }));
        expect(sendMail.mock.calls[0][0].html).toContain('2026-10-15');
        expect(sendMail.mock.calls[0][0].html).not.toContain('첫 로그인 후');
        expect(sendMail.mock.calls[0][0].html).not.toContain('90일');
        expect(sendMail.mock.calls[0][0].html).toContain('같은 코드로 로그인');
    });

    it('기존 코드 호환용 기본 기간 90일과 명시적 이용 기한을 함께 담는다', async () => {
        await POST(jsonRequest('POST', { email: 'm@x.com', role: 'MENTEE', programId: 'prog_1' }));

        expect(createInvite.mock.calls[0][0].data.accessDurationDays).toBe(90);
        expect(createInvite.mock.calls[0][0].data.accessExpiresAt).toEqual(new Date('2026-09-17T14:59:59.999Z'));
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

    it('조회 직후 최초 로그인에 사용된 코드는 회수 성공으로 응답하지 않는다', async () => {
        updateManyInvite.mockResolvedValue({ count: 0 });

        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: '이미 사용된 코드는 회수할 수 없습니다.' });
        expect(updateManyInvite).toHaveBeenCalledWith({
            where: { id: 'inv_1', usedAt: null },
            data: { expiresAt: expect.any(Date) },
        });
    });

    it('삭제가 아니라 만료 처리한다', async () => {
        // 누가 누구에게 무엇을 발급했는지가 이력으로 남아야 한다.
        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(200);
        expect(updateManyInvite).toHaveBeenCalledWith({
            where: { id: 'inv_1', usedAt: null },
            data: { expiresAt: expect.any(Date) },
        });
        const data = updateManyInvite.mock.calls[0][0].data;
        expect(data.expiresAt).toBeInstanceOf(Date);
    });

    it('이미 사용된 코드는 회수할 수 없다', async () => {
        findUniqueInvite.mockResolvedValue({
            id: 'inv_1', usedAt: new Date(), issuedById: ISSUER_ID,
            program: { managerId: ISSUER_ID },
        });

        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(400);
        expect(updateManyInvite).not.toHaveBeenCalled();
    });

    it('연결 후 첫 접속 전에는 회원 연결과 자료를 보존하면서 코드만 만료 처리한다', async () => {
        findUniqueInvite.mockResolvedValue({
            id: 'inv_1', usedAt: null, usedById: 'member_1', issuedById: ISSUER_ID,
            program: { managerId: ISSUER_ID },
        });
        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));
        expect(res.status).toBe(200);
        expect(updateManyInvite).toHaveBeenCalledExactlyOnceWith({
            where: { id: 'inv_1', usedAt: null }, data: { expiresAt: new Date() },
        });
        expect(createInvite).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('매니저도 회수할 수 있다', async () => {
        // 이 라우트를 /api/admin/ 밖에 둔 이유가 매니저도 쓰기 때문이다.
        // 게이트가 관리자 전용으로 좁아지면 여기서 잡힌다.
        authAs('PROGRAM_MANAGER');

        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(200);
        expect(updateManyInvite).toHaveBeenCalled();
    });

    it('멘토는 회수할 수 없다', async () => {
        authAs('MENTOR');

        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(403);
        expect(updateManyInvite).not.toHaveBeenCalled();
    });

    it('다른 매니저가 개설한 프로그램의 코드는 회수할 수 없다', async () => {
        authAs('PROGRAM_MANAGER');
        findUniqueInvite.mockResolvedValue({
            id: 'inv_1', usedAt: null, issuedById: 'other_manager',
            program: { managerId: 'other_manager' },
        });

        const res = await DELETE(jsonRequest('DELETE', { id: 'inv_1' }));

        expect(res.status).toBe(403);
        expect(updateManyInvite).not.toHaveBeenCalled();
    });
});

describe('초대 코드 목록', () => {
    it.each(['ADMIN', 'PROGRAM_MANAGER'])('%s 목록은 첫 접속 대기 연결과 현재 회원 이용만료일을 제공하고 관리자만 연결할 수 있다', async role => {
        authAs(role);
        findManyInvite.mockResolvedValue([{
            id: 'linked', usedById: 'member_1', usedAt: null,
            expiresAt: new Date('2026-10-01'), accessExpiresAt: new Date('2026-10-01'),
            program: { name: '기존 프로그램', endsAt: new Date('2026-12-31') },
            usedBy: { accessExpiresAt: new Date('2026-12-15') },
        }]);
        const res = await GET(new NextRequest('http://localhost/api/invites'));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
            canLinkExistingMember: role === 'ADMIN',
            invites: [{ id: 'linked', usedById: 'member_1', usedAt: null, expiresAt: '2026-10-01T00:00:00.000Z', accessExpiresAt: '2026-12-15T00:00:00.000Z' }],
        });
        expect(findManyInvite.mock.calls[0][0].select.usedById).toBe(true);
    });

    it('프로그램 매니저 응답에는 이메일 인증용 원문 코드가 없다', async () => {
        authAs('PROGRAM_MANAGER');
        findManyInvite.mockResolvedValue([{ id: 'inv', code: 'SECRET-LOGIN-CODE', email: 'mentee@example.test',
            program: { name: '프로그램', endsAt: new Date('2099-01-01') }, expiresAt: new Date('2099-01-01'), usedAt: null }]);
        const response = await GET(new NextRequest('http://localhost/api/invites'));
        expect(response.status).toBe(200);
        expect(await response.text()).not.toContain('SECRET-LOGIN-CODE');
        expect(findManyInvite.mock.calls[0][0].select.code).toBe(false);
    });
    it.each([true, false])('매니저 발급 응답은 메일 성공 %s 여부와 무관하게 코드를 제외한다', async emailSent => {
        authAs('PROGRAM_MANAGER'); sendMail.mockResolvedValue(emailSent);
        const response = await POST(jsonRequest('POST', { email: 'new@example.test', role: 'MENTEE', programId: 'prog_1' }));
        const body = await response.json();
        expect(response.status).toBe(200); expect(body.emailSent).toBe(emailSent);
        expect(body).not.toHaveProperty('code'); expect(body.invite).not.toHaveProperty('code');
    });
    it('관리자 응답은 메일로 전달된 기존 코드도 그대로 포함한다', async () => {
        authAs('ADMIN');
        findManyInvite.mockResolvedValue([{
            id: 'inv_visible', code: 'ADMIN-VISIBLE-CODE', email: 'mentee@example.test',
            programId: 'prog_1', program: { name: '초대 프로그램', endsAt: new Date('2099-12-31') },
            expiresAt: new Date('2099-01-01'), usedAt: null, accessDurationDays: 90,
        }]);

        const res = await GET(new NextRequest('http://localhost/api/invites'));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(findManyInvite.mock.calls[0][0].where).toEqual({});
        expect(findManyInvite.mock.calls[0][0].select.code).toBe(true);
        expect(body.invites).toEqual([expect.objectContaining({
            id: 'inv_visible', code: 'ADMIN-VISIBLE-CODE', programName: '초대 프로그램',
            programEndsAt: '2099-12-31T00:00:00.000Z',
        })]);
    });

    it('멘티는 발급 코드 조회를 시도해도 DB 조회 전에 차단된다', async () => {
        authAs('MENTEE');

        const res = await GET(new NextRequest('http://localhost/api/invites'));

        expect(res.status).toBe(403);
        expect(findManyInvite).not.toHaveBeenCalled();
    });

    it('미로그인 요청은 인증 실패를 그대로 반환하고 코드 목록을 조회하지 않는다', async () => {
        requireAuth.mockResolvedValue(NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }));

        const res = await GET(new NextRequest('http://localhost/api/invites'));

        expect(res.status).toBe(401);
        expect(findManyInvite).not.toHaveBeenCalled();
    });

    it('최초 접속 기한과 회원 이용만료일을 서로 다른 필드로 제공한다', async () => {
        authAs('ADMIN');
        const end = new Date(0);
        findManyInvite.mockResolvedValue([{ id: 'i', usedAt: new Date(), accessDurationDays: 90, expiresAt: new Date(Date.now() + 86400000), program: { name: '종료 프로그램', endsAt: end }, usedBy: { accessExpiresAt: null } }]);
        const result = await GET(new NextRequest('http://localhost/api/invites'));
        expect((await result.json()).invites[0]).toMatchObject({
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            accessExpiresAt: end.toISOString(), programName: '종료 프로그램',
        });
    });

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
