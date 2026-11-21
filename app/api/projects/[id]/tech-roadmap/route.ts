import { prisma } from '@/lib/prisma';
import type { TechRoadmap } from '@prisma/client';
import { groupRequirementsByCategory } from '@/lib/requirements-table-utils';
import { orderByRequirementText } from '@/lib/requirement-order';
import { createBulkWorksheetRoute } from '@/lib/bulk-worksheet-route';
import { techRoadmapBodySchema } from '@/lib/bulk-save-schemas';

export const { GET, POST } = createBulkWorksheetRoute({
    label: '기술로드맵',
    collectionKey: 'rows',
    bodySchema: techRoadmapBodySchema,
    selectRows: (body) => body.rows,
    delegate: (client) => client.techRoadmap,
    mapReadRows: async (rows, projectId) => {
        const requirements = groupRequirementsByCategory(await prisma.customerRequirement.findMany({ where: { projectId }, orderBy: { order: 'asc' } }));
        return orderByRequirementText(rows as TechRoadmap[], requirements, row => row.category);
    },
    toCreateData: (row, projectId) => ({
        category: row.category,
        techItem: row.techItem,
        currentLevel: row.currentLevel,
        q1: row.q1,
        q2: row.q2,
        q3: row.q3,
        q4: row.q4,
        targetLevel: row.targetLevel,
        owner: row.owner,
        order: row.order,
        projectId,
    }),
});
