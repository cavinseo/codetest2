// 초대 기한의 날짜 입력과 표시를 한국 시간 기준으로 통일한다.
import { z } from 'zod';

export const inviteExpirySchema = z.string({ required_error: '이용 기한을 입력하세요.' })
    .date('올바른 이용 기한 날짜를 입력하세요.')
    .transform((value) => new Date(`${value}T23:59:59.999+09:00`));

export function formatInviteExpiryDate(value: string | Date): string {
    return new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
