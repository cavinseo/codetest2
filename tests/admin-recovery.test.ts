// 관리자 계정 복구 진단이 앱의 실제 관문(로그인·관리자 게이트)과 같은 답을 내는지 검증하는 테스트입니다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    describeDatabase,
    diagnoseAdminAccess,
    findMissingAdminEmails,
    parseAdminEmails,
    summarizeAdminCandidates,
} from '../scripts/admin-recovery.mjs';
import { hasAdminAccess } from '../lib/authorization';
import { isAccessExpired, type MemberRole } from '../lib/member-roles';

// lib/authorization 은 prisma 를 끌고 온다. 여기서는 순수 판정만 쓰므로 연결을 막는다.
vi.mock('../lib/prisma', () => ({
    prisma: { user: { findUnique: vi.fn() }, project: { findUnique: vi.fn() } },
}));

const NOW = new Date('2026-09-02T00:00:00Z');

function user(overrides: Partial<Parameters<typeof diagnoseAdminAccess>[0]> = {}) {
    return {
        email: 'admin@example.com',
        name: '관리자',
        status: 'APPROVED',
        isAdmin: true,
        role: 'ADMIN',
        accessExpiresAt: null,
        ...overrides,
    };
}

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('parseAdminEmails', () => {
    it('쉼표로 나누고 공백과 대소문자를 정리한다', () => {
        expect(parseAdminEmails(' A@x.com , b@X.com ')).toEqual(['a@x.com', 'b@x.com']);
    });

    it('비어 있거나 없는 값은 빈 목록이다', () => {
        expect(parseAdminEmails('')).toEqual([]);
        expect(parseAdminEmails(undefined)).toEqual([]);
        expect(parseAdminEmails(', ,')).toEqual([]);
    });
});

describe('diagnoseAdminAccess', () => {
    it('역할·플래그·승인이 모두 맞으면 들어갈 수 있다', () => {
        const result = diagnoseAdminAccess(user(), [], NOW);
        expect(result.canEnterAdminMode).toBe(true);
        expect(result.blockers).toEqual([]);
    });

    it('isAdmin 이 꺼져 있어도 ADMIN_EMAILS 에 있으면 들어갈 수 있다', () => {
        const result = diagnoseAdminAccess(user({ isAdmin: false }), ['admin@example.com'], NOW);
        expect(result.canEnterAdminMode).toBe(true);
    });

    it('이메일 대소문자가 달라도 ADMIN_EMAILS 로 인정한다', () => {
        const result = diagnoseAdminAccess(user({ email: 'Admin@Example.com', isAdmin: false }), ['admin@example.com'], NOW);
        expect(result.canEnterAdminMode).toBe(true);
    });

    it('isAdmin 도 ADMIN_EMAILS 도 없으면 막히고 이유를 알린다', () => {
        const result = diagnoseAdminAccess(user({ isAdmin: false }), [], NOW);
        expect(result.canEnterAdminMode).toBe(false);
        expect(result.blockers).toContain('isAdmin 플래그가 꺼져 있고 ADMIN_EMAILS 에도 없다.');
    });

    it('역할이 ADMIN 이 아니면 isAdmin 이 켜져 있어도 막힌다', () => {
        const result = diagnoseAdminAccess(user({ role: 'MENTEE' }), ['admin@example.com'], NOW);
        expect(result.canEnterAdminMode).toBe(false);
        expect(result.blockers).toEqual(['시스템 역할이 MENTEE 다. 관리자 모드는 role=ADMIN 만 통과한다.']);
    });

    it('승인 전 계정은 로그인 단계에서 막힌다고 알린다', () => {
        const result = diagnoseAdminAccess(user({ status: 'PENDING' }), [], NOW);
        expect(result.canEnterAdminMode).toBe(false);
        expect(result.blockers).toContain('status 가 PENDING 라 로그인 자체가 거부된다.');
    });

    it('이용 기간이 지났으면 막힌다', () => {
        const expired = diagnoseAdminAccess(user({ accessExpiresAt: new Date('2026-09-01T23:59:59Z') }), [], NOW);
        expect(expired.canEnterAdminMode).toBe(false);
        expect(expired.blockers).toContain('이용 기간이 만료돼 로그인이 거부된다.');
    });

    it('이용 기간이 남았으면 막지 않는다', () => {
        const alive = diagnoseAdminAccess(user({ accessExpiresAt: new Date('2026-09-02T00:00:01Z') }), [], NOW);
        expect(alive.canEnterAdminMode).toBe(true);
    });

    it('만료 판정이 lib/member-roles 의 isAccessExpired 와 같다', () => {
        const cases = [null, new Date(NOW.getTime() - 1), new Date(NOW.getTime()), new Date(NOW.getTime() + 1)];

        for (const accessExpiresAt of cases) {
            const blocked = diagnoseAdminAccess(user({ accessExpiresAt }), [], NOW).blockers.includes(
                '이용 기간이 만료돼 로그인이 거부된다.'
            );
            expect(blocked, `accessExpiresAt=${accessExpiresAt}`).toBe(isAccessExpired(accessExpiresAt, NOW));
        }
    });

    it('관리자 게이트 판정이 lib/authorization 의 hasAdminAccess 와 같다', () => {
        // 개발용 우회(ALLOW_DEV_ADMIN)가 답을 흐리지 않도록 배포 환경으로 고정한다.
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('ADMIN_EMAILS', 'listed@example.com');
        const adminEmails = parseAdminEmails('listed@example.com');
        const roles: MemberRole[] = ['ADMIN', 'PROGRAM_MANAGER', 'MENTOR', 'MENTEE'];

        for (const role of roles) {
            for (const isAdmin of [true, false]) {
                for (const email of ['listed@example.com', 'other@example.com']) {
                    // 승인·기간은 관리자 게이트의 관심사가 아니므로 통과 상태로 두고 비교한다.
                    const account = user({ role, isAdmin, email });
                    expect(
                        diagnoseAdminAccess(account, adminEmails, NOW).canEnterAdminMode,
                        `${role}/${isAdmin}/${email}`
                    ).toBe(hasAdminAccess({ email, isAdmin, role }));
                }
            }
        }
    });
});

