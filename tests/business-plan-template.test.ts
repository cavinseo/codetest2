import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
    BusinessPlanTemplateError,
    SHEET_NAME,
    buildBusinessPlanTemplateWorkbook,
    parseBusinessPlanGrid,
    parseBusinessPlanWorkbook,
    writeBusinessPlanTemplateBuffer,
} from '../lib/business-plan-template';

const HEADER = ['구분', '항목', '내용', '작성 도움말'];

function filledGrid(overrides: Record<string, string> = {}) {
    const value = (label: string, fallback: string) => overrides[label] ?? fallback;
    return [
        ['KS-QFD 사업계획 입력 양식'],
        HEADER,
        ['기본 정보', '프로젝트명', value('프로젝트명', '동호회 솔루션'), '도움말'],
        ['기본 정보', '간단 설명', value('간단 설명', '회원·회비 관리 서비스'), '도움말'],
        ['상세 제품개요', '고객 정의', value('고객 정의', '운영진 1~2인'), '도움말'],
        ['상세 제품개요', '고객 문제 정의', value('고객 문제 정의', '집계에 시간이 든다'), '도움말'],
        ['상세 제품개요', '핵심 기능', value('핵심 기능', '자동 집계'), '도움말'],
    ];
}

describe('buildBusinessPlanTemplateWorkbook', () => {
    it('사업계획 시트와 작성안내 시트를 만든다', () => {
        const workbook = buildBusinessPlanTemplateWorkbook();
        const names = workbook.worksheets.map((sheet) => sheet.name);
        expect(names).toContain(SHEET_NAME);
        expect(names).toContain('작성안내');
    });

    it('다섯 개 항목 라벨을 모두 넣는다', () => {
        const sheet = buildBusinessPlanTemplateWorkbook().getWorksheet(SHEET_NAME)!;
        const labels: string[] = [];
        sheet.eachRow((row) => {
            const label = row.getCell(2).value;
            if (typeof label === 'string') labels.push(label);
        });

        expect(labels).toEqual(
            expect.arrayContaining(['프로젝트명', '간단 설명', '고객 정의', '고객 문제 정의', '핵심 기능'])
        );
    });

    it('입력 칸에 테두리를 넣는다', () => {
        const sheet = buildBusinessPlanTemplateWorkbook().getWorksheet(SHEET_NAME)!;
        let bordered = 0;
        sheet.eachRow((row) => {
            const cell = row.getCell(3);
            if (cell.border?.top?.style === 'thin' && cell.border?.left?.style === 'thin') bordered++;
        });
        // 헤더 1줄 + 항목 5줄
        expect(bordered).toBe(6);
    });

    it('프로젝트명을 주면 해당 칸을 미리 채운다', () => {
        const sheet = buildBusinessPlanTemplateWorkbook('기존 프로젝트').getWorksheet(SHEET_NAME)!;
        let found = '';
        sheet.eachRow((row) => {
            if (row.getCell(2).value === '프로젝트명') found = String(row.getCell(3).value ?? '');
        });
        expect(found).toBe('기존 프로젝트');
    });
});

describe('writeBusinessPlanTemplateBuffer', () => {
    it('테두리 정의가 실제 파일에 들어간다', async () => {
        const buffer = await writeBusinessPlanTemplateBuffer();
        // xlsx 는 zip 이라 원문에 styles.xml 이 들어 있다. 테두리 정의가 남았는지 본다.
        const workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true });
        expect(workbook.SheetNames).toContain(SHEET_NAME);
        expect(buffer.length).toBeGreaterThan(0);
    });

    it('내려받은 양식을 그대로 다시 읽을 수 있다', async () => {
        const buffer = await writeBusinessPlanTemplateBuffer('왕복 테스트');
        const parsed = parseBusinessPlanWorkbook(buffer);
        expect(parsed.name).toBe('왕복 테스트');
    });
});

