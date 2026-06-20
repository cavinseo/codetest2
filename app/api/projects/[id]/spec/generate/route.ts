import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import {
    generateSpecAiDraft,
    type SpecAiMode,
    type SpecAiSpecFunction,
    type SpecAiStructuredInput,
} from '@/lib/spec-ai-agent';

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

        const result = generateSpecAiDraft(mode, {
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
        });

        return NextResponse.json({
            ...result,
            mode,
            source: 'project-context-spec-agent',
        });
    } catch (error: unknown) {
        log.error('Spec generation failed', error);
        return NextResponse.json({ error: 'Spec generation failed.' }, { status: 500 });
    }
}