describe('summarizeAdminCandidates', () => {
    const users = [
        user({ email: 'broken@example.com', role: 'MENTEE', isAdmin: true }),
        user({ email: 'plain@example.com', role: 'MENTEE', isAdmin: false }),
        user({ email: 'zulu@example.com' }),
        user({ email: 'alpha@example.com' }),
        user({ email: 'listed@example.com', role: 'ADMIN', isAdmin: false }),
    ];

    it('관리자와 무관한 계정은 목록에서 뺀다', () => {
        const emails = summarizeAdminCandidates(users, [], NOW).map((row) => row.email);
        expect(emails).not.toContain('plain@example.com');
    });

    it('ADMIN_EMAILS 로만 걸리는 계정도 후보로 남긴다', () => {
        const emails = summarizeAdminCandidates(
            [user({ email: 'plain@example.com', role: 'MENTEE', isAdmin: false })],
            ['plain@example.com'],
            NOW
        ).map((row) => row.email);
        expect(emails).toEqual(['plain@example.com']);
    });

    it('들어갈 수 있는 계정을 먼저, 같은 처지면 이메일 순으로 놓는다', () => {
        const emails = summarizeAdminCandidates(users, ['listed@example.com'], NOW).map((row) => row.email);
        expect(emails).toEqual([
            'alpha@example.com',
            'listed@example.com',
            'zulu@example.com',
            'broken@example.com',
        ]);
    });

    it('원래 필드를 지우지 않고 진단만 덧붙인다', () => {
        const [row] = summarizeAdminCandidates([user({ name: '홍길동' })], [], NOW);
        expect(row.name).toBe('홍길동');
        expect(row.canEnterAdminMode).toBe(true);
    });
});

describe('findMissingAdminEmails', () => {
    it('계정이 없는 주소만 돌려준다', () => {
        const users = [user({ email: 'Here@example.com' })];
        expect(findMissingAdminEmails(users, ['here@example.com', 'gone@example.com'])).toEqual([
            'gone@example.com',
        ]);
    });

    it('모두 계정이 있으면 빈 목록이다', () => {
        expect(findMissingAdminEmails([user({ email: 'here@example.com' })], ['here@example.com'])).toEqual([]);
    });
});

describe('describeDatabase', () => {
    it('접속 문자열의 비밀번호를 보여주지 않는다', () => {
        const shown = describeDatabase('postgresql://user:s3cret@db.example.com:5432/postgres?schema=public');
        expect(shown).toBe('db.example.com:5432/postgres');
        expect(shown).not.toContain('s3cret');
    });

    it('포트가 없으면 호스트와 경로만 보여준다', () => {
        expect(describeDatabase('postgresql://user:pw@db.example.com/postgres')).toBe('db.example.com/postgres');
    });

    it('값이 없거나 형식을 모르면 그렇다고 말한다', () => {
        expect(describeDatabase(undefined)).toBe('(설정되지 않음)');
        expect(describeDatabase('')).toBe('(설정되지 않음)');
        expect(describeDatabase('not-a-url')).toBe('(형식을 알 수 없는 접속 문자열)');
    });
});
