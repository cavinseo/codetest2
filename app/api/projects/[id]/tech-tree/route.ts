import { groupRequirementsByCategory } from '@/lib/requirements-table-utils';
import { orderByRequirementText } from '@/lib/requirement-order';
import { NextRequest, NextResponse } from 'next/server';
import { assertWorksheetRevision, worksheetRevision, WorksheetRevisionConflict, WorksheetRevisionMissing } from '@/lib/worksheet-revision';
import { techTreeBodySchema } from '@/lib/bulk-save-schemas';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { buildTargetSpecAdditionsFromTechTree } from '@/lib/worksheet-links';
import { synchronizeTechnicalCoreGroups } from '@/lib/qfd-technical-group-store';

const log = createLogger('api/tech-tree');

// 조회와 저장의 개정값은 동일한 행 정렬을 사용한다.
const entryOrder = [{ order: 'asc' as const }, { id: 'asc' as const }];
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const access = await requireProjectAccess(request, projectId, { write: false });
    if (access instanceof NextResponse) return access;
    try {
        const entries = await prisma.techTreeEntry.findMany({ where: { projectId }, orderBy: entryOrder });
        const requirements = groupRequirementsByCategory(await prisma.customerRequirement.findMany({ where: { projectId }, orderBy: { order: 'asc' } }));
        return NextResponse.json({ entries: orderByRequirementText(entries, requirements, row => row.customerVoice), revision: worksheetRevision(entries) });
    } catch (error) {
        return toErrorResponse(error, { log, message: '기능기술체계 데이터를 불러오지 못했습니다.', context: { projectId } });
    }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;
    const parsed = techTreeBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: '유효하지 않은 기능기술체계 데이터입니다.' }, { status: 400 });

    try {
        const entries = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
            const current = await tx.techTreeEntry.findMany({ where: { projectId }, orderBy: entryOrder });
            assertWorksheetRevision(request, current);
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
            const savedEntries = await tx.techTreeEntry.findMany({ where: { projectId }, orderBy: entryOrder });
            await synchronizeTechnicalCoreGroups(tx, projectId, savedEntries, true);
            await tx.project.update({ where: { id: projectId }, data: { qfdTechnicalInitialized: true } });
            return savedEntries;
        }, { timeout: 30000, isolationLevel: 'Serializable' });
        return NextResponse.json({ entries, revision: worksheetRevision(entries) });
    } catch (error) {
        if (error instanceof WorksheetRevisionMissing) return NextResponse.json({ error: error.message }, { status: 428 });
        if (error instanceof WorksheetRevisionConflict || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')) {
            return NextResponse.json({ error: '다른 화면에서 기능기술체계가 변경되었습니다. 현재 입력은 유지됩니다. 필요한 입력을 복사한 뒤 새로고침하여 비교하세요.' }, { status: 409 });
        }
        return toErrorResponse(error, { log, message: '기능기술체계 데이터를 저장하지 못했습니다.', context: { projectId } });
    }
}
