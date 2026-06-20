// 개선포인트 데이터를 조회하고 현재 화면 상태로 교체 저장하는 API입니다.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';

interface ImprovementPayloadItem {
    type: string;
    content?: string;
    improvementRate?: string;
    devProportion?: string;
    priority?: string;
    order: number;
}

const cleanItem = (item: ImprovementPayloadItem, index: number) => ({
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
        const body = await request.json() as { items?: ImprovementPayloadItem[] };
        const items = Array.isArray(body.items) ? body.items.map(cleanItem) : [];

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
        console.error('improvements POST error:', error);
        return NextResponse.json({ error: '개선포인트 데이터를 저장하지 못했습니다.' }, { status: 500 });
    }
}
