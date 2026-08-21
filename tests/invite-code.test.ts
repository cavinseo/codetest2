import { describe, expect, it } from 'vitest';
import {
    INVITE_CODE_VALID_DAYS,
    buildInviteEmail,
    checkInviteCode,
    generateInviteCode,
    inviteCodeExpiryFrom,
    normalizeInviteCode,
    type InviteCodeRecord,
} from '../lib/invite-code';
import { escapeHtml } from '../lib/html-escape';

describe('generateInviteCode', () => {
    it('KSQF-XXXX-XXXX-XXXX 형태로 만든다', () => {
        expect(generateInviteCode()).toMatch(/^KSQF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('헷갈리는 글자를 쓰지 않는다', () => {
        // 메일에서 옮겨 적을 때 0/O, 1/I/L 을 혼동하지 않도록 뺐다.
        const body = Array.from({ length: 50 }, () => generateInviteCode())
            .join('')
            .replace(/KSQF|-/g, '');

        expect(body).not.toMatch(/[OIL01]/);
    });

    it('매번 다른 값을 만든다', () => {
        const codes = new Set(Array.from({ length: 200 }, () => generateInviteCode()));

        expect(codes.size).toBe(200);
    });
});

describe('normalizeInviteCode', () => {
    it('사용자가 붙여넣은 형태 차이를 흡수한다', () => {
        const expected = 'KSQF-ABCD-EFGH-JKMN';

        expect(normalizeInviteCode('KSQF-ABCD-EFGH-JKMN')).toBe(expected);
        expect(normalizeInviteCode('ksqf-abcd-efgh-jkmn')).toBe(expected);
        expect(normalizeInviteCode('  KSQF ABCD EFGH JKMN  ')).toBe(expected);
        expect(normalizeInviteCode('ABCDEFGHJKMN')).toBe(expected);
        expect(normalizeInviteCode('abcd efgh jkmn')).toBe(expected);
    });

    it('생성한 코드를 정규화해도 그대로다', () => {
        const code = generateInviteCode();

        expect(normalizeInviteCode(code)).toBe(code);
    });
});

describe('inviteCodeExpiryFrom', () => {
    it('기본 사용 기한은 14일이다', () => {
        expect(INVITE_CODE_VALID_DAYS).toBe(14);

        const expiry = inviteCodeExpiryFrom(new Date('2026-01-01T00:00:00Z'));

        expect(expiry.toISOString().slice(0, 10)).toBe('2026-01-15');
    });
});

describe('checkInviteCode', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const valid: InviteCodeRecord = {
        email: 'mentee@example.com',
        role: 'MENTEE',
        expiresAt: new Date('2026-06-10T00:00:00Z'),
        usedAt: null,
    };

    it('정상 코드는 통과시킨다', () => {
        expect(checkInviteCode(valid, 'mentee@example.com', now)).toBeNull();
    });

    it('없는 코드를 막는다', () => {
        expect(checkInviteCode(null, 'mentee@example.com', now)).toBe('NOT_FOUND');
    });

    it('이미 쓴 코드를 막는다', () => {
        const used = { ...valid, usedAt: new Date('2026-05-20T00:00:00Z') };

        expect(checkInviteCode(used, 'mentee@example.com', now)).toBe('ALREADY_USED');
    });

    it('기한이 지난 코드를 막는다', () => {
        const expired = { ...valid, expiresAt: new Date('2026-05-31T23:59:59Z') };

        expect(checkInviteCode(expired, 'mentee@example.com', now)).toBe('EXPIRED');
    });

    it('만료 시각 정각에는 이미 만료로 본다', () => {
        // 경계값. expiresAt === now 일 때 <= 라 EXPIRED 다. < 로 바뀌면 통과해
        // 버려 만료 코드가 정각 한 순간 되살아난다.
        const atBoundary = { ...valid, expiresAt: new Date(now) };

        expect(checkInviteCode(atBoundary, 'mentee@example.com', now)).toBe('EXPIRED');
    });

    it('만료 1밀리초 전에는 통과시킨다', () => {
        const justBefore = { ...valid, expiresAt: new Date(now.getTime() + 1) };

        expect(checkInviteCode(justBefore, 'mentee@example.com', now)).toBeNull();
    });

    it('다른 이메일로는 쓸 수 없다', () => {
        // 코드가 메일로 나가므로 전달·유출되면 제3자가 쓸 수 있다. 주소로 묶는다.
        expect(checkInviteCode(valid, 'someone-else@example.com', now)).toBe('EMAIL_MISMATCH');
    });

    it('이메일 대소문자와 공백 차이는 무시한다', () => {
        expect(checkInviteCode(valid, '  MENTEE@Example.com ', now)).toBeNull();
    });

    it('발급 대상 이메일 쪽 대소문자·공백도 정규화해 대조한다', () => {
        // 관리자가 코드를 발급할 때 이메일을 대문자나 공백과 함께 넣을 수 있다.
        // record.email 쪽을 정규화하지 않으면 정상 가입이 EMAIL_MISMATCH 로 막힌다.
        const messyRecord = { ...valid, email: '  Mentee@Example.COM  ' };

        expect(checkInviteCode(messyRecord, 'mentee@example.com', now)).toBeNull();
    });

    it('사용 여부를 기한보다 먼저 본다', () => {
        // 둘 다 문제면 "이미 사용됨"이 더 정확한 안내다.
        const both = { ...valid, usedAt: new Date('2026-01-01'), expiresAt: new Date('2026-01-02') };

        expect(checkInviteCode(both, 'mentee@example.com', now)).toBe('ALREADY_USED');
    });
});

describe('buildInviteEmail', () => {
    const params = {
        code: 'KSQF-ABCD-EFGH-JKMN',
        roleLabel: '멘티',
        expiresAt: new Date('2026-06-15T00:00:00Z'),
        accessDurationDays: 90,
        signupUrl: 'https://example.com/signup',
        escapeHtml,
    };

    it('코드와 기한, 이용 기간을 본문에 담는다', () => {
        const { subject, html } = buildInviteEmail(params);

        expect(subject).toContain('멘티');
        expect(html).toContain('KSQF-ABCD-EFGH-JKMN');
        expect(html).toContain('2026-06-15');
        expect(html).toContain('90일');
    });

    it('발급 대상 주소로만 가입 가능함을 알린다', () => {
        expect(buildInviteEmail(params).html).toContain('받은 주소로만');
    });

    it('역할 이름을 이스케이프한다', () => {
        const injected = buildInviteEmail({ ...params, roleLabel: '<img src=x onerror=alert(1)>' });

        expect(injected.html).not.toContain('<img');
        expect(injected.html).toContain('&lt;img');
    });
});
