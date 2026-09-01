import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { specBodySchema } from '@/lib/bulk-save-schemas';

const log = createLogger('api/spec');

// GET: 프로젝트의 스펙 기능 조회
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
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

        return NextResponse.json({ specFunctions: projectSpecs });
    } catch (error: unknown) {
        log.error('스펙 조회 실패', error);
        return NextResponse.json(
            { error: '스펙 조회 실패' },
            { status: 500 }
        );
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
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
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

        // 예전에는 body.specFunctions || [] 로 받아, 배열이 아닌 본문이 조용히 [] 로
        // 강등됐다. 아래 조기 반환이 없어진 지금은 그 강등이 곧 전량 삭제라서,
        // 검증 없이는 오타 난 요청 하나가 스펙표를 통째로 지운다.
        const { specFunctions: newSpecs } = specBodySchema.parse(await request.json());

        // 빈 배열에 조기 반환을 두었더니, 화면의 초기화 버튼이 보내는 신호가
        // deleteMany 에 닿지 못했다. 200 과 "초기화되었습니다" 토스트가 나가는데
        // DB 는 그대로여서, 새로고침하면 전부 되살아났다. 빈 배열은 "저장할 게 없다"가
        // 아니라 "전부 지워라"는 뜻이므로 그대로 트랜잭션으로 내려보낸다.

        // 삭제와 삽입을 하나의 트랜잭션으로 묶어 중간 실패 시 롤백
        const updatedSpecs = await prisma.$transaction(async (tx) => {
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
        });

        log.info('스펙 저장 성공', { projectId, count: updatedSpecs.length });

        return NextResponse.json({
            specFunctions: updatedSpecs,
            message: '스펙이 저장되었습니다',
        });
    } catch (error: unknown) {
        // 검증 실패는 서버 오류가 아니다. toErrorResponse 는 무엇이든 500 으로 만들어
        // 버리므로 그 앞에서 갈라낸다. 어느 항목이 잘못됐는지 알려주지 않으면
        // 사용자는 저장이 왜 막혔는지 알 수 없다(requirements 라우트와 같은 형태다).
        if (error instanceof z.ZodError) {
            const firstIssue = error.errors[0];
            log.warn('스펙 검증 오류 (Zod)', { path: firstIssue?.path.join('.'), code: firstIssue?.code });
            return NextResponse.json({ error: firstIssue.message }, { status: 400 });
        }
        return toErrorResponse(error, { log, message: '스펙 저장에 실패했습니다.' });
    }
}
