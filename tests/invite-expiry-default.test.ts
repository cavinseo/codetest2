// 초대 발행 폼의 기본 최초 접속 기한을 한국 시간과 프로그램 종료일 기준으로 검증한다.
import { expect, it } from 'vitest';
import { defaultInviteExpiryDate, DEFAULT_INVITE_EXPIRY_DAYS } from '../lib/invite-expiry';

const farEnd = '2099-12-31T14:59:59.999Z';

it('기본 기한은 1주일이다', () => {
    expect(DEFAULT_INVITE_EXPIRY_DAYS).toBe(7);
});

it('한국 날짜 기준으로 7일 뒤를 돌려준다', () => {
    // UTC 로는 9월 16일이지만 한국은 이미 9월 17일이다.
    expect(defaultInviteExpiryDate(farEnd, new Date('2026-09-16T15:30:00Z'))).toBe('2026-09-24');
    expect(defaultInviteExpiryDate(farEnd, new Date('2026-09-16T14:30:00Z'))).toBe('2026-09-23');
});

it('프로그램 종료일을 넘기지 않는다', () => {
    const now = new Date('2026-09-16T15:30:00Z');
    expect(defaultInviteExpiryDate('2026-09-20T14:59:59.999Z', now)).toBe('2026-09-20');
    expect(defaultInviteExpiryDate('2026-09-24T14:59:59.999Z', now)).toBe('2026-09-24');
});
