// Kano 오프라인 응답지 묶음 업로드의 부분 성공과 중복 차단 계약을 검증한다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findManyRequirement = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        customerRequirement: { findMany: findManyRequirement },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const logError = vi.fn();
vi.mock('../lib/logger', () => ({
    createLogger: () => ({ error: logError }),
}));

const persistKanoUploadAnswers = vi.fn();
vi.mock('../lib/kano-response-store', async () => {
    const actual = await vi.importActual<typeof import('../lib/kano-response-store')>(
        '../lib/kano-response-store'
    );
    return {
        ...actual,
        persistKanoUploadAnswers,
    };
});

const { POST } = await import('../app/api/projects/[id]/kano/upload-offline/route');

const PROJECT_ID = 'proj_1';
const USER = { userId: 'user_1', email: 'owner@example.test', name: null };
const REQUIREMENTS = [{ id: 'requirement_1' }, { id: 'requirement_2' }];
const params = { params: Promise.resolve({ id: PROJECT_ID }) };
const fixturesDirectory = resolve(process.cwd(), 'tests', 'fixtures', 'kano-offline');

function fixtureFile(fileName: string): File {
    return new File(
        [readFileSync(resolve(fixturesDirectory, fileName), 'utf8')],
        fileName,
        { type: 'text/html' }
    );
}

function htmlFile(fileName: string, html: string): File {
    return new File([html], fileName, { type: 'text/html' });
}

