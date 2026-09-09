import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { isProjectWriteRole, requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { dedupeNonBlank, findMissingTechnicalCharNames } from '@/lib/qfd-technical-sync';

const log = createLogger('api/qfd/technical');

const techSchema = z.object({
    name: z.string().min(1),
    unit: z.string().optional(),
    targetValue: z.string().optional(),
});

const techUpdateSchema = techSchema.extend({
    id: z.string().min(1),
});

const techDeleteSchema = z.object({
    id: z.string().min(1),
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
            orderBy: { id: 'asc' },
        });

        // WS-9 세부기능은 WS-10 세부스펙에서 자동으로 채운다 — 사용자가 하나씩 골라
        // 넣지 않아도 빈칸이 남지 않게 한다. 핵심기능별 그룹 선택은 당분간 쓰지 않으므로
        // 세부스펙 이름을 그대로 옮기기만 한다.
        // 조회(GET)라도 VIEWER·COACH 처럼 쓰기 권한이 없는 역할은 이 부수적 쓰기를
        // 건드리면 안 된다 — 읽기만 했는데 DB 가 바뀌는 권한 경계 붕괴다.
        if (!isProjectWriteRole(accessResult.role)) {
            return NextResponse.json({ technicalCharacteristics: projectTechs });
        }

        const techTreeEntries = await prisma.techTreeEntry.findMany({
            where: { projectId },
            select: { subSpec: true },
        });
        const subSpecNames = dedupeNonBlank(techTreeEntries.map((entry) => entry.subSpec));
        const missingNames = findMissingTechnicalCharNames(subSpecNames, projectTechs.map((tech) => tech.name));

        if (missingNames.length === 0) {
            return NextResponse.json({ technicalCharacteristics: projectTechs });
        }

        await prisma.technicalCharacteristic.createMany({
            data: missingNames.map((name) => ({ id: generateId('tech'), projectId, name })),
        });
        log.info('기술특성 자동 채움', { projectId, count: missingNames.length });

        const allTechs = await prisma.technicalCharacteristic.findMany({
            where: { projectId },
            orderBy: { id: 'asc' },
        });

        return NextResponse.json({ technicalCharacteristics: allTechs });
    } catch (error: unknown) {
        log.error('기술특성 조회 오류', error);
        return NextResponse.json({ error: '기술특성 조회 실패' }, { status: 500 });
    }
}

// PATCH: 기술특성 수정
export async function PATCH(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const body = await request.json();
        const data = techUpdateSchema.parse(body);

        const existing = await prisma.technicalCharacteristic.findFirst({
            where: { id: data.id, projectId },
            select: { id: true },
        });

        if (!existing) {
            return NextResponse.json({ error: '현재 프로젝트의 기술특성만 수정할 수 있습니다.' }, { status: 404 });
        }

        const updatedTech = await prisma.technicalCharacteristic.update({
            where: { id: data.id },
            data: {
                name: data.name,
                unit: data.unit,
                targetValue: data.targetValue,
            },
        });

        log.info('기술특성 수정', { projectId, techId: data.id, name: data.name });
        return NextResponse.json({ success: true, technicalCharacteristic: updatedTech });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('기술특성 수정 오류', error);
        return NextResponse.json({ error: '기술특성 수정 실패' }, { status: 500 });
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

// DELETE: 기술특성 삭제
//
// 이 열에 매달린 관계 강도(QFDMatrix)와 상관관계(TechCorrelation)는
// schema.prisma 의 onDelete: Cascade 가 함께 지운다. 여기서 따로 지우지 않는 이유는
// 두 곳이 갈리면 한쪽만 고쳐지는 회귀가 생기기 때문이다.
export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const body = await request.json();
        const data = techDeleteSchema.parse(body);

        // 프로젝트 소속을 먼저 확인한다. id 만 믿고 지우면 다른 프로젝트의 열을
        // 지울 수 있다 — PATCH 와 같은 방식으로 막는다.
        const existing = await prisma.technicalCharacteristic.findFirst({
            where: { id: data.id, projectId },
            select: { id: true },
        });

        if (!existing) {
            return NextResponse.json({ error: '현재 프로젝트의 기술특성만 삭제할 수 있습니다.' }, { status: 404 });
        }

        await prisma.technicalCharacteristic.delete({ where: { id: data.id } });

        log.info('기술특성 삭제', { projectId, techId: data.id });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('기술특성 삭제 오류', error);
        return NextResponse.json({ error: '기술특성 삭제 실패' }, { status: 500 });
    }
}
