// 결과보고서 워크시트 선택이 고른 절만 넣고 장 구성과 쪽 넘김을 망가뜨리지 않는지 검증한다.
import { describe, expect, it } from 'vitest';
import { buildFinalReportModel, type FinalReportBlock, type FinalReportWorksheetData } from '../lib/final-report-document';
import { EMPTY_REPORT_FREE_INPUT, reportDraftSchema } from '../lib/final-report-payload';
import {
    CAPTURED_IMAGE_WORKSHEET, REPORT_WORKSHEET_OPTIONS, excludeAllReportWorksheets, excludedReportWorksheetsSchema,
    includesReportWorksheet, toggleReportWorksheet, type ReportWorksheetId,
} from '../lib/final-report-sections';

const empty: FinalReportWorksheetData = {
    salesEstimates: [], specFunctions: [], productAttributes: [], requirements: [], kanoAggregation: [],
    competitiveAssessment: [], improvementNeeds: [], improvementFeatures: [], techTree: [], targetSpecs: [],
    improvementDirections: [], assets: [], fundingPlans: [], fundingSources: [],
};
const overview = { projectName: '분석 장비', companyName: '회사', description: '요약', coachName: '멘토', generatedAt: '2026.11.27' };
const ALL_IDS = REPORT_WORKSHEET_OPTIONS.map(option => option.id);

function build(excluded: ReportWorksheetId[]) {
    return buildFinalReportModel(overview, empty, EMPTY_REPORT_FREE_INPUT, [], {}, excluded).blocks;
}
const headings = (blocks: FinalReportBlock[]) => blocks.flatMap(block => block.kind === 'heading' ? [block.text] : []);
const wsNumbers = (blocks: FinalReportBlock[]) => new Set(headings(blocks).flatMap(text => [...text.matchAll(/WS-(\d+)/g)].map(match => `ws-${match[1]}`)));

describe('선택 판정', () => {
    it('뺀 목록에 없으면 포함, 있으면 제외한다', () => {
        expect(includesReportWorksheet([], 'ws-2')).toBe(true);
        expect(includesReportWorksheet(['ws-2'], 'ws-2')).toBe(false);
        expect(includesReportWorksheet(['ws-2'], 'ws-3')).toBe(true);
    });

    it('토글은 넣고 빼며 결과를 선택지 순서로 정렬한다', () => {
        expect(toggleReportWorksheet([], 'ws-7')).toEqual(['ws-7']);
        expect(toggleReportWorksheet(['ws-12', 'ws-3'], 'ws-1')).toEqual(['ws-1', 'ws-3', 'ws-12']);
        expect(toggleReportWorksheet(['ws-3', 'ws-7'], 'ws-3')).toEqual(['ws-7']);
    });

    it('전체 해제는 모든 워크시트를 선택지 순서로 돌려주고 원본을 공유하지 않는다', () => {
        const first = excludeAllReportWorksheets();
        expect(first).toEqual(ALL_IDS);
        first.pop();
        expect(excludeAllReportWorksheets()).toEqual(ALL_IDS);
    });

    it('캡처 그림은 소속 워크시트로 연결된다', () => {
        expect(CAPTURED_IMAGE_WORKSHEET).toEqual({ fitness: 'ws-4', 'kano-aggregation': 'ws-7', qfd: 'ws-9' });
    });

    it('저장값은 알려진 워크시트만, 중복 포함 최대 개수까지만 받는다', () => {
        expect(excludedReportWorksheetsSchema.safeParse(['ws-2', 'ws-16']).success).toBe(true);
        expect(excludedReportWorksheetsSchema.safeParse(['ws-6']).success).toBe(false);
        expect(excludedReportWorksheetsSchema.safeParse(ALL_IDS).success).toBe(true);
        expect(excludedReportWorksheetsSchema.safeParse([...ALL_IDS, 'ws-1']).success).toBe(false);
    });

    it('초안 저장 형식은 선택 없이도(이전 초안) 받고 잘못된 값은 막는다', () => {
        const base = { free: EMPTY_REPORT_FREE_INPUT, document: null };
        expect(reportDraftSchema.safeParse(base).success).toBe(true);
        expect(reportDraftSchema.parse({ ...base, excludedWorksheets: ['ws-7'] }).excludedWorksheets).toEqual(['ws-7']);
        expect(reportDraftSchema.safeParse({ ...base, excludedWorksheets: ['kano'] }).success).toBe(false);
    });
});

describe('보고서 구성', () => {
    it('선택이 없으면 기존과 같은 보고서를 만든다', () => {
        expect(build([])).toEqual(buildFinalReportModel(overview, empty, EMPTY_REPORT_FREE_INPUT, []).blocks);
    });

    it.each(ALL_IDS)('%s 하나만 빼면 그 워크시트 절만 사라진다', id => {
        const present = wsNumbers(build([id]));
        expect(present.has(id)).toBe(false);
        for (const other of ALL_IDS.filter(item => item !== id)) expect(present.has(other)).toBe(true);
    });

    it('전부 빼면 표지와 Ⅰ장 제품 정의만 남는다', () => {
        const blocks = build(excludeAllReportWorksheets());
        expect(blocks[0].kind).toBe('cover');
        expect(headings(blocks)).toEqual(['Ⅰ. (As-Is) 제품/서비스 정의', '제품(서비스)명 및 제품설명', '시장 정의 및 목표고객']);
        expect(blocks.some(block => block.kind === 'pageBreak')).toBe(false);
    });

    it('한 장의 워크시트를 모두 빼면 장 제목도 빠진다', () => {
        const chapterTitles = headings(build(['ws-12', 'ws-13', 'ws-14', 'ws-15', 'ws-16']));
        expect(chapterTitles.some(text => text.startsWith('Ⅳ.'))).toBe(false);
        expect(chapterTitles.some(text => text.startsWith('Ⅴ.'))).toBe(false);
        expect(chapterTitles.some(text => text.startsWith('Ⅲ.'))).toBe(true);
    });

    it.each([
        [['ws-2', 'ws-3'] as ReportWorksheetId[], '제품/서비스 속성 적합도 (WS-4)'],
        [['ws-2'] as ReportWorksheetId[], '제품속성표 (WS-3)'],
        [['ws-5'] as ReportWorksheetId[], 'Kano 분석을 통한 고객요구품질 집계 (WS-7)'],
        [['ws-14', 'ws-15'] as ReportWorksheetId[], '자금조달계획 (WS-16)'],
    ])('앞 절을 빼도 장 제목과 다음 절 사이에 빈 쪽을 만들지 않는다 (%j)', (excluded, nextTitle) => {
        const blocks = build(excluded);
        const index = blocks.findIndex(block => block.kind === 'heading' && block.text === nextTitle);
        expect(blocks[index - 1]).toMatchObject({ kind: 'heading', level: 1 });
    });

    it('앞 절이 남아 있으면 기존처럼 새 쪽에서 시작한다', () => {
        const blocks = build(['ws-2']);
        const index = blocks.findIndex(block => block.kind === 'heading' && block.text === '제품/서비스 속성 적합도 (WS-4)');
        expect(blocks[index - 1]).toEqual({ kind: 'pageBreak' });
    });

    it('WS-9 를 빼면 경쟁우위 평가와 QFD 관계도가 함께 빠진다', () => {
        const titles = headings(build(['ws-9']));
        expect(titles).not.toContain('Competitive Assessment · 경쟁적 우위요인 평가 (WS-9)');
        expect(titles).not.toContain('고객수요기반 기술스펙 관계도 (WS-9)');
        expect(titles).toContain('Engineering Metrics · 기술요구사항 도출 (WS-10)');
    });
});
