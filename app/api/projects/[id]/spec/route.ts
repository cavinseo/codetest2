import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/spec');

// GET: 프로젝트의 스펙 기능 조회
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다' },
                { status: 404 }
            );
        }

        const projectSpecs = await prisma.specFunction.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
        });

        return NextResponse.json({ specFunctions: projectSpecs });
    } catch (error: unknown) {
        log.error('스펙 조회 실패', error);
        return NextResponse.json(
            { error: '스펙 조회 실패' },
            { status: 500 }
        );
    }
}

// POST: 스펙 저장 (전체 교체)
// 임시 ID(core_0, sub_1 등)를 사용하는 SpecTable의 serializeSpecs()
// 결과물을 받아 CORE → SUB → DETAIL 순서로 단계별 저장
// 각 단계에서 Prisma가 실제 cuid를 생성하면 idMapping으로 parentId를 실제 id로 교체
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다' },
                { status: 404 }
            );
        }

        const body = await request.json();
        const newSpecs: Array<{
            id?: string;
            level: string;
            name: string;
            parentId?: string;
            technology?: string;
            order: number;
        }> = body.specFunctions || [];

        // 기존 데이터 삭제
        await prisma.specFunction.deleteMany({ where: { projectId } });

        if (newSpecs.length === 0) {
            return NextResponse.json({
                specFunctions: [],
                message: '스펙이 저장되었습니다',
            });
        }

        // 임시 ID → 실제 Prisma cuid 매핑 테이블
        const idMapping = new Map<string, string>();

        // 1단계: CORE 저장
        const cores = newSpecs.filter(s => s.level === 'CORE');
        for (const core of cores) {
            const created = await prisma.specFunction.create({
                data: {
                    projectId,
                    level: 'CORE',
                    name: core.name,
                    technology: core.technology || null,
                    order: core.order,
                },
            });
            if (core.id) idMapping.set(core.id, created.id);
        }

        // 2단계: SUB 저장 (parentId를 실제 CORE id로 교체)
        const subs = newSpecs.filter(s => s.level === 'SUB');
        for (const sub of subs) {
            const realParentId = sub.parentId
                ? (idMapping.get(sub.parentId) ?? null)
                : null;
            const created = await prisma.specFunction.create({
                data: {
                    projectId,
                    level: 'SUB',
                    name: sub.name,
                    parentId: realParentId,
                    technology: sub.technology || null,
                    order: sub.order,
                },
            });
            if (sub.id) idMapping.set(sub.id, created.id);
        }

        // 3단계: DETAIL 저장 (parentId를 실제 SUB id로 교체)
        const details = newSpecs.filter(s => s.level === 'DETAIL');
        for (const detail of details) {
            const realParentId = detail.parentId
                ? (idMapping.get(detail.parentId) ?? null)
                : null;
            await prisma.specFunction.create({
                data: {
                    projectId,
                    level: 'DETAIL',
                    name: detail.name,
                    parentId: realParentId,
                    technology: detail.technology || null,
                    order: detail.order,
                },
            });
        }

        const updatedSpecs = await prisma.specFunction.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
        });

        log.info('스펙 저장 성공', { projectId, count: updatedSpecs.length });

        return NextResponse.json({
            specFunctions: updatedSpecs,
            message: '스펙이 저장되었습니다',
        });
    } catch (error: unknown) {
        log.error('스펙 저장 실패', error);
        return NextResponse.json(
            { error: '스펙 저장 실패', detail: String(error) },
            { status: 500 }
        );
    }
}
