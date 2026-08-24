import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import {
    composeSpecDraftFromCores,
    generateSpecAiDraft,
    type SpecAiContext,
    type SpecAiMode,
    type SpecAiSpecFunction,
    type SpecAiStructuredInput,
} from '@/lib/spec-ai-agent';
import { runAiTask } from '@/lib/ai/registry';
import { loadPersonalConnection } from '@/lib/ai/personal-store';
import { buildSpecDraftPrompts } from '@/lib/ai/prompts';
import { parseProjectAiMode } from '@/lib/ai/project-ai-mode';
import { getAiSettings } from '@/lib/service-settings';
import { LOCAL_BASE_URL_DEFAULTS, buildCandidateBaseUrls } from '@/lib/ai/endpoint-discovery';

const log = createLogger('api/spec/generate');

function parseMode(value: unknown): SpecAiMode {
    return value === 'refine' || value === 'technology' ? value : 'draft';
}

function parseStructuredInput(value: unknown): SpecAiStructuredInput {
    if (!value || typeof value !== 'object') return {};
    const source = value as Record<string, unknown>;
    return {
        productService: typeof source.productService === 'string' ? source.productService : '',
        customerSegments: typeof source.customerSegments === 'string' ? source.customerSegments : '',
        currentFunctions: typeof source.currentFunctions === 'string' ? source.currentFunctions : '',
        operations: typeof source.operations === 'string' ? source.operations : '',
        technologies: typeof source.technologies === 'string' ? source.technologies : '',
        competitors: typeof source.competitors === 'string' ? source.competitors : '',
    };
}

function mapSpecFunctions(specs: Array<{
    id: string;
    level: string;
    parentId?: string | null;
    name: string;
    technology?: string | null;
    order: number;
}>): SpecAiSpecFunction[] {
    return specs
        .filter((spec) => spec.level === 'CORE' || spec.level === 'SUB' || spec.level === 'DETAIL')
        .map((spec) => ({
            id: spec.id,
            level: spec.level as SpecAiSpecFunction['level'],
            parentId: spec.parentId,
            name: spec.name,
            technology: spec.technology,
            order: spec.order,
        }));
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;

        const body = await request.json().catch(() => ({}));
        const mode = parseMode(body.mode);
        const additionalDescription =
            typeof body.additionalDescription === 'string' ? body.additionalDescription.trim() : '';
        const structuredInput = parseStructuredInput(body.structuredInput);

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                name: true,
                description: true,
                detailedDescription: true,
                aiMode: true,
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
            additionalDescription,
            structuredInput,
            existingSpecs: mapSpecFunctions(project.specFunctions),
            productAttributes: project.productAttributes,
            customerRequirements: project.requirements,
            qfdTechnicals: project.technicalCharacteristics,
            targetSpecs: project.targetSpecs,
        };

        // refine·technology 는 기존 스펙을 결정적으로 병합·변환하는 작업이라 규칙 기반을 유지한다.
        if (mode !== 'draft') {
            return NextResponse.json({
                ...generateSpecAiDraft(mode, context),
                mode,
                source: 'project-context-spec-agent',
                provider: 'rule',
                degraded: false,
            });
        }

        const aiMode = parseProjectAiMode(project.aiMode);
        // 로컬 개발에서는 서버와 브라우저가 같은 PC라 서버측이 늘 성공해 버려서
        // 브라우저 경유 경로를 시험할 수 없다. 이 스위치로 서버측을 건너뛴다.
        const serverLocalDisabled = process.env.AI_LOCAL_SERVER_DISABLED === '1';
        const personalConnection = aiMode === 'personal'
            ? await loadPersonalConnection(accessResult.user.userId)
            : null;
        const requested = aiMode === 'personal'
            ? 'personal' as const
            : aiMode === 'local' && !serverLocalDisabled ? 'local' as const : 'rule' as const;

        const outcome = await runAiTask(
            (provider) => provider.specDraft(context),
            { requested, personalConnection }
        );
        const result = composeSpecDraftFromCores(outcome.result.cores, context);

        // 로컬을 원했는데 서버에서 못 붙었으면, 브라우저가 자기 PC의 LLM 을 직접
        // 부를 수 있도록 프롬프트를 함께 내려준다. 규칙 기반 결과도 이미 담겨 있어
        // 브라우저 경유가 실패해도 추가 왕복 없이 그대로 쓸 수 있다.
        const shouldOfferRelay = aiMode === 'local' && (serverLocalDisabled || outcome.degraded);
        const aiSettings = await getAiSettings();

        return NextResponse.json({
            ...result,
            mode,
            source: 'project-context-spec-agent',
            provider: outcome.provider,
            requestedProvider: outcome.requestedProvider,
            degraded: outcome.degraded,
            degradedReason: outcome.degradedReason,
            ...(shouldOfferRelay
                ? {
                    browserRelay: {
                        task: 'specDraft',
                        prompts: buildSpecDraftPrompts(context),
                        candidateBaseUrls: buildCandidateBaseUrls(
                            aiSettings.localBaseUrl,
                            LOCAL_BASE_URL_DEFAULTS
                        ),
                        preferredModel: aiSettings.localModel,
                    },
                }
                : {}),
        });
    } catch (error: unknown) {
        log.error('Spec generation failed', error);
        return NextResponse.json({ error: 'Spec generation failed.' }, { status: 500 });
    }
}
