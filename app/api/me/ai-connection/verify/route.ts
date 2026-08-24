// 등록된 본인 키가 실제로 통하는지 확인한다(짧은 요청 1회 — 비용은 사실상 0원).
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { verifyPersonalConnection } from '@/lib/ai/personal';
import { loadPersonalConnection } from '@/lib/ai/personal-store';

const log = createLogger('api/me/ai-connection/verify');

export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const connection = await loadPersonalConnection(authResult.userId);
        if (!connection) {
            return NextResponse.json(
                { error: '등록된 AI 키가 없습니다. 먼저 키를 저장하세요.' },
                { status: 400 }
            );
        }

        const result = await verifyPersonalConnection(connection);
        log.info('개인 AI 연결 확인', { userId: authResult.userId, ok: result.ok });
        return NextResponse.json(result);
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '연결 확인에 실패했습니다.' });
    }
}
