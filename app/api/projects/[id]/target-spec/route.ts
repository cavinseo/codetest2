import { groupRequirementsByCategory } from '@/lib/requirements-table-utils';
import { orderByRequirementText, orderTargetSpecs } from '@/lib/requirement-order';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { buildTargetSpecSuggestions, buildTargetSpecsFromAsIs, buildTargetSpecAdditionsFromTechTree } from '@/lib/worksheet-links';
import { targetSpecBodySchema } from '@/lib/bulk-save-schemas';
import { createBulkWorksheetRoute } from '@/lib/bulk-worksheet-route';
import { worksheetRevision } from '@/lib/worksheet-revision';

const log = createLogger('api/target-spec');

// GET: 목표사양 목록
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: false });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const [rows, improvements, techChars, specFunctions, storedTreeEntries, storedRequirements] = await Promise.all([
            prisma.targetSpec.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
            prisma.improvementItem.findMany({ where: { projectId, type: 'feature' } }),
            prisma.technicalCharacteristic.findMany({ where: { projectId } }),
            prisma.specFunction.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
            prisma.techTreeEntry.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
            prisma.customerRequirement.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
        ]);
        const requirements = groupRequirementsByCategory(storedRequirements);
        const techTreeEntries = orderByRequirementText(storedTreeEntries, requirements, row => row.customerVoice);
        const suggestions = buildTargetSpecSuggestions({
            improvements,
            technicalCharacteristics: techChars,
        });
        const asIsRows = orderTargetSpecs(buildTargetSpecsFromAsIs(specFunctions), techTreeEntries);
        const newSpecs = buildTargetSpecAdditionsFromTechTree(techTreeEntries, specFunctions, asIsRows)
            .map(({ category, subCategory }) => ({ category, subCategory }));
        return NextResponse.json({ rows: orderTargetSpecs(rows, techTreeEntries), revision: worksheetRevision(rows), asIsRows, newSpecs, suggestions, improvements, technicalCharacteristics: techChars });
    } catch (error) {
        return toErrorResponse(error, {
            log,
            message: '목표사양 데이터를 불러오지 못했습니다.',
            context: { projectId },
        });
    }
}

// POST: 전체 일괄 저장
// GET 은 개선포인트·기술특성을 함께 내려주는 커스텀이라 팩토리를 쓰지 않는다.
export const { POST } = createBulkWorksheetRoute({
    label: '목표사양',
    collectionKey: 'rows',
    bodySchema: targetSpecBodySchema,
    selectRows: (body) => body.rows,
    delegate: (client) => client.targetSpec,
    toCreateData: (row, projectId) => ({
        category: row.category,
        subCategory: row.subCategory,
        specItem: row.specItem,
        unit: row.unit,
        currentValue: row.currentValue,
        competitorValue: row.competitorValue,
        targetValue: row.targetValue,
        note: row.note,
        order: row.order,
        projectId,
    }),
});
