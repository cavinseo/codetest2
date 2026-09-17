// 초대 날짜의 유효성 및 한국 시간의 마지막 밀리초를 검증한다.
import { describe, expect, it } from 'vitest';
import { formatInviteExpiryDate, inviteExpirySchema } from '../lib/invite-expiry';

describe('초대 기한 날짜', () => {
    it.each([undefined, null, '', '2026-02-30', '2026-13-01', '2026-9-1', '2026-09-30T00:00:00Z'])('잘못된 입력 %s를 거부한다', (value) => {
        expect(inviteExpirySchema.safeParse(value).success).toBe(false);
    });
    it('윤년 날짜를 허용하고 한국 시간의 하루 끝으로 변환한다', () => {
        expect(inviteExpirySchema.parse('2028-02-29')).toEqual(new Date('2028-02-29T14:59:59.999Z'));
    });
    it('한국 자정 경계 전후와 연말 날짜를 표시한다', () => {
        expect(formatInviteExpiryDate('2026-12-31T14:59:59.999Z')).toBe('2026-12-31');
        expect(formatInviteExpiryDate(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
    });
});
