// 본인 AI 키 연결의 조회·저장·삭제. /api/me/profile 과 같은 원칙 —
// 경로에 userId 를 받지 않고 세션의 userId 만 쓴다.
//
// 키는 응답에 어떤 형태로도 담지 않는다. 저장 후에는 "등록됨" 사실만 보인다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { assertAllowedBaseUrl } from '@/lib/ai/openai-compatible';
import { parseMemberAiMode, parsePersonalAiVendor } from '@/lib/ai/personal-vendors';
import {
    deletePersonalConnection,
    getPersonalConnectionSummary,
    upsertPersonalConnection,
} from '@/lib/ai/personal-store';
import { assertPublicHttpsUrl, RemoteUrlError } from '@/lib/ai/url-guard';

const log = createLogger('api/me/ai-connection');

const putSchema = z.object({
    mode: z.unknown(),
    vendor: z.string().optional(),
    apiKey: z.string().trim().min(1).max(500).optional(),
    model: z.string().trim().max(100).optional(),
    mcpBaseUrl: z.string().trim().max(1000).optional(),
    mcpModel: z.string().trim().max(100).optional(),
    localBaseUrl: z.string().trim().max(1000).optional(),
    localModel: z.string().trim().max(100).optional(),
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

        const mode = parseMemberAiMode(parsed.data.mode);
        if (!mode) {
            return NextResponse.json({ error: '지원하지 않는 AI 연결 모드입니다.' }, { status: 400 });
        }

        switch (mode) {
            case 'api': {
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
                    mode,
                    vendor,
                    apiKey: parsed.data.apiKey,
                    model: parsed.data.model?.trim() || null,
                });
                break;
            }
            case 'mcp': {
                if (!parsed.data.mcpBaseUrl) {
                    return NextResponse.json({ error: '원격 MCP 주소를 입력하세요.' }, { status: 400 });
                }

                let mcpBaseUrl: string;
                try {
                    mcpBaseUrl = assertPublicHttpsUrl(parsed.data.mcpBaseUrl);
                } catch (error: unknown) {
                    if (error instanceof RemoteUrlError) {
                        return NextResponse.json({ error: error.message }, { status: 400 });
                    }
                    throw error;
                }

                await upsertPersonalConnection(authResult.userId, {
                    mode,
                    apiKey: parsed.data.apiKey,
                    mcpBaseUrl,
                    mcpModel: parsed.data.mcpModel?.trim() || null,
                });
                break;
            }
            case 'local': {
                const localBaseUrl = parsed.data.localBaseUrl?.trim() || null;
                if (localBaseUrl) {
                    try {
                        assertAllowedBaseUrl(localBaseUrl, false);
                    } catch (error: unknown) {
                        const message = error instanceof Error
                            ? error.message
                            : '로컬 엔드포인트 주소가 올바르지 않습니다.';
                        return NextResponse.json({ error: message }, { status: 400 });
                    }
                }

                await upsertPersonalConnection(authResult.userId, {
                    mode,
                    localBaseUrl,
                    localModel: parsed.data.localModel?.trim() || null,
                });
                break;
            }
            case 'rule':
                await upsertPersonalConnection(authResult.userId, { mode });
                break;
        }

        // 키 값은 로그에도 응답에도 싣지 않는다.
        log.info('개인 AI 연결 저장', { userId: authResult.userId, mode });
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
