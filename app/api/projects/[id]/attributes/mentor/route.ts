import { NextRequest, NextResponse } from 'next/server';
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

        const outcome = mode === 'draft'
            ? await runAiTask((provider) => provider.attributeDraft({
                project: projectContext,
                answers: parseAnswers(body.answers),
            }))
            : await runAiTask((provider) => provider.mentorQuestions({
                project: projectContext,
                existingRows: project.productAttributes,
            }));

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
