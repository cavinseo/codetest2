import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH, getPasswordChangeError } from '../lib/password-policy';

const valid = {
    currentPassword: 'wlsdnjs#2484',
    newPassword: 'NewTemp1234!',
    confirmPassword: 'NewTemp1234!',
};

describe('getPasswordChangeError', () => {
    it('규칙을 모두 만족하면 오류가 없다', () => {
        expect(getPasswordChangeError(valid)).toBeNull();
    });

    it('현재 비밀번호가 비면 막는다', () => {
        expect(getPasswordChangeError({ ...valid, currentPassword: '' }))
            .toBe('현재 비밀번호를 입력하세요.');
    });

    it('새 비밀번호가 비면 막는다', () => {
        expect(getPasswordChangeError({ ...valid, newPassword: '', confirmPassword: '' }))
            .toBe('새 비밀번호를 입력하세요.');
    });

    it('최소 길이보다 짧으면 막는다', () => {
        const short = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);
        expect(getPasswordChangeError({ ...valid, newPassword: short, confirmPassword: short }))
            .toBe(`새 비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`);
    });

    it('최소 길이와 같으면 통과한다', () => {
        const exact = 'a'.repeat(PASSWORD_MIN_LENGTH);
        expect(getPasswordChangeError({ ...valid, newPassword: exact, confirmPassword: exact }))
            .toBeNull();
    });

    it('현재 비밀번호와 같으면 막는다', () => {
        expect(getPasswordChangeError({
            currentPassword: 'SamePass123',
            newPassword: 'SamePass123',
            confirmPassword: 'SamePass123',
        })).toBe('새 비밀번호가 현재 비밀번호와 같습니다.');
    });

    it('확인 값이 다르면 막는다', () => {
        expect(getPasswordChangeError({ ...valid, confirmPassword: 'Different123!' }))
            .toBe('새 비밀번호와 확인 값이 다릅니다.');
    });

    it('길이 검사를 확인 값 일치보다 먼저 본다', () => {
        // 둘 다 틀렸을 때 더 구체적인 길이 오류를 먼저 보여준다.
        expect(getPasswordChangeError({ ...valid, newPassword: 'short', confirmPassword: 'other' }))
            .toContain('최소');
    });
});
