// 작성용 워크시트의 다단 머리글과 가로 병합 정보를 보고서 렌더러가 함께 사용한다.
import type { FinalReportBlock } from './final-report-document';

export type ReportDataTable = Extract<FinalReportBlock, { kind: 'dataTable' }>;
export interface ReportHeaderCell { column: number; span: number; rowSpan: number; text: string; group: boolean }

export function reportHeaderRows(table: ReportDataTable): ReportHeaderCell[][] {
    if (!table.headerGroups) return [table.headers.map((text, column) => ({ column, span: 1, rowSpan: 1, text, group: false }))];
    const top: ReportHeaderCell[] = [], bottom: ReportHeaderCell[] = [];
    for (let column = 0; column < table.headers.length;) {
        const text = table.headerGroups[column];
        if (text === null) {
            top.push({ column, span: 1, rowSpan: 2, text: table.headers[column], group: false });
            column++;
            continue;
        }
        let end = column + 1;
        while (end < table.headers.length && table.headerGroups[end] === text) end++;
        top.push({ column, span: end - column, rowSpan: 1, text, group: true });
        for (let index = column; index < end; index++) bottom.push({ column: index, span: 1, rowSpan: 1, text: table.headers[index], group: false });
        column = end;
    }
    return [top, bottom];
}

export function reportColumnSpans(table: ReportDataTable, row: number): number[] {
    const spans = table.headers.map(() => 1);
    for (const merge of table.columnSpans ?? []) {
        if (merge.row !== row) continue;
        spans[merge.column] = merge.span;
        for (let column = merge.column + 1; column < merge.column + merge.span; column++) spans[column] = 0;
    }
    return spans;
}
