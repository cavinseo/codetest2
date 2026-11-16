// 워크시트 전체 교체 저장 전에 화면이 읽은 행과 현재 저장 행의 일치를 확인한다.
import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';

export class WorksheetRevisionConflict extends Error {}
export class WorksheetRevisionMissing extends Error {}

export function worksheetRevision(rows: unknown[]): string {
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export function assertWorksheetRevision(request: NextRequest, rows: unknown[]) {
    const expected = request.headers.get('If-Match');
    if (!expected) {
        throw new WorksheetRevisionMissing('워크시트 개정값이 없습니다. 새로고침 후 다시 저장하세요.');
    }
    if (expected !== worksheetRevision(rows)) {
        throw new WorksheetRevisionConflict('다른 화면에서 워크시트가 변경되었습니다. 현재 입력을 유지하고 새로고침 후 다시 확인하세요.');
    }
}
