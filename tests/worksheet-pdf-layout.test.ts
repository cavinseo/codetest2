import { describe, expect, it } from 'vitest';
import {
    A4_PT,
    PDF_MARGIN_PT,
    WORKSHEET_PDF_IDS,
    isWorksheetPdfEnabled,
    planWorksheetPdfPages,
    worksheetPdfFileName,
} from '../lib/worksheet-pdf-layout';

const PORTRAIT_BODY = { width: 595.28 - 56.7, height: 841.89 - 56.7 };
const LANDSCAPE_BODY = { width: 841.89 - 56.7, height: 595.28 - 56.7 };

describe('isWorksheetPdfEnabled', () => {
    it('WS-2·3·4·5·7 의 탭 id 와 독립 페이지 경로만 허용한다', () => {
        expect(WORKSHEET_PDF_IDS).toEqual(['spec', 'attributes', 'fitness', 'attributes/fitness', 'requirements', 'kano-aggregation', 'kano/analysis']);
        for (const id of WORKSHEET_PDF_IDS) expect(isWorksheetPdfEnabled(id)).toBe(true);
    });

    it('다른 워크시트는 허용하지 않는다', () => {
        for (const id of ['sales', 'kano', 'qfd', 'timko', 'tech-tree', 'Spec', '']) expect(isWorksheetPdfEnabled(id)).toBe(false);
    });
});

describe('planWorksheetPdfPages', () => {
    it('A4 크기와 10mm 여백을 쓴다', () => {
        expect(A4_PT).toEqual({ width: 595.28, height: 841.89 });
        expect(PDF_MARGIN_PT).toBe(28.35);
    });

    it('작은 그림은 키우지 않고 세로 한 쪽 본문 위쪽에 둔다', () => {
        const plan = planWorksheetPdfPages(200, 400);
        expect(plan.pageWidth).toBe(595.28);
        expect(plan.pageHeight).toBe(841.89);
        expect(plan.margin).toBe(28.35);
        expect(plan.drawWidth).toBeCloseTo(75);
        expect(plan.drawHeight).toBeCloseTo(150);
        expect(plan.imageYs).toHaveLength(1);
        expect(plan.imageYs[0]).toBeCloseTo(841.89 - 28.35 - 150);
    });

    it('배율 기본값은 2 이고 배율 1 이면 두 배 크기로 본다', () => {
        expect(planWorksheetPdfPages(200, 400, 1).drawWidth).toBeCloseTo(150);
        expect(planWorksheetPdfPages(200, 400, 1).drawHeight).toBeCloseTo(300);
    });

    it('폭이 높이보다 넓으면 가로 방향으로 두고 본문 폭에 맞춰 줄인다', () => {
        const plan = planWorksheetPdfPages(4000, 1000);
        expect(plan.pageWidth).toBe(841.89);
        expect(plan.pageHeight).toBe(595.28);
        expect(plan.drawWidth).toBeCloseTo(LANDSCAPE_BODY.width);
        expect(plan.drawHeight).toBeCloseTo(LANDSCAPE_BODY.width / 4);
        expect(plan.imageYs).toHaveLength(1);
        expect(plan.imageYs[0]).toBeCloseTo(595.28 - 28.35 - LANDSCAPE_BODY.width / 4);
    });

    it('정사각형은 세로 방향이다', () => {
        expect(planWorksheetPdfPages(1000, 1000).pageWidth).toBe(595.28);
    });

    it('본문 높이와 같으면 한 쪽, 넘으면 다음 쪽으로 잇는다', () => {
        // 배율 1 에서 높이 px × 0.75 = pt 다. 정확히 본문 높이가 되는 px 를 고른다.
        const exactHeightPx = PORTRAIT_BODY.height / 0.75;
        const exact = planWorksheetPdfPages(100, exactHeightPx, 1);
        expect(exact.drawHeight).toBeCloseTo(PORTRAIT_BODY.height);
        expect(exact.imageYs).toHaveLength(1);
        expect(exact.imageYs[0]).toBeCloseTo(28.35);
        expect(planWorksheetPdfPages(100, exactHeightPx + 1, 1).imageYs).toHaveLength(2);
    });

    it('긴 그림은 쪽마다 본문 높이만큼 위로 올려 이어 싣는다', () => {
        const heightPx = PORTRAIT_BODY.height * 2.5 / 0.75;
        const plan = planWorksheetPdfPages(100, heightPx, 1);
        const top = 841.89 - 28.35;
        expect(plan.imageYs).toHaveLength(3);
        expect(plan.imageYs[0]).toBeCloseTo(top - plan.drawHeight);
        expect(plan.imageYs[1]).toBeCloseTo(top - plan.drawHeight + PORTRAIT_BODY.height);
        expect(plan.imageYs[2]).toBeCloseTo(top - plan.drawHeight + PORTRAIT_BODY.height * 2);
    });

    it('양수가 아닌 크기나 배율은 거부한다', () => {
        for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(() => planWorksheetPdfPages(bad, 100)).toThrow('그림 크기와 배율은 양수여야 합니다.');
            expect(() => planWorksheetPdfPages(100, bad)).toThrow('그림 크기와 배율은 양수여야 합니다.');
            expect(() => planWorksheetPdfPages(100, 100, bad)).toThrow('그림 크기와 배율은 양수여야 합니다.');
        }
    });
});

describe('worksheetPdfFileName', () => {
    it('파일 이름에 pdf 확장자를 붙인다', () => {
        expect(worksheetPdfFileName('WS-2 AS-IS 스펙표')).toBe('WS-2 AS-IS 스펙표.pdf');
    });
});
