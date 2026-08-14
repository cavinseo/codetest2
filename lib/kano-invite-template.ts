// WS-6 응답자 초대를 한 번에 여러 명 보내기 위한 명단 양식 생성/파싱 유틸리티
import * as XLSX from 'xlsx';

export interface ParsedInviteRow {
    email: string;
    name: string;
}

export interface ParsedInviteList {
    rows: ParsedInviteRow[];
    // 형식이 잘못됐거나 중복이라 건너뛴 줄을 사용자에게 그대로 보여준다.
    skipped: Array<{ value: string; reason: string }>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 안내 문구("이메일 열만 채우면 됩니다")를 헤더로 착각하지 않도록 정확한 라벨만 인정한다.
const EMAIL_HEADERS = new Set(['email', 'e-mail', 'emailaddress', '메일', '메일주소', '이메일', '이메일주소']);
const NAME_HEADERS = new Set(['name', '이름', '성명', '담당자', '응답자', '응답자명']);

const GUIDE_ROWS = [
    ['작성 방법'],
    ['1. 이메일 열에 초대할 응답자의 메일 주소를 한 줄에 한 명씩 입력하세요.'],
    ['2. 이름 열은 비워 두어도 됩니다. 초대 메일 본문에는 사용되지 않고 관리용으로만 쓰입니다.'],
    ['3. 예시 행은 지우고 업로드하세요. 지우지 않아도 example.com 주소는 자동으로 건너뜁니다.'],
    ['4. 이미 초대한 주소가 섞여 있어도 됩니다. 중복은 자동으로 건너뜁니다.'],
];

export function buildKanoInviteTemplateWorkbook(projectName = 'Kano 설문') {
    const headers = ['이메일', '이름'];
    const rows = [
        [`${projectName} 응답자 초대 명단`],
        ['이메일 열만 채우면 됩니다. 아래 예시 행은 지우고 사용하세요.'],
        headers,
        ['respondent1@example.com', '홍길동'],
        ['respondent2@example.com', ''],
    ];

    const listSheet = XLSX.utils.aoa_to_sheet(rows);
    listSheet['!cols'] = [{ wch: 36 }, { wch: 18 }];

    const guideSheet = XLSX.utils.aoa_to_sheet(GUIDE_ROWS);
    guideSheet['!cols'] = [{ wch: 80 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, listSheet, '응답자초대명단');
    XLSX.utils.book_append_sheet(workbook, guideSheet, '작성안내');
    return workbook;
}

export function writeKanoInviteTemplateBuffer(projectName = 'Kano 설문'): Buffer {
    return XLSX.write(buildKanoInviteTemplateWorkbook(projectName), {
        type: 'buffer',
        bookType: 'xlsx',
    });
}

// 업로드한 명단 파일에서 이메일을 뽑아낸다.
// 안내 문구가 위에 몇 줄 있어도 되도록, 헤더 행을 찾아 그 아래부터 읽는다.
export function parseKanoInviteWorkbook(buffer: Buffer): ParsedInviteList {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.find((name) => name.includes('명단')) ?? workbook.SheetNames[0];
    if (!sheetName) return { rows: [], skipped: [] };

    const sheet = workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });

    return parseKanoInviteGrid(grid);
}

export function parseKanoInviteGrid(grid: unknown[][]): ParsedInviteList {
    const { emailIndex, nameIndex, startRow } = locateColumns(grid);
    const rows: ParsedInviteRow[] = [];
    const skipped: ParsedInviteList['skipped'] = [];
    const seen = new Set<string>();

    for (let rowIndex = startRow; rowIndex < grid.length; rowIndex++) {
        const row = grid[rowIndex] ?? [];
        const rawEmail = cellText(row[emailIndex]);
        const name = nameIndex >= 0 ? cellText(row[nameIndex]) : '';

        // 이메일 열이 비었는데 다른 칸에 값이 있으면 아예 무시하지 않고 알려 준다.
        if (!rawEmail) {
            if (name) skipped.push({ value: name, reason: '이메일이 비어 있습니다.' });
            continue;
        }

        const email = rawEmail.toLowerCase();

        if (!EMAIL_PATTERN.test(email)) {
            skipped.push({ value: rawEmail, reason: '이메일 형식이 아닙니다.' });
            continue;
        }

        // 양식에 남아 있는 예시 행은 조용히 건너뛴다.
        if (email.endsWith('@example.com')) continue;

        if (seen.has(email)) {
            skipped.push({ value: rawEmail, reason: '파일 안에서 중복된 주소입니다.' });
            continue;
        }

        seen.add(email);
        rows.push({ email, name });
    }

    return { rows, skipped };
}

// 붙여 넣기 입력(줄바꿈·쉼표·세미콜론 구분)도 같은 규칙으로 처리한다.
export function parseInviteEmailText(text: string): ParsedInviteList {
    const tokens = text.split(/[\s,;]+/).map((token) => token.trim()).filter(Boolean);
    return parseKanoInviteGrid([['이메일'], ...tokens.map((token) => [token])]);
}

function locateColumns(grid: unknown[][]) {
    for (let rowIndex = 0; rowIndex < Math.min(grid.length, 10); rowIndex++) {
        const row = grid[rowIndex] ?? [];
        const emailIndex = row.findIndex((cell) => EMAIL_HEADERS.has(normalizeHeader(cell)));
        if (emailIndex === -1) continue;

        const nameIndex = row.findIndex((cell) => NAME_HEADERS.has(normalizeHeader(cell)));
        return { emailIndex, nameIndex, startRow: rowIndex + 1 };
    }

    // 헤더를 못 찾으면 첫 번째 열을 이메일로 보고 처음부터 읽는다.
    return { emailIndex: 0, nameIndex: -1, startRow: 0 };
}

function normalizeHeader(value: unknown): string {
    return cellText(value).replace(/[\s()*]/g, '').toLowerCase();
}

function cellText(value: unknown): string {
    return String(value ?? '').trim();
}
