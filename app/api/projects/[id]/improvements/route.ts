import { orderImprovementItems } from '@/lib/requirement-order';
// 개선포인트 데이터를 조회하고 현재 화면 상태로 교체 저장하는 API입니다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { improvementsBodySchema, type ImprovementRow } from '@/lib/bulk-save-schemas';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';
import { createLogger } from '@/lib/logger';
import { assertWorksheetRevision, worksheetRevision, worksheetRevisionErrorResponse } from '@/lib/worksheet-revision';

const log = createLogger('api/improvements');

// 개정값은 화면 표시용 재정렬 전, DB 에서 이 순서로 읽은 행으로 만든다.
const IMPROVEMENT_ORDER = [{ type: 'asc' as const }, { order: 'asc' as const }, { id: 'asc' as const }];

const cleanItem = (item: ImprovementRow, index: number) => ({
    type: item.type,
    content: item.content ?? '',
    improvementRate: item.improvementRate ?? '',
    devProportion: item.devProportion ?? '',
    priority: item.priority ?? null,
    order: Number.isFinite(item.order) ? item.order : index,
});

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: false });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const [items, qfdAnalysis] = await Promise.all([
            prisma.improvementItem.findMany({ where: { projectId }, orderBy: IMPROVEMENT_ORDER }),
            fetch(`${request.nextUrl.origin}/api/projects/${projectId}/qfd/analysis`, {
                headers: {
                    cookie: request.headers.get('cookie') ?? '',
                    authorization: request.headers.get('authorization') ?? '',
                },
            }).then((response) => (response.ok ? response.json() : null)),
        ]);

        return NextResponse.json({
            items: orderImprovementItems(items, qfdAnalysis?.requirements ?? []),
            qfdAnalysis,
            revision: worksheetRevision(items),
        });
    } catch (error) {
        log.error('improvements GET error', error);
        return NextResponse.json({ error: '개선포인트 데이터를 불러오지 못했습니다.' }, { status: 500 });
    }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        // 예전에는 items 가 배열이 아니면 조용히 [] 로 강등돼, 오타 난 바디 하나로
        // 개선포인트가 통째로 지워지고도 200 이 나갔다. 이제는 400 으로 막는다.
        const parsed = improvementsBodySchema.parse(await readJsonBody(request));
        const items = parsed.items.map(cleanItem);

        // 화면이 읽은 뒤 다른 사람이 저장했으면 전체 교체가 그 입력을 지우므로 409 로 막는다(감리 B3).
        const saved = await prisma.$transaction(async (tx) => {
            const current = await tx.improvementItem.findMany({ where: { projectId }, orderBy: IMPROVEMENT_ORDER });
            assertWorksheetRevision(request, current);
            await tx.improvementItem.deleteMany({ where: { projectId } });

            if (items.length === 0) {
                return [];
            }

            await tx.improvementItem.createMany({
                data: items.map((item) => ({ ...item, projectId })),
            });

            return tx.improvementItem.findMany({ where: { projectId }, orderBy: IMPROVEMENT_ORDER });
        }, { isolationLevel: 'Serializable' });

        return NextResponse.json({ items: saved, revision: worksheetRevision(saved) });
    } catch (error) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        const revisionResponse = worksheetRevisionErrorResponse(error);
        if (revisionResponse) return revisionResponse;
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('improvements POST error', error);
        return NextResponse.json({ error: '개선포인트 데이터를 저장하지 못했습니다.' }, { status: 500 });
    }
}
