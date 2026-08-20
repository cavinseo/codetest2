// 개선포인트 데이터를 조회하고 현재 화면 상태로 교체 저장하는 API입니다.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { improvementsBodySchema, type ImprovementRow } from '@/lib/bulk-save-schemas';

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
            prisma.improvementItem.findMany({ where: { projectId }, orderBy: [{ type: 'asc' }, { order: 'asc' }] }),
            fetch(`${request.nextUrl.origin}/api/projects/${projectId}/qfd/analysis`, {
                headers: {
                    cookie: request.headers.get('cookie') ?? '',
                    authorization: request.headers.get('authorization') ?? '',
                },
            }).then((response) => (response.ok ? response.json() : null)),
        ]);

        return NextResponse.json({ items, qfdAnalysis });
    } catch (error) {
        console.error('improvements GET error:', error);
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
        const parsed = improvementsBodySchema.parse(await request.json());
        const items = parsed.items.map(cleanItem);

        const saved = await prisma.$transaction(async (tx) => {
            await tx.improvementItem.deleteMany({ where: { projectId } });

            if (items.length === 0) {
                return [];
            }

            await tx.improvementItem.createMany({
                data: items.map((item) => ({ ...item, projectId })),
            });

            return tx.improvementItem.findMany({ where: { projectId }, orderBy: [{ type: 'asc' }, { order: 'asc' }] });
        });

        return NextResponse.json({ items: saved });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        console.error('improvements POST error:', error);
        return NextResponse.json({ error: '개선포인트 데이터를 저장하지 못했습니다.' }, { status: 500 });
    }
}
