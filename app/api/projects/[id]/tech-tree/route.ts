import { createBulkWorksheetRoute } from '@/lib/bulk-worksheet-route';
import { techTreeBodySchema } from '@/lib/bulk-save-schemas';

// 이 워크시트만 배열 키가 rows 가 아니라 entries 다. 클라이언트와의 계약이라 유지한다.
export const { GET, POST } = createBulkWorksheetRoute({
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
