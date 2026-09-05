// Kano 엑셀 업로드 라우트의 기존 저장 계약을 고정하는 특성화 테스트다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';

const findManyRequirement = vi.fn();
const tx = {
    kanoResponse: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
    },
    kanoSurveyInvitation: {
        deleteMany: vi.fn(),
        upsert: vi.fn(),
    },
};
const transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx));

vi.mock('../lib/prisma', () => ({
    prisma: {
        customerRequirement: { findMany: findManyRequirement },
        $transaction: transaction,
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { POST } = await import('../app/api/projects/[id]/kano/upload-excel/route');

const PROJECT_ID = 'project_1';
const USER = { userId: 'user_1', email: 'owner@example.test', name: null };
const REQUIREMENTS = [{ id: 'requirement_1' }, { id: 'requirement_2' }];
const params = { params: Promise.resolve({ id: PROJECT_ID }) };

function kanoTemplateFile(responseRows: unknown[][] = []): File {
    const rows = [
        ['테스트 프로젝트 Kano 응답 업로드 양식'],
        ['각 응답자는 한 행에 입력하고, 답변 칸에는 1~5 점수를 입력하세요.'],
        ['email', 'Q1_positive', 'Q1_negative', 'Q2_positive', 'Q2_negative'],
        ...responseRows,
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Kano응답업로드');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new File([new Uint8Array(buffer)], 'kano-responses.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

function uploadRequest(
    writePolicy: 'append' | 'replace' = 'append',
    responseRows: unknown[][] = [['respondent@example.test', 1, 5, 2, 4]]
): NextRequest {
    const formData = new FormData();
    formData.append('file', kanoTemplateFile(responseRows));
    formData.append('format', 'template');
    formData.append('writePolicy', writePolicy);
    return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/kano/upload-excel`, {
        method: 'POST',
        body: formData,
    });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    findManyRequirement.mockResolvedValue(REQUIREMENTS);
    tx.kanoSurveyInvitation.upsert.mockResolvedValue({ id: 'invitation_1' });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/projects/[id]/kano/upload-excel', () => {
    it('요구사항이 없으면 기존 400 오류를 반환한다', async () => {
        findManyRequirement.mockResolvedValue([]);

        const response = await POST(uploadRequest(), params);

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: '먼저 고객요구사항을 등록하세요.',
        });
        expect(transaction).not.toHaveBeenCalled();
    });

    it('파싱된 응답이 없으면 기존 400 오류를 반환한다', async () => {
        const response = await POST(uploadRequest('append', []), params);

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: 'Kano 응답을 찾지 못했습니다. 전용 업로드 양식 또는 Google Forms 응답 시트의 1~5 점수/응답 텍스트를 확인하세요.',
        });
        expect(transaction).not.toHaveBeenCalled();
    });

    it('replace 정책은 프로젝트의 응답과 초대를 차례로 모두 삭제한다', async () => {
        const response = await POST(uploadRequest('replace'), params);

        expect(response.status).toBe(200);
        expect(tx.kanoResponse.deleteMany).toHaveBeenCalledWith({
            where: { projectId: PROJECT_ID },
        });
        expect(tx.kanoSurveyInvitation.deleteMany).toHaveBeenCalledWith({
            where: { projectId: PROJECT_ID },
        });
        expect(tx.kanoResponse.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
            tx.kanoSurveyInvitation.deleteMany.mock.invocationCallOrder[0]
        );
    });

    it('append 정책은 초대를 보존하고 해당 이메일의 응답만 삭제한다', async () => {
        const response = await POST(uploadRequest('append', [
            ['first@example.test', 1, 5, 2, 4],
            ['second@example.test', 2, 5, 3, 4],
        ]), params);

        expect(response.status).toBe(200);
        expect(tx.kanoSurveyInvitation.deleteMany).not.toHaveBeenCalled();
        expect(tx.kanoResponse.deleteMany).toHaveBeenCalledWith({
            where: {
                projectId: PROJECT_ID,
                respondentEmail: {
                    in: ['first@example.test', 'second@example.test'],
                },
            },
        });
    });

    it('성공 응답에 기존 메시지와 집계 결과를 담는다', async () => {
        const response = await POST(uploadRequest('append'), params);

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            success: true,
            message: '1명 응답자의 2개 Kano 응답을 업로드했습니다.',
            respondentCount: 1,
            importedCount: 2,
            writePolicy: 'append',
            sheetName: 'Kano응답업로드',
        });
    });

    it('초대 결과와 요구사항 순서에 맞춰 Kano 분류 행을 생성한다', async () => {
        tx.kanoSurveyInvitation.upsert.mockResolvedValue({ id: 'stored_invitation' });

        const response = await POST(uploadRequest('append'), params);

        expect(response.status).toBe(200);
        expect(tx.kanoResponse.createMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    invitationId: 'stored_invitation',
                    requirementId: 'requirement_1',
                    positiveAnswer: 1,
                    negativeAnswer: 5,
                    kanoCategory: 'O',
                }),
                expect.objectContaining({
                    invitationId: 'stored_invitation',
                    requirementId: 'requirement_2',
                    positiveAnswer: 2,
                    negativeAnswer: 4,
                    kanoCategory: 'I',
                }),
            ],
        });
    });
});
