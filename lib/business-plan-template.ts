// 개요 자동 입력을 위한 사업계획 엑셀 양식의 생성과 파싱.
//
// 생성은 exceljs 로 한다. 프로젝트가 쓰는 xlsx(SheetJS 커뮤니티 버전)는 쓰기 시
// 셀 스타일(.s)을 조용히 버려서 테두리를 넣을 수 없기 때문이다.
// 파싱은 다른 업로드 경로와 맞추기 위해 기존 xlsx 를 그대로 쓴다.
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {
    BusinessPlanSections,
    SECTION_LABELS,
    formatBusinessPlanSections,
} from './business-plan-sections';

export interface ParsedBusinessPlan {
    name: string;
    description: string;
    sections: BusinessPlanSections;
    detailedDescription: string;
    // 양식에서 실제로 값을 읽어낸 항목. 어디까지 자동 입력됐는지 사용자에게 보여준다.
    filledLabels: string[];
}

export class BusinessPlanTemplateError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BusinessPlanTemplateError';
    }
}

export const SHEET_NAME = '사업계획';
const GUIDE_SHEET_NAME = '작성안내';

const FIELD_LABELS = {
    name: '프로젝트명',
    description: '간단 설명',
    customer: SECTION_LABELS.customer,
    problem: SECTION_LABELS.problem,
    coreFunctions: SECTION_LABELS.coreFunctions,
} as const;

type FieldKey = keyof typeof FIELD_LABELS;

// 라벨 비교는 공백을 모두 지우고 한다. 사용자가 "고객정의"처럼 붙여 써도 읽힌다.
function normalizeLabel(value: string) {
    return value.replace(/\s+/g, '').toLowerCase();
}

const LABEL_LOOKUP = new Map<string, FieldKey>(
    (Object.keys(FIELD_LABELS) as FieldKey[]).map((key) => [normalizeLabel(FIELD_LABELS[key]), key])
);

const FORM_ROWS: Array<{ group: string; key: FieldKey; hint: string; height: number }> = [
    { group: '기본 정보', key: 'name', hint: '워크시트 상단과 목록에 표시될 이름입니다.', height: 30 },
    { group: '기본 정보', key: 'description', hint: '제품·서비스를 한두 문장으로 요약하세요.', height: 60 },
    { group: '상세 제품개요', key: 'customer', hint: '누가 쓰는 제품인지 대상 고객을 구체적으로 적으세요.', height: 90 },
    { group: '상세 제품개요', key: 'problem', hint: '그 고객이 겪는 문제와 불편을 적으세요.', height: 90 },
    { group: '상세 제품개요', key: 'coreFunctions', hint: '문제를 푸는 핵심기능을 줄바꿈으로 나열하세요. WS-2 작성에 그대로 쓰입니다.', height: 120 },
];

const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FF94A3B8' } },
};

const GUIDE_LINES = [
    ['작성 방법'],
    ['1. "사업계획" 시트의 [내용] 칸에만 입력하세요. 구분·항목 칸은 그대로 두어야 자동 인식됩니다.'],
    ['2. 항목 이름을 바꾸거나 지우면 해당 줄은 읽지 못합니다. 줄 순서는 바꿔도 됩니다.'],
    ['3. 비워 둔 항목은 자동 입력에서 건너뜁니다. 기존에 입력해 둔 값은 지워지지 않습니다.'],
    ['4. 한 칸 안에서 줄을 바꾸려면 Alt+Enter 를 쓰세요.'],
    [''],
    ['작성 예시'],
    [`${FIELD_LABELS.name}: 동호회 운영 관리 솔루션`],
    [`${FIELD_LABELS.description}: 소규모 동호회의 회원·회비·일정 관리를 한 곳에서 처리하는 웹 서비스`],
    [`${FIELD_LABELS.customer}: 회원 10~30명 규모 비영리 동호회의 운영진 1~2인 (대개 본업과 겸업)`],
    [`${FIELD_LABELS.problem}: 회원 명부와 회비 납부 현황이 메신저·엑셀에 흩어져 있어 미납자 파악에 매달 수 시간이 든다.`],
    [`${FIELD_LABELS.coreFunctions}: 회원 명부 통합 관리 / 회비 납부 현황 자동 집계 / 미납자 자동 안내 / 일정 조율`],
];

