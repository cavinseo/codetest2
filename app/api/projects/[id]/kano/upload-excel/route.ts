import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { guardUploadedExcel } from '@/lib/upload-guard';
import type { KanoAnswer } from '@/lib/kano-algorithm';
import {
    parseGoogleFormsResponseSheet,
    parseKanoTemplateResponseSheet,
    parseWorksheetMatrixSheet,
    type ParsedKanoUploadAnswer,
} from '@/lib/kano-upload-parser';
import { parseWritePolicy, persistKanoUploadAnswers } from '@/lib/kano-response-store';

const ANSWER_TEXT: Array<[RegExp, KanoAnswer]> = [
    [/^\s*1\s*$|마음에\s*든다|like/i, 1],
    [/^\s*2\s*$|당연|expect/i, 2],
    [/^\s*3\s*$|아무런\s*느낌|중립|neutral/i, 3],
    [/^\s*4\s*$|할\s*수\s*없|하는수\s*없|참을|tolerate/i, 4],
    [/^\s*5\s*$|마음에\s*안\s*든다|마음에\s*안든다|안\s*든다|싫|dislike/i, 5],
];

function normalizeAnswer(value: unknown): KanoAnswer | null {
    if (typeof value === 'number' && value >= 1 && value <= 5) return value as KanoAnswer;
    const text = String(value ?? '').trim();
    if (!text) return null;
    return ANSWER_TEXT.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function selectedAnswerFromRow(row: unknown[], startCol: number): KanoAnswer | null {
    for (let offset = 0; offset < 5; offset++) {
        const value = row[startCol + offset];
        if (value === 1 || value === '1' || value === true || String(value ?? '').trim() === '○' || String(value ?? '').trim().toLowerCase() === 'x') {
            return (offset + 1) as KanoAnswer;
        }
    }
    return null;
}

function parseTabularResponses(sheet: XLSX.WorkSheet, requirementCount: number): ParsedKanoUploadAnswer[] {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const parsed: ParsedKanoUploadAnswer[] = [];

    rows.forEach((row, rowIndex) => {
        const entries = Object.entries(row);
        const respondentEmail = String(
            row.email ?? row.Email ?? row['이메일'] ?? row['응답자'] ?? row['respondent'] ?? `excel-row-${rowIndex + 1}@import.local`
        ).trim();

        for (let reqIndex = 0; reqIndex < requirementCount; reqIndex++) {
            const positiveCandidates = [
                row[`Q${reqIndex + 1}_positive`],
                row[`q${reqIndex + 1}_positive`],
                row[`${reqIndex + 1}_positive`],
                row[`${reqIndex + 1} 긍정`],
                row[`긍정${reqIndex + 1}`],
            ];
            const negativeCandidates = [
                row[`Q${reqIndex + 1}_negative`],
                row[`q${reqIndex + 1}_negative`],
                row[`${reqIndex + 1}_negative`],
                row[`${reqIndex + 1} 부정`],
                row[`부정${reqIndex + 1}`],
            ];

            const loosePositive = entries.find(([key]) => key.includes(`${reqIndex + 1}`) && /positive|긍정/i.test(key))?.[1];
            const looseNegative = entries.find(([key]) => key.includes(`${reqIndex + 1}`) && /negative|부정/i.test(key))?.[1];
            const positiveAnswer = [...positiveCandidates, loosePositive].map(normalizeAnswer).find(Boolean);
            const negativeAnswer = [...negativeCandidates, looseNegative].map(normalizeAnswer).find(Boolean);

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

function pickKanoUploadSheet(workbook: XLSX.WorkBook, format: string): string | undefined {
    if (format === 'googleForms') {
        return workbook.SheetNames.find((name) => /form responses|responses|응답/i.test(name)) ?? workbook.SheetNames[0];
    }
    return workbook.SheetNames.find((name) => name.includes('KANO') || name.includes('Kano') || name.includes('질문지')) ?? workbook.SheetNames[0];
}

function parseByUploadFormat(sheet: XLSX.WorkSheet, requirementCount: number, format: string): ParsedKanoUploadAnswer[] {
    const parsers = format === 'googleForms'
        ? [parseGoogleFormsResponseSheet, parseKanoTemplateResponseSheet, parseTabularResponses, parseWorksheetMatrixSheet]
        : [parseKanoTemplateResponseSheet, parseWorksheetMatrixSheet, parseTabularResponses, parseGoogleFormsResponseSheet];

    for (const parser of parsers) {
        const answers = parser(sheet, requirementCount);
        if (answers.length > 0) return answers;
    }
    return [];
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const uploadFormat = String(formData.get('format') ?? 'template');
        const writePolicy = parseWritePolicy(formData.get('writePolicy'));
        // 다른 업로드 라우트에는 있던 크기·확장자 검사가 여기만 빠져 있었다.
        const upload = guardUploadedExcel(file);
        if (!upload.ok) {
            return NextResponse.json({ error: upload.failure.error }, { status: upload.failure.status });
        }

        const requirements = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
        });
        if (requirements.length === 0) {
            return NextResponse.json({ error: '먼저 고객요구사항을 등록하세요.' }, { status: 400 });
        }

        const bytes = Buffer.from(await upload.file.arrayBuffer());
        const workbook = XLSX.read(bytes, { type: 'buffer' });
        const sheetName = pickKanoUploadSheet(workbook, uploadFormat);
        if (!sheetName) {
            return NextResponse.json({ error: '엑셀 파일에서 읽을 수 있는 시트를 찾지 못했습니다.' }, { status: 400 });
        }
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            return NextResponse.json({ error: '엑셀 파일에서 읽을 수 있는 시트를 찾지 못했습니다.' }, { status: 400 });
        }

        const answers = parseByUploadFormat(sheet, requirements.length, uploadFormat);
        if (answers.length === 0) {
            return NextResponse.json({ error: 'Kano 응답을 찾지 못했습니다. 전용 업로드 양식 또는 Google Forms 응답 시트의 1~5 점수/응답 텍스트를 확인하세요.' }, { status: 400 });
        }

        const { respondentCount, importedCount } = await persistKanoUploadAnswers({
            projectId,
            invitedBy: accessResult.user.userId,
            writePolicy,
            requirements,
            answers,
        });

        return NextResponse.json({
            success: true,
            message: `${respondentCount}명 응답자의 ${importedCount}개 Kano 응답을 업로드했습니다.`,
            respondentCount,
            importedCount,
            writePolicy,
            sheetName,
        });
    } catch (error) {
        console.error('Kano Excel upload failed:', error);
        return NextResponse.json({ error: 'Kano 엑셀 업로드에 실패했습니다.' }, { status: 500 });
    }
}
