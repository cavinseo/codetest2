import { NextRequest, NextResponse } from 'next/server';
import { loadPersonalConnection } from '@/lib/ai/personal-store';
import { parseProjectAiMode } from '@/lib/ai/project-ai-mode';
import { runAiTask } from '@/lib/ai/registry';
import type { AttributeDraftInput } from '@/lib/ai/types';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

const log = createLogger('api/attributes/mentor');

type MentorMode = 'questions' | 'draft';

function parseMode(value: unknown): MentorMode {
    return value === 'draft' ? 'draft' : 'questions';
}

function parseAnswers(value: unknown): AttributeDraftInput['answers'] {
    if (!value || typeof value !== 'object') return {};
    const source = value as Record<string, unknown>;
    const pick = (key: string) => (typeof source[key] === 'string' ? (source[key] as string).trim() : '');

    return {
        segmentationBasis: pick('segmentationBasis'),
        marketSegments: pick('marketSegments'),
        customerNames: pick('customerNames'),
        customerProblems: pick('customerProblems'),
        expectedBenefits: pick('expectedBenefits'),
    };
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

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                name: true,
                description: true,
                detailedDescription: true,
                aiMode: true,
                productAttributes: { orderBy: { order: 'asc' } },
            },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
        }

        const projectContext = {
            name: project.name,
            description: project.description,
            detailedDescription: project.detailedDescription,
        };

        // 이 라우트는 지금까지 프로젝트의 aiMode 를 무시하고 전역 설정을 따랐다.
        // 프로젝트 설정 화면이 "이 프로젝트의 연결 방식"을 약속하므로 여기서도 따른다.
        const aiMode = parseProjectAiMode(project.aiMode);
        // 개인 키는 언제나 "버튼을 누른 본인"의 것이다. 남의 키는 구조적으로 올 수 없다.
        const personalConnection = aiMode === 'personal'
            ? await loadPersonalConnection(accessResult.user.userId)
            : null;
        const requested = aiMode === 'personal' ? 'personal' as const
            : aiMode === 'local' ? 'local' as const : 'rule' as const;

        const outcome = mode === 'draft'
            ? await runAiTask((provider) => provider.attributeDraft({
                project: projectContext,
                answers: parseAnswers(body.answers),
            }), { requested, personalConnection })
            : await runAiTask((provider) => provider.mentorQuestions({
                project: projectContext,
                existingRows: project.productAttributes,
            }), { requested, personalConnection });

        return NextResponse.json({
            mode,
            ...outcome.result,
            // 어떤 엔진이 처리했는지 화면에서 배지로 보여준다.
            provider: outcome.provider,
            requestedProvider: outcome.requestedProvider,
            degraded: outcome.degraded,
            degradedReason: outcome.degradedReason,
        });
    } catch (error: unknown) {
        log.error('Attribute mentoring failed', error);
        return NextResponse.json({ error: 'Attribute mentoring failed.' }, { status: 500 });
    }
}
