// 본인의 AI 연결을 확인한다. rule 모드는 외부 요청 없이 즉시 성공한다.
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
        const connection = await loadPersonalConnection(authResult.userId) ?? {
            mode: 'rule' as const,
            vendor: null,
            apiKey: null,
            model: null,
            mcpBaseUrl: null,
            mcpModel: null,
            localBaseUrl: null,
            localModel: null,
        };

        const result = await verifyPersonalConnection(connection);
        log.info('개인 AI 연결 확인', { userId: authResult.userId, ok: result.ok });
        return NextResponse.json(result);
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: '연결 확인에 실패했습니다.' });
    }
}
