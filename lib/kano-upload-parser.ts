import * as XLSX from 'xlsx';
import type { KanoAnswer } from '@/lib/kano-algorithm';

export type ParsedKanoUploadAnswer = {
    respondentEmail: string;
    requirementIndex: number;
    positiveAnswer: KanoAnswer;
    negativeAnswer: KanoAnswer;
};

const ANSWER_TEXT: Array<[RegExp, KanoAnswer]> = [
    [/^\s*1\s*$|마음에\s*든다|like/i, 1],
    [/^\s*2\s*$|당연|expect/i, 2],
    [/^\s*3\s*$|아무런\s*느낌|아무렇지\s*않다|중립|neutral/i, 3],
    [/^\s*4\s*$|하는수\s*없|참을\s*수\s*있다|tolerate/i, 4],
    [/^\s*5\s*$|마음에\s*안\s*든다|마음에\s*안든다|dislike/i, 5],
];

const META_HEADER_PATTERNS = [
    /timestamp/i,
    /타임스탬프/,
    /^email$/i,
    /email address/i,
    /이메일/,
    /응답자/,
    /respondent/i,
];

export function normalizeKanoUploadAnswer(value: unknown): KanoAnswer | null {
    if (typeof value === 'number' && value >= 1 && value <= 5) return value as KanoAnswer;
    const text = String(value ?? '').trim();
    if (!text) return null;
    return ANSWER_TEXT.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function getRespondentEmail(row: Record<string, unknown>, rowIndex: number): string {
    const emailEntry = Object.entries(row).find(([key]) =>
        /^email$/i.test(key) ||
        /email address/i.test(key) ||
        /이메일/.test(key) ||
        /응답자/.test(key) ||
        /respondent/i.test(key)
    );
    const value = String(emailEntry?.[1] ?? '').trim();
    return value || `google-form-row-${rowIndex + 1}@import.local`;
}

function isMetaHeader(header: string): boolean {
    return META_HEADER_PATTERNS.some((pattern) => pattern.test(header.trim()));
}

function firstAnswer(row: Record<string, unknown>, keys: string[]): KanoAnswer | null {
    for (const key of keys) {
        const answer = normalizeKanoUploadAnswer(row[key]);
        if (answer) return answer;
    }
    return null;
}

export function parseGoogleFormsResponseRows(
    rows: Record<string, unknown>[],
    requirementCount: number
): ParsedKanoUploadAnswer[] {
    const parsed: ParsedKanoUploadAnswer[] = [];

    rows.forEach((row, rowIndex) => {
        const headers = Object.keys(row).filter((key) => key.trim() && !isMetaHeader(key));
        const positiveHeaders = headers.filter((key) => /\[?긍정\]?|positive|functional/i.test(key));
        const negativeHeaders = headers.filter((key) => /\[?부정\]?|negative|dysfunctional/i.test(key));
        const respondentEmail = getRespondentEmail(row, rowIndex);

        for (let reqIndex = 0; reqIndex < requirementCount; reqIndex++) {
            const orderedPositive = positiveHeaders[reqIndex];
            const orderedNegative = negativeHeaders[reqIndex];
            const fallbackPositive = headers[reqIndex * 2];
            const fallbackNegative = headers[reqIndex * 2 + 1];
            const positiveAnswer = firstAnswer(row, [orderedPositive, fallbackPositive].filter(Boolean));
            const negativeAnswer = firstAnswer(row, [orderedNegative, fallbackNegative].filter(Boolean));

            if (positiveAnswer && negativeAnswer) {
                parsed.push({
                    respondentEmail,
                    requirementIndex: reqIndex,
                    positiveAnswer,
                    negativeAnswer,
                });
            }
        }
    });

    return parsed;
}

export function parseGoogleFormsResponseSheet(
    sheet: XLSX.WorkSheet,
    requirementCount: number
): ParsedKanoUploadAnswer[] {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    return parseGoogleFormsResponseRows(rows, requirementCount);
}

function normalizeHeader(value: unknown): string {
    return String(value ?? '').trim();
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
    const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase());
    return headers.findIndex((header) => normalizedCandidates.includes(header.toLowerCase()));
}

