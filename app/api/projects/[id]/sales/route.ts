import { createBulkWorksheetRoute } from '@/lib/bulk-worksheet-route';
import { salesBodySchema } from '@/lib/bulk-save-schemas';

export const { GET, POST } = createBulkWorksheetRoute({
    label: '매출추정',
    collectionKey: 'rows',
    bodySchema: salesBodySchema,
    selectRows: (body) => body.rows,
    delegate: (client) => client.salesEstimate,
    toCreateData: (row, projectId) => ({
        // period 는 두 값만 허용한다. 그 외 입력은 기준연도로 떨어뜨린다.
        period: row.period === 'Y_PLUS_1' ? 'Y_PLUS_1' : 'Y',
        customer: row.customer,
        amount: Number(row.amount) || 0,
        futureAmount: 0,
        competitor: row.competitor,
        order: row.order,
        projectId,
    }),
});
