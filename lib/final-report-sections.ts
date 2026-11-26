// 결과보고서에 넣을 워크시트를 고르는 선택지와 그 판정을 한곳에 둔다.
//
// 저장은 "뺀 워크시트" 목록으로 한다. 포함 목록으로 저장하면 나중에 보고서에
// 워크시트가 추가될 때 기존 초안에서 새 절이 조용히 빠지기 때문이다.
import { z } from 'zod';

export const REPORT_WORKSHEET_OPTIONS = [
    { id: 'ws-1', label: 'WS-1 자사매출추정표' },
    { id: 'ws-2', label: 'WS-2 AS-IS 스펙표' },
    { id: 'ws-3', label: 'WS-3 제품속성서' },
    { id: 'ws-4', label: 'WS-4 제품속성적합도' },
    { id: 'ws-5', label: 'WS-5 고객요구사항도출표' },
    { id: 'ws-7', label: 'WS-7 Kano 분석 집계' },
    { id: 'ws-9', label: 'WS-9 QFD(경쟁우위·관계도)' },
    { id: 'ws-10', label: 'WS-10 기능기술체계도' },
    { id: 'ws-11', label: 'WS-11 개선포인트도출' },
    { id: 'ws-12', label: 'WS-12 최종목표스펙' },
    { id: 'ws-13', label: 'WS-13 향후목표고객' },
    { id: 'ws-14', label: 'WS-14 핵심자산 및 보완자산' },
    { id: 'ws-15', label: 'WS-15 자금소요계획' },
    { id: 'ws-16', label: 'WS-16 자금조달계획' },
] as const;

export type ReportWorksheetId = typeof REPORT_WORKSHEET_OPTIONS[number]['id'];

const REPORT_WORKSHEET_IDS = REPORT_WORKSHEET_OPTIONS.map(option => option.id) as [ReportWorksheetId, ...ReportWorksheetId[]];

export const excludedReportWorksheetsSchema = z.array(z.enum(REPORT_WORKSHEET_IDS)).max(REPORT_WORKSHEET_IDS.length);

/** 화면 캡처 그림이 들어가는 절이 어느 워크시트 소속인지 — 뺀 절의 그림은 찍지 않는다. */
export const CAPTURED_IMAGE_WORKSHEET: Record<'fitness' | 'kano-aggregation' | 'qfd', ReportWorksheetId> = {
    fitness: 'ws-4',
    'kano-aggregation': 'ws-7',
    qfd: 'ws-9',
};

export function includesReportWorksheet(excluded: readonly ReportWorksheetId[], id: ReportWorksheetId): boolean {
    return !excluded.includes(id);
}

/** 체크 상태를 뒤집고, 저장값이 화면 순서와 같도록 선택지 순서로 정렬한다. */
export function toggleReportWorksheet(excluded: readonly ReportWorksheetId[], id: ReportWorksheetId): ReportWorksheetId[] {
    const next = excluded.includes(id) ? excluded.filter(item => item !== id) : [...excluded, id];
    return REPORT_WORKSHEET_IDS.filter(item => next.includes(item));
}

export function excludeAllReportWorksheets(): ReportWorksheetId[] {
    return [...REPORT_WORKSHEET_IDS];
}
