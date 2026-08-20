import { NextRequest, NextResponse } from 'next/server';
import { getProviderStatuses } from '@/lib/ai/registry';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { getAiSettings } from '@/lib/service-settings';

const log = createLogger('api/ai/status');

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireAuth(request);
        if (authResult instanceof NextResponse) return authResult;

        const settings = getAiSettings();
        const providers = await getProviderStatuses();

        return NextResponse.json({
            // 설정된 엔진이 지금 실제로 붙는지까지 함께 알려준다.
            selected: settings.provider,
            providers,
        });
    } catch (error: unknown) {
        log.error('AI status lookup failed', error);
        return NextResponse.json({ error: 'AI status lookup failed.' }, { status: 500 });
    }
}
