import { describe, expect, it } from 'vitest';
import {
    getImportableSheetKeys,
    parseWorkbookImport,
    validateWorkbookFormulas,
    type ParsedWorkbookImport,
} from '../lib/workbook-importer';
import type { ParsedExcelData, ParsedSheet } from '../lib/excel-parser';

function sheet(name: string, data: unknown[][], formulas?: Record<string, string>): ParsedSheet {
    return {
        name,
        data,
        rowCount: data.length,
        colCount: Math.max(...data.map((row) => row.length), 0),
        formulas,
    };
}

function workbook(sheets: ParsedSheet[]): ParsedExcelData {
    return {
        fileName: 'filled-workbook.xlsx',
        fileSize: 1000,
        sheets,
        parseErrors: [],
    };
}

function totalImported(result: ParsedWorkbookImport) {
    return Object.values(result.counts).reduce((sum, count) => sum + count, 0);
}

describe('workbook importer', () => {
    it('maps a filled workbook into importable project records', () => {
        const parsed = workbook([
            sheet('자사매출추정표', [
                ['2025년도 매출처별 매출 현황'],
                ['구분', '매출처', '현재(Y) 매출액', '미래(Y+1) 매출액', '경쟁사명'],
                [1, 'Alpha', '1,200', '2,500', 'Beta'],
            ]),
            sheet('AS-IS스펙표', [
                ['(AS-IS) 스펙표'],
                ['핵심스펙(기능)', '세부스펙(기능)', '세세부스펙(기능)', '기술적 특성'],
                ['Login', 'OAuth', 'Google login', 'Auth API'],
            ]),
            sheet('제품속성표', [
                ['제품속성서'],
                ['제품명', '고객명', '세분시장', '고객 니즈', '제공혜택', '제품속성', '기술 역량'],
                ['Product A', 'Customer A', 'SMB', 'Fast setup', 'Time saving', 'Easy onboarding', 'Automation'],
            ]),
            sheet('고객요구사항도출표', [
                ['고객요구사항 도출표'],
                ['번호', '항목(검정색 글씨)', '1차 그룹(빨간색 글씨)', '2차 그룹(파란색 글씨)'],
                [1, 'Fast setup', 'Usability', 'Onboarding'],
            ]),
            sheet('최종목표스펙도출', [
                ['최종 제품/서비스 제공 스펙 List'],
                ['스펙분류', '세부항목', '기술적 특성', '개선여부'],
                ['UX', 'Setup time', 'Automation', 'Y'],
            ]),
        ]);

        const result = parseWorkbookImport(parsed);

        expect(result.counts.salesEstimates).toBe(2);
        expect(result.records.salesEstimates[0]).toMatchObject({
            period: 'Y',
            amount: 1200,
        });
        expect(result.records.salesEstimates[1]).toMatchObject({
            period: 'Y_PLUS_1',
            amount: 2500,
        });
        expect(result.counts.specFunctions).toBe(3);
        expect(result.counts.productAttributes).toBe(1);
        expect(result.counts.customerRequirements).toBe(1);
        expect(result.counts.targetSpecs).toBe(1);
        expect(totalImported(result)).toBeGreaterThan(0);
        expect(result.warnings).toEqual([]);
    });

    it('maps a three-column AS-IS sheet technical characteristic into spec technology', () => {
        const parsed = workbook([
            sheet('AS-IS스펙표', [
                ['(AS-IS) 스펙표'],
                ['핵심스펙(기능)', '세부스펙(기능)', '기술적 특성'],
                ['커미션 거래 중계', '의뢰 등록·매칭', 'AI 기반 작가-의뢰 자동 매칭 추천'],
            ]),
        ]);

        const result = parseWorkbookImport(parsed, { sheetNames: ['AS-IS스펙표'] });
        const sub = result.records.specFunctions.find((item) => item.level === 'SUB');

        expect(result.counts.specFunctions).toBe(2);
        expect(sub).toMatchObject({
            name: '의뢰 등록·매칭',
            technology: 'AI 기반 작가-의뢰 자동 매칭 추천',
        });
        expect(result.records.specFunctions.some((item) => item.level === 'DETAIL')).toBe(false);
    });

    it('imports only selected worksheets when sheet names are provided', () => {
        const parsed = workbook([
            sheet('자사매출추정표', [
                ['구분', '매출처', '매출액', '경쟁사명'],
                [1, 'Alpha', 120, 'Beta'],
            ]),
            sheet('제품속성표', [
                ['제품명', '고객명', '세분시장', '고객 니즈', '제공혜택', '제품속성', '기술 역량'],
                ['Product A', 'Customer A', 'SMB', 'Fast setup', 'Time saving', 'Easy onboarding', 'Automation'],
            ]),
        ]);

        const result = parseWorkbookImport(parsed, { sheetNames: ['제품속성표'] });

        expect(result.counts.salesEstimates).toBe(0);
        expect(result.counts.productAttributes).toBe(1);
        expect(result.selectedSheets).toEqual(['제품속성표']);
    });

    it('reports missing selected worksheets and keeps available sheets unchanged', () => {
        const result = parseWorkbookImport(workbook([]), { sheetNames: ['QFD'] });

        expect(result.errors).toContain('요청한 워크시트 "QFD"를 찾을 수 없습니다.');
        expect(result.selectedSheets).toEqual([]);
    });

    it('detects broken worksheet formulas before applying data', () => {
        const issues = validateWorkbookFormulas(workbook([
            sheet('자금소요계획표', [['구분']], { E4: '자사매출추정표!#REF!' }),
        ]));

        expect(issues).toEqual([
            {
                sheet: '자금소요계획표',
                cell: 'E4',
                formula: '자사매출추정표!#REF!',
                message: '깨진 #REF! 수식이 있습니다.',
            },
        ]);
    });

    it('exposes the worksheet keys the UI can offer for partial import', () => {
        expect(getImportableSheetKeys()).toContain('제품속성표');
        expect(getImportableSheetKeys()).toContain('QFD');
    });
});
