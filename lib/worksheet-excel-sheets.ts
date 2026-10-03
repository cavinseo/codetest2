// 엑셀 출력 대상 워크시트와 화면별 식별자를 정의한다.
export const WORKSHEET_EXCEL_SHEETS = [
    { id: 'sales', name: 'WS-1 자사매출추정표' },
    { id: 'spec', name: 'WS-2 AS-IS 스펙표' },
    { id: 'attributes', name: 'WS-3 제품속성서' },
    { id: 'fitness', name: 'WS-4 제품속성적합도' },
    { id: 'requirements', name: 'WS-5 고객요구사항도출표' },
    { id: 'kano', name: 'WS-6 Kano 질문지' },
    { id: 'kano-aggregation', name: 'WS-7 Kano 분석 집계표' },
    { id: 'timko', name: 'WS-8 TIMKO' },
    { id: 'qfd', name: 'WS-9 QFD' },
    { id: 'tech-tree', name: 'WS-10 기능기술체계도' },
    { id: 'improvements', name: 'WS-11 개선포인트도출' },
    { id: 'target-spec', name: 'WS-12 최종목표스펙도출' },
    { id: 'tech-roadmap', name: 'WS-13 향후목표고객LIST' },
    { id: 'dev-plan', name: 'WS-14 개발계획서' },
    { id: 'assets', name: 'WS-15 핵심자산 및 보완자산' },
    { id: 'funding-plan', name: 'WS-16 자금소요계획표' },
    { id: 'funding-source', name: 'WS-17 자금조달계획표' },
] as const;

export type WorksheetExcelId = typeof WORKSHEET_EXCEL_SHEETS[number]['id'];

export function resolveWorksheetExcelId(value: string): WorksheetExcelId | undefined {
    const id = value === 'attributes/fitness' ? 'fitness' : value === 'kano/analysis' ? 'kano-aggregation' : value;
    return WORKSHEET_EXCEL_SHEETS.find(sheet => sheet.id === id)?.id;
}
