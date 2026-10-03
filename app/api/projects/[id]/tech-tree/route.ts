import { NextRequest, NextResponse } from 'next/server';
import { createBulkWorksheetRoute } from '@/lib/bulk-worksheet-route';
import { techTreeBodySchema } from '@/lib/bulk-save-schemas';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { buildTargetSpecAdditionsFromTechTree } from '@/lib/worksheet-links';
import { synchronizeTechnicalCoreGroups } from '@/lib/qfd-technical-group-store';

const log = createLogger('api/tech-tree');

// 이 워크시트만 배열 키가 rows 가 아니라 entries 다. 클라이언트와의 계약이라 유지한다.
export const { GET } = createBulkWorksheetRoute({
    label: '기능기술체계',
    collectionKey: 'entries',
    bodySchema: techTreeBodySchema,
    selectRows: (body) => body.entries,
    delegate: (client) => client.techTreeEntry,
    toCreateData: (row, projectId) => ({
        customerVoice: row.customerVoice,
        coreSpec: row.coreSpec,
        subSpec: row.subSpec,
        techCharacteristic: row.techCharacteristic,
        order: row.order,
        projectId,
    }),
});

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;
    const parsed = techTreeBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: '유효하지 않은 기능기술체계 데이터입니다.' }, { status: 400 });

    try {
        const entries = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
            await tx.techTreeEntry.deleteMany({ where: { projectId } });
            if (parsed.data.entries.length) {
                await tx.techTreeEntry.createMany({
                    data: parsed.data.entries.map((row) => ({
                        customerVoice: row.customerVoice,
                        coreSpec: row.coreSpec,
                        subSpec: row.subSpec,
                        techCharacteristic: row.techCharacteristic,
                        order: row.order,
                        projectId,
                    })),
                });
            }
            if (parsed.data.entries.some((row) => row.coreSpec && row.subSpec)) {
                const [specs, targets] = await Promise.all([
                    tx.specFunction.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
                    tx.targetSpec.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
                ]);
                const additions = buildTargetSpecAdditionsFromTechTree(parsed.data.entries, specs, targets);
                if (additions.length) {
                    await tx.targetSpec.createMany({ data: additions.map((row) => ({ ...row, projectId })) });
                }
            }
            const savedEntries = await tx.techTreeEntry.findMany({ where: { projectId }, orderBy: [{ order: 'asc' }, { id: 'asc' }] });
            await synchronizeTechnicalCoreGroups(tx, projectId, savedEntries, true);
            await tx.project.update({ where: { id: projectId }, data: { qfdTechnicalInitialized: true } });
            return savedEntries;
        }, { timeout: 30000 });
        return NextResponse.json({ entries });
    } catch (error) {
        return toErrorResponse(error, { log, message: '기능기술체계 데이터를 저장하지 못했습니다.', context: { projectId } });
    }
}
