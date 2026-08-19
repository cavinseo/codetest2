// 비밀번호 변경 규칙. API 와 화면이 같은 기준을 쓰도록 한 곳에 모아 둔다.

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordChangeInput {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}

/**
 * 새 비밀번호가 규칙에 맞는지 본다. 문제가 없으면 null 을 돌려준다.
 * 현재 비밀번호가 맞는지는 여기서 알 수 없으므로 서버에서 따로 확인한다.
 */
export function getPasswordChangeError(input: PasswordChangeInput): string | null {
    const { currentPassword, newPassword, confirmPassword } = input;

    if (!currentPassword) return '현재 비밀번호를 입력하세요.';
    if (!newPassword) return '새 비밀번호를 입력하세요.';
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
        return `새 비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
    }
    if (newPassword === currentPassword) {
        return '새 비밀번호가 현재 비밀번호와 같습니다.';
    }
    if (newPassword !== confirmPassword) {
        return '새 비밀번호와 확인 값이 다릅니다.';
    }
    return null;
}
