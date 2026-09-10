// 초대 회원의 90일 상한과 프로그램 종료 경계를 검증한다.
import { describe, expect, it } from 'vitest';
import { inviteAccessExpiresAt, isUserAccessExpired } from '../lib/invite-access';

const usedAt = new Date('2026-01-01T00:00:00Z');
const expiresAt = new Date('2026-01-14T00:00:00Z');
const program = { endsAt: new Date('2026-12-31T00:00:00Z') };
describe('초대 회원 이용 기한', () => {
    it('사용한 코드의 과거 가입 기한을 무시하고 90일로 계산한다', () => {
        expect(inviteAccessExpiresAt({ usedAt, expiresAt, program }).toISOString()).toBe('2026-04-01T00:00:00.000Z');
    });
    it('미사용 코드는 기존 가입 기한을 유지한다', () => {
        expect(inviteAccessExpiresAt({ usedAt: null, expiresAt, program })).toEqual(expiresAt);
    });
    it('프로그램 종료가 빠르면 그 시각에 만료된다', () => {
        const end = new Date('2026-02-01T00:00:00Z');
        expect(inviteAccessExpiresAt({ usedAt, expiresAt, program: { endsAt: end } })).toEqual(end);
    });
    it('기존 짧은 회원 기한을 연장하지 않는다', () => {
        expect(inviteAccessExpiresAt({ usedAt, expiresAt, program, usedBy: { accessExpiresAt: expiresAt } })).toEqual(expiresAt);
    });
    it('프로그램 변경과 만료 시각 도달을 기존 세션에서도 막는다', () => {
        const user = { accessExpiresAt: null, programId: 'p', usedInviteCode: { usedAt, expiresAt, program, programId: 'p' } };
        expect(isUserAccessExpired(user, new Date('2026-04-01T00:00:00Z'))).toBe(true);
        expect(isUserAccessExpired(user, new Date('2026-03-31T23:59:59Z'))).toBe(false);
        expect(isUserAccessExpired({ ...user, programId: 'other' }, usedAt)).toBe(true);
    });
    it('비초대 계정의 기존 기간을 유지한다', () => {
        expect(isUserAccessExpired({ accessExpiresAt: null }, usedAt)).toBe(false);
        expect(isUserAccessExpired({ accessExpiresAt: expiresAt }, expiresAt)).toBe(true);
    });
});
