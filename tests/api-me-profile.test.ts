// 본인 프로필 조회·수정이 역할에 맞는 항목을 요구하는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUniqueProfile = vi.fn();
const upsertProfile = vi.fn();
const findUniqueUser = vi.fn();
const updateUser = vi.fn();
const transaction = vi.fn();

vi.mock('../lib/prisma', () => ({
    prisma: {
        memberProfile: { findUnique: findUniqueProfile, upsert: upsertProfile },
        user: { findUnique: findUniqueUser, update: updateUser },
        $transaction: (ops: unknown) => transaction(ops),
    },
}));

const requireAuth = vi.fn();
vi.mock('../lib/auth', () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...(args as [])),
}));

const { GET, PUT } = await import('../app/api/me/profile/route');

function authAs(role: string) {
    requireAuth.mockResolvedValue({
        userId: 'user_1', email: 'u@x.com', name: '사용자',
        isAdmin: false, role, accessExpiresAt: null,
    });
}

function putRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    findUniqueProfile.mockResolvedValue(null);
    upsertProfile.mockResolvedValue({ userId: 'user_1' });
    findUniqueUser.mockResolvedValue({ mustChangePassword: false });
    updateUser.mockResolvedValue({ id: 'user_1' });
    // 배열 형태(prisma.$transaction([...]))로 호출한다. 각 원소는 이미 호출된
    // 쿼리의 Promise 라 그대로 기다리기만 하면 실제 트랜잭션과 같은 결과다.
    transaction.mockImplementation(async (ops: unknown) => Promise.all(ops as Promise<unknown>[]));
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
});

describe('프로필 조회', () => {
    it('없으면 needsProfile 을 알린다', async () => {
        authAs('MENTEE');

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.needsProfile).toBe(true);
        expect(body.profile).toBeNull();
    });

    it('있으면 그대로 돌려준다', async () => {
        authAs('MENTEE');
        findUniqueProfile.mockResolvedValue({
            userId: 'user_1', organization: '가나대', phone: '010-0000-0000',
            companyName: '가나기업', industry: '제조업',
        });

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.needsProfile).toBe(false);
        expect(body.profile.organization).toBe('가나대');
    });

    it('승격된 멘토의 저장된 행에 전문분야가 없으면 needsProfile 을 알린다', async () => {
        // 멘티였다가 멘토로 승격된 회원. setRole 은 MemberProfile 을 건드리지
        // 않으므로 행은 남아 있지만 expertise/careerYears 는 비어 있다.
        authAs('MENTOR');
        findUniqueProfile.mockResolvedValue({
            userId: 'user_1', organization: '가나대', phone: '010-0000-0000',
            expertise: null, careerYears: null,
        });

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.needsProfile).toBe(true);
    });

    it('임시 비밀번호 계정은 mustChangePassword 를 알린다', async () => {
        // 온보딩 화면이 비밀번호 변경 섹션을 띄울지 이 값으로 판단한다.
        authAs('MENTEE');
        findUniqueUser.mockResolvedValue({ mustChangePassword: true });

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.mustChangePassword).toBe(true);
    });

    it('일반 계정은 mustChangePassword 가 false 다', async () => {
        authAs('MENTEE');

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.mustChangePassword).toBe(false);
    });

    it('ADMIN_EMAILS 계정은 isAdmin 이 꺼져 있어도 canAccessAdmin 을 true 로 알린다', async () => {
        // 화면(dashboard/admin)이 requireAdmin 과 같은 답을 보도록, isAdmin 만이
        // 아니라 ADMIN_EMAILS 매치도 canAccessAdmin 에 반영돼야 한다.
        vi.stubEnv('ADMIN_EMAILS', 'u@x.com');
        authAs('ADMIN');

        const res = await GET(new NextRequest('http://localhost/api/me/profile'));
        const body = await res.json();

        expect(body.canAccessAdmin).toBe(true);
    });

    it.each(['PROGRAM_MANAGER', 'MENTOR', 'MENTEE'])(
        '%s 는 ADMIN_EMAILS 에 있어도 canAccessAdmin 이 false 다',
        async (role) => {
            // 화면이 관리자 모드 링크를 띄우는 근거가 이 값 하나뿐이다. 여기서
            // true 가 새면 멘티에게 관리자 모드 아이콘이 그대로 보인다.
            vi.stubEnv('ADMIN_EMAILS', 'u@x.com');
            authAs(role);

            const res = await GET(new NextRequest('http://localhost/api/me/profile'));
            const body = await res.json();

            expect(body.canAccessAdmin).toBe(false);
        }
    );
});

