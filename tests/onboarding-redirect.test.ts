// 온보딩 관문이 낸 403 만 골라내고, 이미 온보딩 화면이면 다시 보내지 않는지 확인한다.
import { describe, expect, it } from 'vitest';
import { isOnboardingBlock, shouldRedirectToOnboarding } from '../lib/onboarding-redirect';

const BLOCK = { error: '온보딩을 먼저 마쳐야 합니다.', code: 'onboarding_required' };

describe('isOnboardingBlock', () => {
    it('403 이고 code 가 onboarding_required 면 참이다', () => {
        expect(isOnboardingBlock(403, BLOCK)).toBe(true);
    });

    it('상태가 403 이 아니면 거짓이다', () => {
        expect(isOnboardingBlock(401, BLOCK)).toBe(false);
        expect(isOnboardingBlock(200, BLOCK)).toBe(false);
    });

    it('403 이어도 code 가 다르면 거짓이다', () => {
        // 승인 대기·기간 만료도 403 이다. 그 응답까지 온보딩으로 보내면 안 된다.
        expect(isOnboardingBlock(403, { error: '관리자 승인 대기 중인 계정입니다.' })).toBe(false);
        expect(isOnboardingBlock(403, { code: 'something_else' })).toBe(false);
    });

    it('본문이 객체가 아니면 거짓이다', () => {
        expect(isOnboardingBlock(403, null)).toBe(false);
        expect(isOnboardingBlock(403, undefined)).toBe(false);
        expect(isOnboardingBlock(403, 'onboarding_required')).toBe(false);
        expect(isOnboardingBlock(403, ['onboarding_required'])).toBe(false);
    });
});

describe('shouldRedirectToOnboarding', () => {
    it('일반 화면에서 관문에 막히면 보낸다', () => {
        expect(shouldRedirectToOnboarding('/dashboard', 403, BLOCK)).toBe(true);
        expect(shouldRedirectToOnboarding('/project/abc', 403, BLOCK)).toBe(true);
    });

    it('이미 온보딩 화면이면 보내지 않는다', () => {
        // 온보딩 화면 자신도 403 을 받을 수 있다. 그때 또 보내면 무한 이동이 된다.
        expect(shouldRedirectToOnboarding('/onboarding', 403, BLOCK)).toBe(false);
    });

    it('로그인·가입 화면에서도 보내지 않는다', () => {
        expect(shouldRedirectToOnboarding('/login', 403, BLOCK)).toBe(false);
        expect(shouldRedirectToOnboarding('/signup', 403, BLOCK)).toBe(false);
    });

    it('예외 경로의 하위 경로도 보내지 않는다', () => {
        expect(shouldRedirectToOnboarding('/onboarding/step2', 403, BLOCK)).toBe(false);
    });

    it('예외 경로와 앞부분만 같은 경로는 보낸다', () => {
        // '/loginsomething' 이 '/login' 으로 시작한다고 예외가 되면 안 된다.
        expect(shouldRedirectToOnboarding('/loginsomething', 403, BLOCK)).toBe(true);
    });

    it('관문이 아닌 403 은 보내지 않는다', () => {
        expect(shouldRedirectToOnboarding('/dashboard', 403, { error: '권한이 없습니다.' })).toBe(false);
    });
});
