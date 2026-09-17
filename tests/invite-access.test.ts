// 초대 계정의 저장된 이용 기간과 프로그램 종료 경계를 검증한다.
import { describe, expect, it } from 'vitest';
import { inviteAccessExpiresAt, isUserAccessExpired } from '../lib/invite-access';

const day = 86_400_000;
const now = new Date('2026-09-15T00:00:00Z');
const after = (days: number) => new Date(now.getTime() + days * day);
const invite = {
    usedAt: now, accessDurationDays: 90, expiresAt: after(14),
    programId: 'program', program: { endsAt: after(500) },
};

describe('초대 계정 이용 기한', () => {
    it('명시한 이용 기한은 최초 로그인부터 90일을 다시 부여하지 않는다', () => {
        expect(inviteAccessExpiresAt({ ...invite, accessExpiresAt: after(10) })).toEqual(after(10));
        expect(inviteAccessExpiresAt({ ...invite, usedAt: after(5), accessExpiresAt: after(10) })).toEqual(after(10));
    });
    it('명시한 기한이 있어도 미사용 코드 회수를 무시하지 않는다', () => {
        expect(inviteAccessExpiresAt({ ...invite, usedAt: null, expiresAt: after(-1), accessExpiresAt: after(10) })).toEqual(after(-1));
    });
    it('명시한 기한보다 연장된 회원 기한을 보존하되 프로그램 종료를 지킨다', () => {
        expect(inviteAccessExpiresAt({ ...invite, accessExpiresAt: after(10), usedBy: { accessExpiresAt: after(20) } })).toEqual(after(20));
        expect(inviteAccessExpiresAt({ ...invite, accessExpiresAt: after(600) })).toEqual(after(500));
    });
    it.each([1, 30, 90, 365])('저장된 %i일 기간을 최초 사용일부터 계산한다', (days) => {
        expect(inviteAccessExpiresAt({ ...invite, accessDurationDays: days })).toEqual(after(days));
    });
    it('첫 사용 전에는 코드 만료일을 적용한다', () => {
        expect(inviteAccessExpiresAt({ ...invite, usedAt: null })).toEqual(after(14));
    });
    it.each([null, now])('프로그램 종료가 더 빠르면 그 시각을 적용한다', (usedAt) => {
        expect(inviteAccessExpiresAt({ ...invite, usedAt, program: { endsAt: after(3) } })).toEqual(after(3));
    });
    it('기존 계정의 더 짧은 이용 기한을 보존한다', () => {
        expect(inviteAccessExpiresAt({ ...invite, usedBy: { accessExpiresAt: after(5) } })).toEqual(after(5));
    });
    it('관리자가 연장한 기존 계정의 기한을 적용한다', () => {
        expect(inviteAccessExpiresAt({ ...invite, usedBy: { accessExpiresAt: after(400) } })).toEqual(after(400));
    });
    it('관리자가 계정 기한을 연장해도 프로그램 종료를 넘지 않는다', () => {
        expect(inviteAccessExpiresAt({ ...invite, program: { endsAt: after(200) }, usedBy: { accessExpiresAt: after(400) } })).toEqual(after(200));
    });
    it('계정의 기한이 없으면 저장된 초대 기간을 적용한다', () => {
        expect(inviteAccessExpiresAt({ ...invite, usedBy: { accessExpiresAt: null } })).toEqual(after(90));
    });
    it('사용된 코드는 최초 사용 기한이 지나도 재사용 기간까지 유효하다', () => {
        expect(isUserAccessExpired({ accessExpiresAt: null, programId: 'program', usedInviteCode: { ...invite, expiresAt: after(-1) } }, after(20))).toBe(false);
    });
    it.each([
        { programId: 'other', usedInviteCode: invite },
        { programId: 'program', usedInviteCode: { ...invite, usedAt: null } },
    ])('연결 정보가 어긋나면 세션을 거부한다', (connection) => {
        expect(isUserAccessExpired({ accessExpiresAt: null, ...connection }, now)).toBe(true);
    });
    it('만료 직전은 허용하고 만료 시각부터 거부한다', () => {
        const user = { accessExpiresAt: null, programId: 'program', usedInviteCode: invite };
        expect(isUserAccessExpired(user, new Date(after(90).getTime() - 1))).toBe(false);
        expect(isUserAccessExpired(user, after(90))).toBe(true);
    });
    it('일반 계정의 기존 기한 정책을 유지한다', () => {
        expect(isUserAccessExpired({ accessExpiresAt: null }, now)).toBe(false);
        expect(isUserAccessExpired({ accessExpiresAt: after(1) }, now)).toBe(false);
        expect(isUserAccessExpired({ accessExpiresAt: now }, now)).toBe(true);
    });
});
