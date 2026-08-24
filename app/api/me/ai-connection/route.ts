// 본인 AI 키 연결의 조회·저장·삭제. /api/me/profile 과 같은 원칙 —
// 경로에 userId 를 받지 않고 세션의 userId 만 쓴다.
//
// 키는 응답에 어떤 형태로도 담지 않는다. 저장 후에는 "등록됨" 사실만 보인다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { parsePersonalAiVendor } from '@/lib/ai/personal-vendors';
import {
    deletePersonalConnection,
    getPersonalConnectionSummary,
    upsertPersonalConnection,
} from '@/lib/ai/personal-store';

const log = createLogger('api/me/ai-connection');

const putSchema = z.object({
    vendor: z.string(),
    apiKey: z.string().trim().min(1).max(500).optional(),
    model: z.string().trim().max(100).optional(),
});

export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        return NextResponse.json({
            connection: await getPersonalConnectionSummary(authResult.userId),
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: 'AI 연결 정보를 불러오지 못했습니다.' });
    }
}

export async function PUT(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const parsed = putSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: '입력 형식이 올바르지 않습니다.' }, { status: 400 });
        }

        const vendor = parsePersonalAiVendor(parsed.data.vendor);
        if (!vendor) {
            return NextResponse.json({ error: '지원하지 않는 벤더입니다.' }, { status: 400 });
        }

        const existing = await getPersonalConnectionSummary(authResult.userId);
        // 새 등록이거나 벤더를 바꿀 때는 그 벤더의 키가 반드시 필요하다.
        // 이전 벤더의 키를 새 벤더에 이어 붙이면 인증만 조용히 깨진다.
        if (!parsed.data.apiKey && (!existing || existing.vendor !== vendor)) {
            return NextResponse.json({ error: 'API 키를 입력하세요.' }, { status: 400 });
        }

        await upsertPersonalConnection(authResult.userId, {
            vendor,
            apiKey: parsed.data.apiKey,
            model: parsed.data.model?.trim() || null,
        });

        // 키 값은 로그에도 응답에도 싣지 않는다.
        log.info('개인 AI 연결 저장', { userId: authResult.userId, vendor });
        return NextResponse.json({
            connection: await getPersonalConnectionSummary(authResult.userId),
        });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: 'AI 연결을 저장하지 못했습니다.' });
    }
}

export async function DELETE(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        await deletePersonalConnection(authResult.userId);
        log.info('개인 AI 연결 삭제', { userId: authResult.userId });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return toErrorResponse(error, { log, message: 'AI 연결을 삭제하지 못했습니다.' });
    }
}
