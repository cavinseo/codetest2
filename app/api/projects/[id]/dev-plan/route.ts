import { createBulkWorksheetRoute } from '@/lib/bulk-worksheet-route';
import { devPlanBodySchema } from '@/lib/bulk-save-schemas';

export const { GET, POST } = createBulkWorksheetRoute({
    label: '개발계획',
    collectionKey: 'rows',
    bodySchema: devPlanBodySchema,
    selectRows: (body) => body.rows,
    delegate: (client) => client.devPlan,
    toCreateData: (row, projectId) => ({
        phase: row.phase,
        task: row.task,
        description: row.description,
        startDate: row.startDate,
        endDate: row.endDate,
        owner: row.owner,
        status: row.status ?? 'TODO',
        order: row.order,
        projectId,
    }),
});