describe('parseBusinessPlanGrid', () => {
    it('채워진 양식에서 다섯 항목을 모두 읽는다', () => {
        const parsed = parseBusinessPlanGrid(filledGrid());

        expect(parsed.name).toBe('동호회 솔루션');
        expect(parsed.description).toBe('회원·회비 관리 서비스');
        expect(parsed.sections).toEqual({
            customer: '운영진 1~2인',
            problem: '집계에 시간이 든다',
            coreFunctions: '자동 집계',
        });
        expect(parsed.filledLabels).toHaveLength(5);
    });

    it('상세 제품개요를 라벨 붙은 텍스트로 조합한다', () => {
        const parsed = parseBusinessPlanGrid(filledGrid());
        expect(parsed.detailedDescription).toBe(
            '[고객 정의]\n운영진 1~2인\n\n'
            + '[고객 문제 정의]\n집계에 시간이 든다\n\n'
            + '[핵심 기능]\n자동 집계'
        );
    });

    it('비운 항목은 건너뛰고 채운 항목만 보고한다', () => {
        const parsed = parseBusinessPlanGrid(filledGrid({ '간단 설명': '', '핵심 기능': '' }));

        expect(parsed.description).toBe('');
        expect(parsed.sections.coreFunctions).toBe('');
        expect(parsed.filledLabels).toEqual(['프로젝트명', '고객 정의', '고객 문제 정의']);
    });

    it('줄 순서가 바뀌어도 읽는다', () => {
        const rows = filledGrid();
        const reordered = [rows[0], rows[1], rows[6], rows[2], rows[5], rows[3], rows[4]];
        const parsed = parseBusinessPlanGrid(reordered);

        expect(parsed.name).toBe('동호회 솔루션');
        expect(parsed.sections.coreFunctions).toBe('자동 집계');
    });

    it('구분 열을 지운 2열 형태도 읽는다', () => {
        const parsed = parseBusinessPlanGrid([
            ['항목', '내용'],
            ['프로젝트명', '간소 양식'],
            ['고객 정의', '운영진'],
        ]);

        expect(parsed.name).toBe('간소 양식');
        expect(parsed.sections.customer).toBe('운영진');
    });

    it('공백을 뺀 라벨도 인식한다', () => {
        const parsed = parseBusinessPlanGrid([['고객정의', '운영진'], ['핵심기능', '집계']]);
        expect(parsed.sections.customer).toBe('운영진');
        expect(parsed.sections.coreFunctions).toBe('집계');
    });

    it('값 칸이 비면 오른쪽 도움말 열을 값으로 끌어오지 않는다', () => {
        const parsed = parseBusinessPlanGrid([
            HEADER,
            ['기본 정보', '프로젝트명', '', '워크시트 상단에 표시됩니다.'],
        ]);

        expect(parsed.name).toBe('');
        expect(parsed.filledLabels).toEqual([]);
    });

    it('아무 라벨도 없으면 읽은 항목이 없다', () => {
        const parsed = parseBusinessPlanGrid([['관계없는', '표'], ['가', '나']]);
        expect(parsed.filledLabels).toEqual([]);
        expect(parsed.detailedDescription).toBe('');
    });

    it('숫자만 적힌 값도 문자열로 읽는다', () => {
        const parsed = parseBusinessPlanGrid([['프로젝트명', 2026]]);
        expect(parsed.name).toBe('2026');
    });
});

describe('parseBusinessPlanWorkbook', () => {
    function toBuffer(grid: unknown[][], sheetName = SHEET_NAME) {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(grid), sheetName);
        return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    it('업로드한 양식을 파싱한다', () => {
        const parsed = parseBusinessPlanWorkbook(toBuffer(filledGrid()));
        expect(parsed.name).toBe('동호회 솔루션');
        expect(parsed.sections.problem).toBe('집계에 시간이 든다');
    });

    it('시트 이름이 달라도 첫 시트로 넘어간다', () => {
        const parsed = parseBusinessPlanWorkbook(toBuffer(filledGrid(), 'Sheet1'));
        expect(parsed.name).toBe('동호회 솔루션');
    });

    it('읽을 항목이 없으면 안내 오류를 던진다', () => {
        expect(() => parseBusinessPlanWorkbook(toBuffer([['가', '나']])))
            .toThrow(BusinessPlanTemplateError);
    });

    it('엑셀이 아닌 데이터는 오류를 던진다', () => {
        expect(() => parseBusinessPlanWorkbook(Buffer.from('이건 엑셀이 아닙니다')))
            .toThrow(BusinessPlanTemplateError);
    });
});
