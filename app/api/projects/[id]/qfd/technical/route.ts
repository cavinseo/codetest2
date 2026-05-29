import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/qfd/technical');

const techSchema = z.object({
    name: z.string().min(1),
    unit: z.string().optional(),
    targetValue: z.string().optional(),
});

// GET: 기술특성 조회
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const projectTechs = await prisma.technicalCharacteristic.findMany({
            where: { projectId },
        });

        return NextResponse.json({
            technicalCharacteristics: projectTechs,
        });
    } catch (error: unknown) {
        log.error('기술특성 조회 오류', error);
        return NextResponse.json({ error: '기술특성 조회 실패' }, { status: 500 });
    }
}

// POST: 기술특성 추가
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
        const data = techSchema.parse(body);

        const newTech = await prisma.technicalCharacteristic.create({
            data: {
                id: generateId('tech'),
                projectId,
                name: data.name,
                unit: data.unit,
                targetValue: data.targetValue,
            },
        });

        log.info('기술특성 추가', { projectId, name: data.name });
        return NextResponse.json({ success: true, technicalCharacteristic: newTech });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('기술특성 추가 오류', error);
        return NextResponse.json({ error: '기술특성 추가 실패' }, { status: 500 });
    }
}
