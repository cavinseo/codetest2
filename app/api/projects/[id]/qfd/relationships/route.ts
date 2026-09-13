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

// GET: 관계 조회
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
        log.error('관계 조회 실패', error);
        return NextResponse.json({ error: '관계 조회 실패' }, { status: 500 });
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

        // 두 id 만 믿으면 다른 프로젝트의 행·열을 참조하는 관계가 만들어진다.
        // 그 프로젝트가 요구사항을 지우면 Cascade 로 이쪽 QFD 행이 말없이
        // 사라지고, 없는 id 는 FK 위반 500·있는 id 는 200 이라 특정 id 의 존재를
        // 확인하는 오라클로도 쓰인다. 형제 라우트(qfd/benchmarks,
        // qfd/technical-benchmarks)가 쓰는 것과 같은 방식으로 소속을 확인한다.
        const [requirement, technical] = await Promise.all([
            prisma.customerRequirement.findFirst({
                where: { id: data.requirementId, projectId },
                select: { id: true },
            }),
            prisma.technicalCharacteristic.findFirst({
                where: { id: data.technicalCharId, projectId },
                select: { id: true },
            }),
        ]);

        if (!requirement || !technical) {
            return NextResponse.json(
                { error: '현재 프로젝트의 요구사항과 기술특성만 연결할 수 있습니다.' },
                { status: 404 }
            );
        }

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