describe('프로필 저장', () => {
    it('멘티는 기업명과 업종을 내야 한다', async () => {
        authAs('MENTEE');

        const res = await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
        }));

        expect(res.status).toBe(400);
        expect(upsertProfile).not.toHaveBeenCalled();
    });

    it('멘토는 전문분야와 경력을 내야 한다', async () => {
        authAs('MENTOR');

        const res = await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
        }));

        expect(res.status).toBe(400);
    });

    it('역할에 맞으면 저장한다', async () => {
        authAs('MENTOR');

        const res = await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
            expertise: '재료공학', careerYears: 10,
        }));

        expect(res.status).toBe(200);
        expect(upsertProfile).toHaveBeenCalled();
    });

    it('남의 프로필을 고칠 수 없다', async () => {
        // 경로에 userId 를 받지 않는다. 세션의 userId 만 쓴다.
        authAs('MENTOR');

        await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
            expertise: '재료공학', careerYears: 10,
        }));

        expect(upsertProfile.mock.calls[0][0].where.userId).toBe('user_1');
    });

    it('저장할 때마다 다른 역할의 컬럼을 null 로 정리한다', async () => {
        // PUT 은 body 만으로 검증하고 저장된 행을 읽지 않는다(findUnique 를
        // 호출하지 않는다). 그래서 멘티 -> 멘토로 전환된 회원이 저장할 때도 예전
        // 역할(멘티)의 값이 행에 남아 있을 위험이 있다 — 매 저장이 아홉 개 컬럼을
        // 전부 쓰면서 현재 역할에 없는 항목을 명시적으로 null 로 정리하는지 본다.
        authAs('MENTOR');

        const res = await PUT(putRequest({
            organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
            expertise: '재료공학', careerYears: 10,
        }));

        expect(res.status).toBe(200);
        const update = upsertProfile.mock.calls[0][0].update;
        expect(update.companyName).toBeNull();
        expect(update.industry).toBeNull();
        expect(update.foundedYear).toBeNull();
    });
});

describe('이름 수정', () => {
    const menteeProfile = {
        organization: '가나대', phone: '010-0000-0000', privacyConsent: true,
        companyName: '가나테크', industry: '제조',
    };

    beforeEach(() => authAs('MENTEE'));

    it('name 을 보내면 계정 이름을 바꾼다', async () => {
        const res = await PUT(putRequest({ ...menteeProfile, name: '김명숙' }));

        expect(res.status).toBe(200);
        expect(updateUser).toHaveBeenCalledWith({ where: { id: 'user_1' }, data: { name: '김명숙' } });
    });

    it('name 을 안 보내면 이름을 건드리지 않는다', async () => {
        // 온보딩 화면은 프로필만 보낸다. 그때 이름이 지워지면 안 된다.
        const res = await PUT(putRequest(menteeProfile));

        expect(res.status).toBe(200);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('앞뒤 공백을 다듬어 저장한다', async () => {
        await PUT(putRequest({ ...menteeProfile, name: '  김명숙  ' }));

        expect(updateUser.mock.calls[0][0].data.name).toBe('김명숙');
    });

    it('빈 이름은 막는다', async () => {
        const res = await PUT(putRequest({ ...menteeProfile, name: '' }));

        expect(res.status).toBe(400);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('공백만 친 이름도 막는다', async () => {
        // 이름이 비면 회원 목록·프로젝트 소유자 표시가 전부 빈칸이 된다.
        const res = await PUT(putRequest({ ...menteeProfile, name: '   ' }));

        expect(res.status).toBe(400);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('너무 긴 이름은 막는다', async () => {
        const res = await PUT(putRequest({ ...menteeProfile, name: '가'.repeat(51) }));

        expect(res.status).toBe(400);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('50자까지는 받는다', async () => {
        const res = await PUT(putRequest({ ...menteeProfile, name: '가'.repeat(50) }));

        expect(res.status).toBe(200);
    });

    it('문자열이 아닌 name 은 막는다', async () => {
        const res = await PUT(putRequest({ ...menteeProfile, name: 123 }));

        expect(res.status).toBe(400);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('name 이 섞여 있어도 프로필 검증이 깨지지 않는다', async () => {
        // 프로필 스키마는 strict 라, name 을 떼어내지 않고 넘기면 "알 수 없는
        // 항목" 으로 거부되어 정상적인 저장이 통째로 막힌다.
        const res = await PUT(putRequest({ ...menteeProfile, name: '김명숙' }));

        expect(res.status).toBe(200);
        expect(upsertProfile).toHaveBeenCalled();
    });

    it('이름이 잘못되면 프로필도 저장하지 않는다', async () => {
        const res = await PUT(putRequest({ ...menteeProfile, name: '' }));

        expect(res.status).toBe(400);
        expect(upsertProfile).not.toHaveBeenCalled();
    });
});
