// 워크시트 순서가 달라도 같은 데이터면 같은 보고서 원본 revision을 만들고 내용 변경은 감지한다.
import { expect, it } from 'vitest';
import { finalReportSourceRevision } from '../lib/final-report-source-revision';

it('DB 조회 순서가 달라도 동일한 워크시트 원본으로 판정한다', () => {
    const rows = [{ id: 'b', name: '두 번째' }, { id: 'a', name: '첫 번째' }];
    const source = { id: 'project', specFunctions: rows, updatedAt: new Date('2026-10-05T00:00:00Z') };
    const reversed = { updatedAt: new Date('2026-10-05T00:00:00Z'), specFunctions: [...rows].reverse(), id: 'project' };
    expect(finalReportSourceRevision(source)).toBe(finalReportSourceRevision(reversed));
});

it('내용이 바뀌면 다른 revision을 만든다', () => {
    const source = { id: 'project', specFunctions: [{ id: 'a', name: '기존' }] };
    expect(finalReportSourceRevision(source)).not.toBe(finalReportSourceRevision({
        ...source, specFunctions: [{ id: 'a', name: '수정' }],
    }));
});
