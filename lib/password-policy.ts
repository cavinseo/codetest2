// 비밀번호 변경 규칙. API 와 화면이 같은 기준을 쓰도록 한 곳에 모아 둔다.

export const PASSWORD_MIN_LENGTH = 8;

export interface NewPasswordInput {
    newPassword: string;
    confirmPassword: string;
}

export interface PasswordChangeInput extends NewPasswordInput {
    currentPassword: string;
}

/**
 * 새 비밀번호가 규칙에 맞는지 본다. 문제가 없으면 null 을 돌려준다.
 * 현재 비밀번호가 맞는지는 여기서 알 수 없으므로 서버에서 따로 확인한다.
 */
export function getNewPasswordError(input: NewPasswordInput): string | null {
    const { newPassword, confirmPassword } = input;
    if (!newPassword) return '새 비밀번호를 입력하세요.';
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
        return `새 비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
    }
    if (newPassword !== confirmPassword) {
        return '새 비밀번호와 확인 값이 다릅니다.';
    }
    return null;
}

export function getPasswordChangeError(input: PasswordChangeInput): string | null {
    if (!input.currentPassword) return '현재 비밀번호를 입력하세요.';
    const newPasswordError = getNewPasswordError(input);
    // 기존 오류 순서인 현재값 → 길이 → 같은 비밀번호 → 확인값을 유지한다.
    if (input.newPassword.length >= PASSWORD_MIN_LENGTH && input.newPassword === input.currentPassword) {
        return '새 비밀번호가 현재 비밀번호와 같습니다.';
    }
    return newPasswordError;
}
