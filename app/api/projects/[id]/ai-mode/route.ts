import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { parseProjectAiMode, projectAiModeSchema } from '@/lib/ai/project-ai-mode';
import { getProviderStatuses } from '@/lib/ai/registry';

const log = createLogger('api/project/ai-mode');

const updateAiModeSchema = z.object({
    aiMode: projectAiModeSchema,
});

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: false });
        if (accessResult instanceof NextResponse) return accessResult;

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { aiMode: true },
        });

        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        // 서버에서 로컬 엔진이 잡히는지 함께 알려준다. 배포 환경에서는 대개 잡히지 않고,
        // 그때는 브라우저 경유로 넘어간다는 것을 화면에서 안내한다.
        const providers = await getProviderStatuses();

        return NextResponse.json({
            aiMode: parseProjectAiMode(project.aiMode),
            serverLocalAvailable: providers.find((item) => item.id === 'local')?.available ?? false,
        });
    } catch (error: unknown) {
        log.error('AI mode fetch failed', error);
        return NextResponse.json({ error: 'AI 연결 방식을 불러오지 못했습니다.' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;

        const body = await request.json().catch(() => ({}));
        const { aiMode } = updateAiModeSchema.parse(body);

        const project = await prisma.project.update({
            where: { id: projectId },
            data: { aiMode },
            select: { aiMode: true },
        });

        return NextResponse.json({ aiMode: parseProjectAiMode(project.aiMode) });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('AI mode update failed', error);
        return NextResponse.json({ error: 'AI 연결 방식을 저장하지 못했습니다.' }, { status: 500 });
    }
}
