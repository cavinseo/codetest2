import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/qfd/relationships');

const relationshipSchema = z.object({
    requirementId: z.string(),
    technicalCharId: z.string(),
    strength: z.enum(['STRONG', 'MEDIUM', 'WEAK', 'NONE']),
});

// GET: 愿怨?議고쉶
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const projectRels = await prisma.qFDMatrix.findMany({
            where: { projectId },
        });

        return NextResponse.json({ relationships: projectRels });
    } catch (error: unknown) {
        log.error('愿怨?議고쉶 ?ㅽ뙣', error);
        return NextResponse.json({ error: '愿怨?議고쉶 ?ㅽ뙣' }, { status: 500 });
    }
}

// POST: 관계 설정
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const body = await request.json();
        const data = relationshipSchema.parse(body);

        await prisma.qFDMatrix.upsert({
            where: {
                projectId_requirementId_technicalCharId: {
                    projectId,
                    requirementId: data.requirementId,
                    technicalCharId: data.technicalCharId,
                },
            },
            update: {
                strength: data.strength,
            },
            create: {
                id: generateId('rel'),
                projectId,
                requirementId: data.requirementId,
                technicalCharId: data.technicalCharId,
                strength: data.strength,
            },
        });

        log.info('관계 설정 완료', { projectId, reqId: data.requirementId, techId: data.technicalCharId });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('관계 설정 실패', error);
        return NextResponse.json({ error: '관계 설정 실패' }, { status: 500 });
    }
}