export function parseKanoTemplateResponseRows(
    rows: unknown[][],
    requirementCount: number
): ParsedKanoUploadAnswer[] {
    const headerRowIndex = rows.findIndex((row) => {
        const headers = row.map(normalizeHeader);
        return headers.some((header) => /^email$/i.test(header)) &&
            headers.some((header) => /^q1_positive$/i.test(header)) &&
            headers.some((header) => /^q1_negative$/i.test(header));
    });
    if (headerRowIndex < 0) return [];

    const headers = rows[headerRowIndex].map(normalizeHeader);
    const emailIndex = findHeaderIndex(headers, ['email', 'Email', '이메일', '응답자', 'respondent']);
    const parsed: ParsedKanoUploadAnswer[] = [];

    rows.slice(headerRowIndex + 1).forEach((row, rowIndex) => {
        const hasAnyValue = row.some((value) => String(value ?? '').trim());
        if (!hasAnyValue) return;

        const respondentEmail = String(
            emailIndex >= 0 ? row[emailIndex] : `excel-row-${rowIndex + 1}@import.local`
        ).trim() || `excel-row-${rowIndex + 1}@import.local`;

        for (let reqIndex = 0; reqIndex < requirementCount; reqIndex++) {
            const no = reqIndex + 1;
            const positiveIndex = findHeaderIndex(headers, [
                `Q${no}_positive`,
                `q${no}_positive`,
                `${no}_positive`,
                `${no} 긍정`,
                `긍정${no}`,
            ]);
            const negativeIndex = findHeaderIndex(headers, [
                `Q${no}_negative`,
                `q${no}_negative`,
                `${no}_negative`,
                `${no} 부정`,
                `부정${no}`,
            ]);
            if (positiveIndex < 0 || negativeIndex < 0) continue;

            const positiveAnswer = normalizeKanoUploadAnswer(row[positiveIndex]);
            const negativeAnswer = normalizeKanoUploadAnswer(row[negativeIndex]);
            if (positiveAnswer && negativeAnswer) {
                parsed.push({
                    respondentEmail,
                    requirementIndex: reqIndex,
                    positiveAnswer,
                    negativeAnswer,
                });
            }
        }
    });

    return parsed;
}

export function parseKanoTemplateResponseSheet(
    sheet: XLSX.WorkSheet,
    requirementCount: number
): ParsedKanoUploadAnswer[] {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    return parseKanoTemplateResponseRows(rows, requirementCount);
}

function selectedMatrixAnswer(row: unknown[], startCol: number): KanoAnswer | null {
    for (let offset = 0; offset < 5; offset++) {
        const value = row[startCol + offset];
        const text = String(value ?? '').trim().toLowerCase();
        if (value === 1 || value === '1' || value === true || text === 'x' || text === '✓' || text === '○' || text === '●') {
            return (offset + 1) as KanoAnswer;
        }
    }
    return null;
}

function isWorksheetMatrixStart(rows: unknown[][], col: number): boolean {
    const respondentNo = String((rows[0] || [])[col] ?? '').trim();
    const firstChoiceHeader = String((rows[1] || [])[col] ?? '').trim();
    return Boolean(respondentNo && firstChoiceHeader);
}

function findWorksheetMatrixStartColumns(rows: unknown[][]): number[] {
    const headerRow = rows[0] || [];
    const starts: number[] = [];

    for (let col = 0; col < headerRow.length; col++) {
        if (isWorksheetMatrixStart(rows, col)) {
            starts.push(col);
        }
    }

    return starts;
}

export function parseWorksheetMatrixRows(
    rows: unknown[][],
    requirementCount: number
): ParsedKanoUploadAnswer[] {
    const parsed: ParsedKanoUploadAnswer[] = [];
    const startColumns = findWorksheetMatrixStartColumns(rows);

    startColumns.forEach((startCol, respondentIndex) => {
        const respondentNo = String((rows[0] || [])[startCol] ?? '').trim();
        const respondentEmail = `excel-respondent-${respondentNo || respondentIndex + 1}@import.local`;

        for (let reqIndex = 0; reqIndex < requirementCount; reqIndex++) {
            const positiveRow = rows[2 + reqIndex * 2] || [];
            const negativeRow = rows[3 + reqIndex * 2] || [];
            const positiveAnswer = selectedMatrixAnswer(positiveRow, startCol);
            const negativeAnswer = selectedMatrixAnswer(negativeRow, startCol);

            if (positiveAnswer && negativeAnswer) {
                parsed.push({
                    respondentEmail,
                    requirementIndex: reqIndex,
                    positiveAnswer,
                    negativeAnswer,
                });
            }
        }
    });

    return parsed;
}

export function parseWorksheetMatrixSheet(
    sheet: XLSX.WorkSheet,
    requirementCount: number
): ParsedKanoUploadAnswer[] {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    return parseWorksheetMatrixRows(rows, requirementCount);
}
