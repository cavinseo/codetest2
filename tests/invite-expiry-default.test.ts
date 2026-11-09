// 초대 발행 폼의 기본 최초 접속 기한을 한국 시간과 프로그램 종료일 기준으로 검증한다.
import { describe, expect, it } from 'vitest';
import { defaultInviteExpiryDate, DEFAULT_INVITE_EXPIRY_DAYS, endOfProgramDay } from '../lib/invite-expiry';

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

describe('endOfProgramDay', () => {
    it('날짜 입력에서 만든 UTC 자정과 이미 하루 끝인 값을 모두 한국 시간 그날의 끝으로 맞춘다', () => {
        const end = new Date('2026-12-31T23:59:59.999+09:00');
        expect(endOfProgramDay(new Date('2026-12-31'))).toEqual(end);
        expect(endOfProgramDay(end)).toEqual(end);
        // 한국 시간 새벽(UTC 전날)도 한국 날짜 기준으로 맞춘다.
        expect(endOfProgramDay(new Date('2026-12-30T15:00:00.000Z'))).toEqual(end);
    });
});
