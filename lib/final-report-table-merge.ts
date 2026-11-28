// 결과보고서의 그룹 열을 페이지별로 세로 병합할 범위로 계산한다.
import type { FinalReportBlock } from './final-report-document';
import type { ReportLayoutItem } from './final-report-layout';
import { getRequirementGroupSpans } from './requirements-table-utils';

type TableLayout = Extract<ReportLayoutItem, { kind: 'table' }>;

export function getTableMergeSpans(item: TableLayout, block: FinalReportBlock): number[][] {
    if (item.mergeSpans) return item.mergeSpans;
    if (block.kind !== 'dataTable' || !block.mergeColumns?.length) return item.rows.map(row => row.lines.map(() => 1));
    return getReportTableCellSpans(item.rows.map(row => row.lines.map((_, column) => block.rows[row.index]?.[column] ?? '')), block);
}

export function getReportTableCellSpans(rows: string[][], block: FinalReportBlock): number[][] {
    if (block.kind !== 'dataTable') return rows.map(row => row.map(() => 1));
    if (block.title === 'WS-5 고객요구사항' && block.mergeColumns?.includes(2) && block.mergeColumns.includes(3)) {
        // 미분류도 WS-5 화면과 동일하게 묶어 빈 상위 그룹 때문에 하위 그룹명이 반복되지 않게 한다.
        const groups = getRequirementGroupSpans(rows.map((row, order) => ({ id: String(order), order, category: row[2], subcategory: row[3] })), null);
        return rows.map((row, index) => row.map((_, column) => column === 2 ? groups[index].primary : column === 3 ? groups[index].secondary : 1));
    }
    return getGroupedCellSpans(rows, block.mergeColumns ?? []);
}

export function getGroupedCellSpans(rows: string[][], columns: number[]): number[][] {
    const spans = rows.map(row => row.map(() => 1));
    const mergeColumns = [...columns];
    const sourceCell = (rowIndex: number, column: number) => rows[rowIndex]?.[column]?.trim() ?? '';
    const mergeable = (value: string) => Boolean(value && value !== '미입력' && value !== '—');
    const sameGroup = (start: number, next: number, column: number) =>
        sourceCell(start, column) === sourceCell(next, column) &&
        mergeColumns.slice(0, mergeColumns.indexOf(column)).every(parent =>
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
