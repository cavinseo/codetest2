// 여러 초대 이메일을 정리하고 순차 발급 요청의 항목별 결과를 유지한다.
import { z } from 'zod';

export const INVITE_BATCH_LIMIT = 100;
const emailSchema = z.string().email();

export function parseInviteEmails(text: string) {
    const emails: string[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();
    let duplicateCount = 0;
    for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
        const email = token.trim().toLowerCase();
        if (!emailSchema.safeParse(email).success) invalid.push(token);
        else if (seen.has(email)) duplicateCount++;
        else { seen.add(email); emails.push(email); }
    }
    return { emails, invalid, duplicateCount };
}

export type InviteBatchAction = { kind: 'issue'; email: string; programId: string };

export interface InviteBatchResult {
    email: string;
    status: 'sent' | 'issued' | 'failed';
    message: string;
    code?: string;
}

export async function runInviteBatch(
    actions: InviteBatchAction[],
    onResult?: (result: InviteBatchResult) => void,
    shouldContinue: () => boolean = () => true,
): Promise<InviteBatchResult[]> {
    if (actions.length > INVITE_BATCH_LIMIT) throw new Error(`한 번에 최대 ${INVITE_BATCH_LIMIT}명까지 처리할 수 있습니다.`);
    const results: InviteBatchResult[] = [];
    for (const action of actions) {
        if (!shouldContinue()) break;
        let result: InviteBatchResult;
        try {
            const response = await fetch('/api/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: action.email, role: 'MENTEE', programId: action.programId }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.success) {
                result = { email: action.email, status: 'failed', message: data?.error || '처리 결과를 확인하지 못했습니다. 목록을 새로고침해 확인하세요.' };
            } else if (data.emailSent) {
                result = { email: action.email, status: 'sent', code: data.code, message: '코드 발급 및 메일 발송 완료.' };
            } else {
                result = { email: action.email, status: 'issued', code: data.code, message: data.code
                    ? '코드 발급 완료 · 메일 발송 실패. 코드를 직접 전달하세요.'
                    : '코드 발급 완료 · 메일 발송 실패. 목록에서 메일을 재발송하거나 관리자에게 문의하세요.' };
            }
        } catch {
            // 응답을 받지 못해도 서버가 이미 발급했을 수 있으므로 자동 재시도하지 않는다.
            result = { email: action.email, status: 'failed', message: '처리 결과를 확인하지 못했습니다. 연결 상태와 초대 목록을 확인하세요.' };
        }
        results.push(result);
        onResult?.(result);
    }
    return results;
}