function uploadRequest(files: File[], writePolicy: 'append' | 'replace' = 'append'): NextRequest {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('writePolicy', writePolicy);
    return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/kano/upload-offline`, {
        method: 'POST',
        body: formData,
    });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    findManyRequirement.mockResolvedValue(REQUIREMENTS);
    persistKanoUploadAnswers.mockResolvedValue({ respondentCount: 2, importedCount: 3 });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/projects/[id]/kano/upload-offline', () => {
    it('완전 응답과 익명 부분 응답을 한 번에 모아 저장한다', async () => {
        const response = await POST(uploadRequest([
            fixtureFile('saved-complete.html'),
            fixtureFile('saved-partial-no-email.html'),
        ]), params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(requireProjectAccess).toHaveBeenCalledWith(
            expect.any(NextRequest),
            PROJECT_ID,
            { write: true }
        );
        expect(findManyRequirement).toHaveBeenCalledWith({
            where: { projectId: PROJECT_ID },
            orderBy: { order: 'asc' },
            select: { id: true },
        });
        expect(persistKanoUploadAnswers).toHaveBeenCalledTimes(1);
        expect(persistKanoUploadAnswers).toHaveBeenCalledWith({
            projectId: PROJECT_ID,
            invitedBy: USER.userId,
            writePolicy: 'append',
            requirements: REQUIREMENTS,
            answers: [
                {
                    respondentEmail: 'tester@example.com',
                    requirementIndex: 0,
                    positiveAnswer: 1,
                    negativeAnswer: 5,
                },
                {
                    respondentEmail: 'tester@example.com',
                    requirementIndex: 1,
                    positiveAnswer: 2,
                    negativeAnswer: 3,
                },
                {
                    respondentEmail: 'offline-html-2@import.local',
                    requirementIndex: 0,
                    positiveAnswer: 4,
                    negativeAnswer: 2,
                },
            ],
        });
        expect(body).toEqual({
            success: true,
            message: '2장 중 2장에서 2명 응답자의 3개 Kano 응답을 업로드했습니다.',
            respondentCount: 2,
            importedCount: 3,
            fileCount: 2,
            results: [
                { fileName: 'saved-complete.html', status: 'ok', answerCount: 2 },
                { fileName: 'saved-partial-no-email.html', status: 'ok', answerCount: 1 },
            ],
        });
        expect(JSON.stringify(body)).not.toContain('@');
    });

    it('손상된 한 장만 실패시키고 정상 응답지는 한 번 저장한다', async () => {
        persistKanoUploadAnswers.mockResolvedValue({ respondentCount: 1, importedCount: 2 });

        const response = await POST(uploadRequest([
            fixtureFile('saved-complete.html'),
            htmlFile('broken.html', '<html></html>'),
        ]), params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(persistKanoUploadAnswers).toHaveBeenCalledTimes(1);
        expect(body.results).toEqual([
            { fileName: 'saved-complete.html', status: 'ok', answerCount: 2 },
            {
                fileName: 'broken.html',
                status: 'failed',
                reason: '오프라인 응답지 형식이 아닙니다. 설문지에서 「응답 저장」 으로 만든 HTML 을 올려 주세요.',
            },
        ]);
    });

    it('같은 응답자의 재저장본은 뒤 파일만 실패시키고 첫 응답만 저장한다', async () => {
        persistKanoUploadAnswers.mockResolvedValue({ respondentCount: 1, importedCount: 2 });

        const response = await POST(uploadRequest([
            fixtureFile('saved-complete.html'),
            fixtureFile('saved-resaved.html'),
        ]), params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(persistKanoUploadAnswers).toHaveBeenCalledTimes(1);
        expect(persistKanoUploadAnswers).toHaveBeenCalledWith(expect.objectContaining({
            answers: [
                {
                    respondentEmail: 'tester@example.com',
                    requirementIndex: 0,
                    positiveAnswer: 1,
                    negativeAnswer: 5,
                },
                {
                    respondentEmail: 'tester@example.com',
                    requirementIndex: 1,
                    positiveAnswer: 2,
                    negativeAnswer: 3,
                },
            ],
        }));
        expect(body.results).toEqual([
            { fileName: 'saved-complete.html', status: 'ok', answerCount: 2 },
            {
                fileName: 'saved-resaved.html',
                status: 'failed',
                reason: '같은 응답자의 응답지가 이 묶음에 이미 있습니다.',
            },
        ]);
    });

    it('모든 파일이 실패하면 결과 목록을 담은 400을 반환하고 저장하지 않는다', async () => {
        const response = await POST(uploadRequest([
            htmlFile('first.html', '<html></html>'),
            htmlFile('second.html', '<html></html>'),
        ]), params);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe('저장할 수 있는 응답지가 없습니다.');
        expect(body.results).toHaveLength(2);
        expect(body.results.every((result: { status: string }) => result.status === 'failed')).toBe(true);
        expect(persistKanoUploadAnswers).not.toHaveBeenCalled();
    });

    it('101장을 올리면 파일을 읽지 않고 지정된 400 오류를 반환한다', async () => {
        const files = Array.from(
            { length: 101 },
            (_, index) => htmlFile(`response-${index + 1}.html`, '<html></html>')
        );

        const response = await POST(uploadRequest(files), params);

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: '한 번에 100장까지 올릴 수 있습니다.',
        });
        expect(findManyRequirement).not.toHaveBeenCalled();
        expect(persistKanoUploadAnswers).not.toHaveBeenCalled();
    });

    it('정확히 100장은 허용한다', async () => {
        persistKanoUploadAnswers.mockResolvedValue({ respondentCount: 1, importedCount: 2 });
        const fixtureHtml = readFileSync(
            resolve(fixturesDirectory, 'saved-complete.html'),
            'utf8'
        );
        const files = Array.from(
            { length: 100 },
            (_, index) => htmlFile(`response-${index + 1}.html`, fixtureHtml)
        );

        const response = await POST(uploadRequest(files), params);

        expect(response.status).toBe(200);
        expect((await response.json()).fileCount).toBe(100);
        expect(persistKanoUploadAnswers).toHaveBeenCalledTimes(1);
    });

    it('파일이 없으면 지정된 400 오류를 반환한다', async () => {
        const response = await POST(uploadRequest([]), params);

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: '업로드할 HTML 응답지를 선택하세요.',
        });
        expect(findManyRequirement).not.toHaveBeenCalled();
        expect(persistKanoUploadAnswers).not.toHaveBeenCalled();
    });

    it('확장자가 틀린 파일만 실패시키고 정상 HTML은 저장한다', async () => {
        persistKanoUploadAnswers.mockResolvedValue({ respondentCount: 1, importedCount: 2 });
        const invalidFile = new File(['plain text'], 'response.txt', { type: 'text/plain' });

        const response = await POST(uploadRequest([
            invalidFile,
            fixtureFile('saved-complete.html'),
        ]), params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(persistKanoUploadAnswers).toHaveBeenCalledTimes(1);
        expect(body.results).toEqual([
            {
                fileName: 'response.txt',
                status: 'failed',
                reason: '.html 또는 .htm 파일만 업로드할 수 있습니다.',
            },
            { fileName: 'saved-complete.html', status: 'ok', answerCount: 2 },
        ]);
    });

    it('빈 파일명은 대체하고 긴 파일명은 100자로 자른다', async () => {
        persistKanoUploadAnswers.mockResolvedValue({ respondentCount: 1, importedCount: 2 });
        const fixtureHtml = readFileSync(
            resolve(fixturesDirectory, 'saved-complete.html'),
            'utf8'
        );
        const longFileName = `${'a'.repeat(101)}.html`;

        const response = await POST(uploadRequest([
            htmlFile('', fixtureHtml),
            htmlFile(longFileName, fixtureHtml),
        ]), params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.results).toEqual([
            {
                fileName: '(이름 없음)',
                status: 'failed',
                reason: '업로드할 HTML 응답지가 필요합니다.',
            },
            {
                fileName: longFileName.slice(0, 100),
                status: 'ok',
                answerCount: 2,
            },
        ]);
        expect(persistKanoUploadAnswers).toHaveBeenCalledTimes(1);
    });

    it('권한 거부 응답을 그대로 반환하고 파일이나 요구사항을 처리하지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(
            NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
        );

        const response = await POST(uploadRequest([fixtureFile('saved-complete.html')]), params);

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({ error: '접근 권한이 없습니다.' });
        expect(findManyRequirement).not.toHaveBeenCalled();
        expect(persistKanoUploadAnswers).not.toHaveBeenCalled();
    });

    it('저장 실패 로그 인수와 응답에 파일명이나 이메일을 추가하지 않는다', async () => {
        const storageError = new Error('storage unavailable');
        persistKanoUploadAnswers.mockRejectedValue(storageError);

        const response = await POST(
            uploadRequest([fixtureFile('saved-complete.html')]),
            params
        );
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body).toEqual({ error: '오프라인 응답지 업로드에 실패했습니다.' });
        expect(JSON.stringify(body)).not.toContain('@');
        expect(logError).toHaveBeenCalledWith(
            '오프라인 응답지 업로드 실패',
            storageError,
            { projectId: PROJECT_ID }
        );
        expect(JSON.stringify(logError.mock.calls.map(([message, error, meta]) => ({
            message,
            error: String(error),
            meta,
        })))).not.toContain('@');
    });
});
