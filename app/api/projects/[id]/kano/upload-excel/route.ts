import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { generateId } from '@/lib/id';
import { classifyKanoResponse, type KanoAnswer } from '@/lib/kano-algorithm';

type ParsedAnswer = {
    respondentEmail: string;
    requirementIndex: number;
    positiveAnswer: KanoAnswer;
    negativeAnswer: KanoAnswer;
};

const ANSWER_TEXT: Array<[RegExp, KanoAnswer]> = [
    [/^\s*1\s*$|마음에\s*든다|like/i, 1],
    [/^\s*2\s*$|당연|expect/i, 2],
    [/^\s*3\s*$|아무런\s*느낌|중립|neutral/i, 3],
    [/^\s*4\s*$|할\s*수\s*없|하는수\s*없|참을|tolerate/i, 4],
    [/^\s*5\s*$|안\s*든다|싫|dislike/i, 5],
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

function parseWorksheetMatrix(sheet: XLSX.WorkSheet, requirementCount: number): ParsedAnswer[] {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    const parsed: ParsedAnswer[] = [];
    const headerRow = rows[0] || [];

    for (let startCol = 4; startCol < headerRow.length; startCol += 12) {
        const respondentNo = String(headerRow[startCol] ?? '').trim();
        const hasAnswerHeader = String((rows[1] || [])[startCol] ?? '').includes('마음에');
        if (!respondentNo && !hasAnswerHeader) continue;

        const respondentEmail = `excel-respondent-${respondentNo || Math.floor((startCol - 4) / 12) + 1}@import.local`;

        for (let reqIndex = 0; reqIndex < requirementCount; reqIndex++) {
            const positiveRow = rows[2 + reqIndex * 2] || [];
            const negativeRow = rows[3 + reqIndex * 2] || [];
            const positiveAnswer = selectedAnswerFromRow(positiveRow, startCol);
            const negativeAnswer = selectedAnswerFromRow(negativeRow, startCol);

            if (positiveAnswer && negativeAnswer) {
                parsed.push({
                    respondentEmail,
                    requirementIndex: reqIndex,
                    positiveAnswer,
                    negativeAnswer,
                });
            }
        }
    }

    return parsed;
}

function parseTabularResponses(sheet: XLSX.WorkSheet, requirementCount: number): ParsedAnswer[] {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const parsed: ParsedAnswer[] = [];

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

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!(file instanceof File)) {
            return NextResponse.json({ error: '업로드할 엑셀 파일이 필요합니다.' }, { status: 400 });
        }

        const requirements = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
        });
        if (requirements.length === 0) {
            return NextResponse.json({ error: '먼저 고객요구사항을 등록하세요.' }, { status: 400 });
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(bytes, { type: 'buffer' });
        const sheetName = workbook.SheetNames.find((name) => name.includes('KANO') || name.includes('Kano') || name.includes('질문지')) ?? workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            return NextResponse.json({ error: '엑셀 파일에서 읽을 수 있는 시트를 찾지 못했습니다.' }, { status: 400 });
        }

        const matrixAnswers = parseWorksheetMatrix(sheet, requirements.length);
        const answers = matrixAnswers.length > 0 ? matrixAnswers : parseTabularResponses(sheet, requirements.length);
        if (answers.length === 0) {
            return NextResponse.json({ error: 'Kano 응답을 찾지 못했습니다. 1~5 점수 또는 기준 KANO질문지 체크 형식을 확인하세요.' }, { status: 400 });
        }

        const respondentEmails = Array.from(new Set(answers.map((answer) => answer.respondentEmail)));
        const invitations = new Map<string, string>();

        await prisma.$transaction(async (tx) => {
            await tx.kanoResponse.deleteMany({
                where: {
                    projectId,
                    respondentEmail: { in: respondentEmails },
                },
            });

            for (const email of respondentEmails) {
                const invitation = await tx.kanoSurveyInvitation.upsert({
                    where: { projectId_email: { projectId, email } },
                    update: { respondedAt: new Date(), isUsed: true },
                    create: {
                        id: generateId('inv'),
                        projectId,
                        email,
                        token: `excel_${generateId('inv')}`,
                        invitedBy: accessResult.user.userId,
                        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
                        respondedAt: new Date(),
                        isUsed: true,
                    },
                    select: { id: true },
                });
                invitations.set(email, invitation.id);
            }

            await tx.kanoResponse.createMany({
                data: answers.map((answer) => {
                    const invitationId = invitations.get(answer.respondentEmail);
                    const requirement = requirements[answer.requirementIndex];
                    if (!invitationId || !requirement) throw new Error('Invalid parsed Kano response.');
                    return {
                        id: generateId('response'),
                        invitationId,
                        projectId,
                        requirementId: requirement.id,
                        respondentEmail: answer.respondentEmail,
                        positiveAnswer: answer.positiveAnswer,
                        negativeAnswer: answer.negativeAnswer,
                        kanoCategory: classifyKanoResponse(answer.positiveAnswer, answer.negativeAnswer),
                        respondedAt: new Date(),
                    };
                }),
            });
        });

        return NextResponse.json({
            success: true,
            message: `${respondentEmails.length}명 응답자의 ${answers.length}개 Kano 응답을 업로드했습니다.`,
            respondentCount: respondentEmails.length,
            importedCount: answers.length,
            sheetName,
        });
    } catch (error) {
        console.error('Kano Excel upload failed:', error);
        return NextResponse.json({ error: 'Kano 엑셀 업로드에 실패했습니다.' }, { status: 500 });
    }
}
