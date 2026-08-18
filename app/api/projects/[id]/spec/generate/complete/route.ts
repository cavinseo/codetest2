import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { composeSpecDraftFromCores, type SpecAiContext } from '@/lib/spec-ai-agent';
import { parseRelaySpecDraftContent } from '@/lib/ai/relay-content';

const log = createLogger('api/spec/generate/complete');

// 브라우저가 자기 PC의 로컬 LLM을 부르고 받은 원문을 여기로 제출한다.
// 서버는 그 원문을 검증한 뒤, 규칙 기반과 똑같은 후처리를 태워 돌려준다.
//
// 상태를 두지 않는다. 어떤 프롬프트가 쓰였는지 서버는 기억하지 않으므로
// 서버리스 환경에서도 그대로 동작한다.
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;

        const body = await request.json().catch(() => ({}));
        const parsed = parseRelaySpecDraftContent(body?.content);
        if (!parsed.ok) {
            // 클라이언트는 이 응답을 받으면 이미 갖고 있는 규칙 기반 결과로 넘어간다.
            return NextResponse.json({ error: parsed.error, code: 'invalid-llm-output' }, { status: 400 });
        }

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                name: true,
                description: true,
                detailedDescription: true,
                specFunctions: { orderBy: { order: 'asc' } },
                productAttributes: { orderBy: { order: 'asc' } },
                requirements: { orderBy: { order: 'asc' } },
                technicalCharacteristics: { orderBy: { name: 'asc' } },
                targetSpecs: { orderBy: { order: 'asc' } },
            },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
        }

        const context: SpecAiContext = {
            project: {
                name: project.name,
                description: project.description,
                detailedDescription: project.detailedDescription,
            },
            additionalDescription:
                typeof body?.additionalDescription === 'string' ? body.additionalDescription.trim() : '',
            existingSpecs: project.specFunctions
                .filter((spec) => spec.level === 'CORE' || spec.level === 'SUB' || spec.level === 'DETAIL')
                .map((spec) => ({
                    id: spec.id,
                    level: spec.level as 'CORE' | 'SUB' | 'DETAIL',
                    parentId: spec.parentId,
                    name: spec.name,
                    technology: spec.technology,
                    order: spec.order,
                })),
            productAttributes: project.productAttributes,
            customerRequirements: project.requirements,
            qfdTechnicals: project.technicalCharacteristics,
            targetSpecs: project.targetSpecs,
        };

        return NextResponse.json({
            ...composeSpecDraftFromCores(parsed.tree.cores, context),
            mode: 'draft',
            source: 'browser-local-relay',
            provider: 'browser-local',
            requestedProvider: 'local',
            degraded: false,
        });
    } catch (error: unknown) {
        log.error('Browser relay completion failed', error);
        return NextResponse.json({ error: '로컬 AI 결과를 처리하지 못했습니다.' }, { status: 500 });
    }
}
