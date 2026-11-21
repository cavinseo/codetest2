import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';
import { specFunctionsBodySchema } from '@/lib/bulk-save-schemas';
import { assertWorksheetRevision, worksheetRevision, WorksheetRevisionConflict, WorksheetRevisionMissing } from '@/lib/worksheet-revision';
import { SPEC_SAVE_TIMEOUT_MS } from '@/lib/spec-save-timeout';

const log = createLogger('api/spec');

// GET: 프로젝트의 스펙 기능 조회
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: false });
        if (accessResult instanceof NextResponse) return accessResult;
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

        return NextResponse.json({ specFunctions: projectSpecs, specDetailCollapsed: project.specDetailCollapsed, revision: worksheetRevision(projectSpecs) });
    } catch (error: unknown) {
        log.error('스펙 조회 실패', error);
        return NextResponse.json(
            { error: '스펙 조회 실패' },
            { status: 500 }
        );
    }
}

// PATCH: 세세부기능 열의 접기 상태만 변경한다.
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;
        const { specDetailCollapsed } = await readJsonBody(request);
        if (typeof specDetailCollapsed !== 'boolean') {
            return NextResponse.json({ error: '접기 상태가 올바르지 않습니다.' }, { status: 400 });
        }
        const project = await prisma.project.update({
            where: { id: projectId },
            data: { specDetailCollapsed },
            select: { specDetailCollapsed: true },
        });
        return NextResponse.json(project);
    } catch (error: unknown) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        return toErrorResponse(error, { log, message: '세세부기능 열 상태를 저장하지 못했습니다.' });
    }
}

// POST: 스펙 저장(전체 교체)
// 임시 ID(core_0, sub_1 등)를 사용하는 SpecTable의 serializeSpecs()
// 결과물을 받아 CORE -> SUB -> DETAIL 순서로 단계별 저장
// 각 단계에서 Prisma가 실제 cuid를 생성하면 idMapping으로 parentId를 실제 id로 교체
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;
        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다' },
                { status: 404 }
            );
        }

        // 빈 배열은 "전부 지움"(행을 다 지운 저장·초기화 버튼)이라, 키가 빠진 요청까지 빈 목록으로
        // 받아 주면 잘못된 요청 하나로 스펙 전체가 지워진다. 스키마가 배열·단계·이름을 확인한다.
        const parsed = specFunctionsBodySchema.safeParse(await readJsonBody(request));
        if (!parsed.success) {
            return NextResponse.json({ error: '유효하지 않은 스펙 데이터입니다.' }, { status: 400 });
        }
        const newSpecs = parsed.data.specFunctions;

        // 삭제와 삽입을 하나의 트랜잭션으로 묶어 중간 실패 시 롤백한다. 빈 목록이면 삭제만 한다 —
        // 예전에는 빈 목록을 저장 성공으로만 답하고 아무것도 지우지 않아, 행을 다 지우거나
        // 초기화해도 새로고침하면 스펙이 되살아났다.
        const updatedSpecs = await prisma.$transaction(async (tx) => {
            const currentSpecs = await tx.specFunction.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
            assertWorksheetRevision(request, currentSpecs);
            await tx.specFunction.deleteMany({ where: { projectId } });

            // 임시 ID와 실제 Prisma cuid 매핑 테이블
            const idMapping = new Map<string, string>();

            // 1단계: CORE 저장
            const cores = newSpecs.filter(s => s.level === 'CORE');
            for (const core of cores) {
                const created = await tx.specFunction.create({
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

            // 2단계: SUB 저장(parentId를 실제 CORE id로 교체)
            const subs = newSpecs.filter(s => s.level === 'SUB');
            for (const sub of subs) {
                const realParentId = sub.parentId
                    ? (idMapping.get(sub.parentId) ?? null)
                    : null;
                const created = await tx.specFunction.create({
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

            // 3단계: DETAIL 저장(parentId를 실제 SUB id로 교체)
            const details = newSpecs.filter(s => s.level === 'DETAIL');
            for (const detail of details) {
                const realParentId = detail.parentId
                    ? (idMapping.get(detail.parentId) ?? null)
                    : null;
                await tx.specFunction.create({
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

            return tx.specFunction.findMany({
                where: { projectId },
                orderBy: { order: 'asc' },
            });
            // 행마다 순차로 create 하므로 기본 5초로는 큰 스펙이 끝까지 저장되지 못한다(감리 B15).
        }, { isolationLevel: 'Serializable', timeout: SPEC_SAVE_TIMEOUT_MS });

        log.info('스펙 저장 성공', { projectId, count: updatedSpecs.length });

        return NextResponse.json({
            specFunctions: updatedSpecs,
            revision: worksheetRevision(updatedSpecs),
            message: '스펙이 저장되었습니다',
        });
    } catch (error: unknown) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        if (error instanceof WorksheetRevisionMissing) {
            return NextResponse.json({ error: error.message }, { status: 428 });
        }
        if (error instanceof WorksheetRevisionConflict || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')) {
            return NextResponse.json({ error: '다른 화면에서 워크시트가 변경되었습니다. 새로고침 후 다시 확인하세요.' }, { status: 409 });
        }
        return toErrorResponse(error, { log, message: '스펙 저장에 실패했습니다.' });
    }
}
