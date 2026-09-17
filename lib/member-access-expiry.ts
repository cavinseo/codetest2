// 회원 이용만료일의 날짜 입력과 초대 기한 하한을 검증한다.
import { z } from 'zod';
import { formatInviteExpiryDate } from './invite-expiry';

export const memberAccessExpirySchema = z.string({ required_error: '이용만료일을 입력하세요.' })
    .date('올바른 이용만료일을 입력하세요.')
    .transform(value => new Date(`${value}T23:59:59.999+09:00`));

export function getMemberAccessExpiryError(value: string, inviteExpiresAt?: string | null): string {
    if (!value) return '이용만료일을 입력하세요.';
    if (!memberAccessExpirySchema.safeParse(value).success) return '올바른 이용만료일을 입력하세요.';
    if (inviteExpiresAt && value < formatInviteExpiryDate(inviteExpiresAt)) {
        return '이용만료일은 초대 코드의 최초 접속 기한보다 빠를 수 없습니다.';
    }
    return '';
}