export function buildBusinessPlanTemplateWorkbook(projectName?: string) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KS-QFD';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(SHEET_NAME);
    sheet.columns = [
        { key: 'group', width: 16 },
        { key: 'label', width: 26 },
        { key: 'value', width: 78 },
        { key: 'hint', width: 52 },
    ];

    const titleRow = sheet.addRow(['KS-QFD 사업계획 입력 양식']);
    sheet.mergeCells(titleRow.number, 1, titleRow.number, 4);
    titleRow.getCell(1).font = { bold: true, size: 14 };
    titleRow.getCell(1).alignment = { vertical: 'middle' };
    titleRow.height = 28;

    const noticeRow = sheet.addRow(['[내용] 칸에만 입력하세요. 항목 이름은 바꾸지 마세요.']);
    sheet.mergeCells(noticeRow.number, 1, noticeRow.number, 4);
    noticeRow.getCell(1).font = { size: 10, color: { argb: 'FF64748B' } };

    sheet.addRow([]);

    const headerRow = sheet.addRow(['구분', '항목', '내용', '작성 도움말']);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = THIN_BORDER;
    });

    const firstFormRowNumber = headerRow.number + 1;
    FORM_ROWS.forEach((definition) => {
        const isName = definition.key === 'name';
        const row = sheet.addRow([
            definition.group,
            FIELD_LABELS[definition.key],
            isName && projectName ? projectName : '',
            definition.hint,
        ]);
        row.height = definition.height;

        row.getCell(1).font = { bold: true };
        row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

        row.getCell(2).font = { bold: true };
        row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

        // 입력 칸은 흰 바탕으로 둬서 어디에 쓰는지 한눈에 구분되게 한다.
        row.getCell(3).alignment = { vertical: 'top', wrapText: true };

        row.getCell(4).font = { size: 9, color: { argb: 'FF64748B' } };
        row.getCell(4).alignment = { vertical: 'top', wrapText: true };

        row.eachCell({ includeEmpty: true }, (cell) => {
            cell.border = THIN_BORDER;
        });
    });

    // 같은 구분끼리 세로 병합해 폼처럼 보이게 한다.
    let blockStart = firstFormRowNumber;
    for (let index = 1; index <= FORM_ROWS.length; index++) {
        const isLast = index === FORM_ROWS.length;
        const changed = !isLast && FORM_ROWS[index].group !== FORM_ROWS[index - 1].group;
        if (isLast || changed) {
            const blockEnd = firstFormRowNumber + index - 1;
            if (blockEnd > blockStart) sheet.mergeCells(blockStart, 1, blockEnd, 1);
            blockStart = blockEnd + 1;
        }
    }

    const guideSheet = workbook.addWorksheet(GUIDE_SHEET_NAME);
    guideSheet.columns = [{ key: 'text', width: 110 }];
    GUIDE_LINES.forEach((line, index) => {
        const row = guideSheet.addRow(line);
        if (line[0] === '작성 방법' || line[0] === '작성 예시') {
            row.getCell(1).font = { bold: true, size: 12 };
        }
        if (index > 0) row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    });

    return workbook;
}

export async function writeBusinessPlanTemplateBuffer(projectName?: string): Promise<Buffer> {
    const workbook = buildBusinessPlanTemplateWorkbook(projectName);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
}

function cellText(value: unknown) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
    return '';
}

export function parseBusinessPlanGrid(grid: unknown[][]): ParsedBusinessPlan {
    const values: Record<FieldKey, string> = {
        name: '', description: '', customer: '', problem: '', coreFunctions: '',
    };
    const filledLabels: string[] = [];

    for (const row of grid) {
        if (!Array.isArray(row)) continue;
        // 라벨이 어느 열에 있든 찾되, 값은 "바로 다음 칸"만 본다.
        // 빈 칸을 건너뛰며 훑으면 양식의 작성 도움말 열까지 값으로 집어삼킨다.
        for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
            const key = LABEL_LOOKUP.get(normalizeLabel(cellText(row[columnIndex])));
            if (!key || values[key]) continue;

            const candidate = cellText(row[columnIndex + 1]);
            if (candidate && !LABEL_LOOKUP.has(normalizeLabel(candidate))) {
                values[key] = candidate;
                filledLabels.push(FIELD_LABELS[key]);
            }
            break;
        }
    }

    const sections: BusinessPlanSections = {
        customer: values.customer,
        problem: values.problem,
        coreFunctions: values.coreFunctions,
    };

    return {
        name: values.name,
        description: values.description,
        sections,
        detailedDescription: formatBusinessPlanSections(sections),
        filledLabels,
    };
}

export function parseBusinessPlanWorkbook(buffer: Buffer): ParsedBusinessPlan {
    let workbook: XLSX.WorkBook;
    try {
        workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
        throw new BusinessPlanTemplateError('엑셀 파일을 읽지 못했습니다. 양식 파일이 맞는지 확인하세요.');
    }

    const sheetName = workbook.SheetNames.find((name) => name.includes(SHEET_NAME))
        ?? workbook.SheetNames[0];
    if (!sheetName) {
        throw new BusinessPlanTemplateError('엑셀 파일에 시트가 없습니다.');
    }

    const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
        header: 1,
        blankrows: false,
        defval: '',
    });

    const parsed = parseBusinessPlanGrid(grid);
    if (parsed.filledLabels.length === 0) {
        throw new BusinessPlanTemplateError(
            '양식에서 읽을 수 있는 항목이 없습니다. 양식을 다시 내려받아 [내용] 칸에 입력했는지 확인하세요.'
        );
    }
    return parsed;
}
