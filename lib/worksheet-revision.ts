// 워크시트 전체 교체 저장 전에 화면이 읽은 행과 현재 저장 행의 일치를 확인한다.
import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { errorCodeOf } from './api-error';

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

/**
 * 개정값 검사 실패를 응답으로 바꾼다. 해당하지 않는 오류면 null 을 돌려 호출부의
 * 일반 오류 처리로 넘긴다. Serializable 트랜잭션끼리 부딪힌 P2034 도 "동시에 바뀜"
 * 이라 같은 409 로 본다.
 */
export function worksheetRevisionErrorResponse(error: unknown): NextResponse | null {
    if (error instanceof WorksheetRevisionMissing) {
        return NextResponse.json({ error: error.message }, { status: 428 });
    }
    if (error instanceof WorksheetRevisionConflict || errorCodeOf(error) === 'P2034') {
        return NextResponse.json(
            { error: '다른 화면에서 워크시트가 변경되었습니다. 현재 입력을 유지하고 새로고침 후 다시 확인하세요.' },
            { status: 409 }
        );
    }
    return null;
}
