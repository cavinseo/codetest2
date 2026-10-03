// 결과보고서의 그룹 열을 페이지별로 세로 병합할 범위로 계산한다.
import type { FinalReportBlock } from './final-report-document';
import type { ReportLayoutItem } from './final-report-layout';

type TableLayout = Extract<ReportLayoutItem, { kind: 'table' }>;

export function getTableMergeSpans(item: TableLayout, block: FinalReportBlock): number[][] {
    if (block.kind !== 'dataTable' || !block.mergeColumns?.length) return item.rows.map(row => row.lines.map(() => 1));
    return getGroupedCellSpans(item.rows.map(row => row.lines.map((_, column) => block.rows[row.index]?.[column] ?? '')), block.mergeColumns);
}

export function getGroupedCellSpans(rows: string[][], columns: number[]): number[][] {
    const spans = rows.map(row => row.map(() => 1));
    const mergeColumns = [...columns].sort((a, b) => a - b);
    const sourceCell = (rowIndex: number, column: number) => rows[rowIndex]?.[column]?.trim() ?? '';
    const mergeable = (value: string) => Boolean(value && value !== '미입력' && value !== '—');
    const sameGroup = (start: number, next: number, column: number) =>
        sourceCell(start, column) === sourceCell(next, column) &&
        mergeColumns.filter(parent => parent < column).every(parent =>
            mergeable(sourceCell(start, parent)) && sourceCell(start, parent) === sourceCell(next, parent));

    for (const column of mergeColumns) {
        for (let start = 0; start < rows.length;) {
            const value = sourceCell(start, column);
            if (!mergeable(value)) { start++; continue; }
            let end = start + 1;
            while (end < rows.length && sameGroup(start, end, column)) end++;
            if (end - start > 1) {
                spans[start][column] = end - start;
                for (let index = start + 1; index < end; index++) spans[index][column] = 0;
            }
            start = end;
        }
    }
    return spans;
}
