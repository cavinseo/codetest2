// 오프라인 Kano 답변 수입 라우트의 판정 순서와 트랜잭션 경계를 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { buildKanoOfflineSurveyModel } from '../lib/kano-offline-survey';

type Requirement = {
    id: string;
    category: string;
    requirement: string;
    kanoPositiveQ: string;
    kanoNegativeQ: string;
};

const CURRENT_REQUIREMENTS: Requirement[] = [
    {
        id: 'req_1',
        category: '성능',
        requirement: '응답이 빨라야 한다',
        kanoPositiveQ: '응답이 빠르면 어떻습니까?',
        kanoNegativeQ: '응답이 빠르지 않으면 어떻습니까?',
    },
    {
        id: 'req_2',
        category: '편의',
        requirement: '사용법이 쉬워야 한다',
        kanoPositiveQ: '사용법이 쉬우면 어떻습니까?',
        kanoNegativeQ: '사용법이 쉽지 않으면 어떻습니까?',
    },
];

const findManyRequirement = vi.fn();
const findManyInvitation = vi.fn();
const transaction = vi.fn();
const bareKanoResponse = {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
};
const bareKanoSurveyInvitation = {
    findMany: findManyInvitation,
    deleteMany: vi.fn(),
    upsert: vi.fn(),
};
const tx = {
    kanoResponse: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        createMany: vi.fn(),
    },
    kanoSurveyInvitation: {
        deleteMany: vi.fn(),
        upsert: vi.fn(),
    },
};

vi.mock('../lib/prisma', () => ({
    prisma: {
        customerRequirement: { findMany: findManyRequirement },
        kanoResponse: bareKanoResponse,
        kanoSurveyInvitation: bareKanoSurveyInvitation,
        $transaction: transaction,
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const logInfo = vi.fn();
const logError = vi.fn();
vi.mock('../lib/logger', () => ({
    createLogger: () => ({ info: logInfo, error: logError }),
}));

const route = await import('../app/api/projects/[id]/kano/offline-responses/route');
const { POST } = route;

const USER = { userId: 'user_1', email: 'owner@x.com', name: '소유자' };
const params = { params: Promise.resolve({ id: 'proj_1' }) };
let transactionOptions: unknown;

function uuid(number: number): string {
    return `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
}

function makePayload(options: {
    requirements?: Requirement[];
    projectId?: string;
    submissionNumber?: number;
    respondentEmail?: string | null;
    answers?: Array<{ requirementId: string; functional: string; dysfunctional: string }>;
    questionSetHash?: string;
    questions?: Array<{ id: string; h: string; t: string }>;
} = {}) {
    const requirements = options.requirements ?? CURRENT_REQUIREMENTS;
    const projectId = options.projectId ?? 'proj_1';
    const submissionNumber = options.submissionNumber ?? 1;
    const model = buildKanoOfflineSurveyModel({
        projectId,
        projectName: '',
        requirements,
        exportedAt: new Date('2026-09-04T00:00:00.000Z'),
    });
    return {
        format: 'kano-offline-response',
        version: 1,
        projectId,
        questionSetHash: options.questionSetHash ?? model.questionSetHash,
        questions: options.questions ?? model.questions.map(({ id, h, t }) => ({ id, h, t })),
        submissionId: uuid(submissionNumber),
        exportedAt: '2026-09-04T00:00:00.000Z',
        submittedAt: '2026-09-04T00:10:00.000Z',
        respondentEmail: options.respondentEmail === undefined ? `person${submissionNumber}@x.com` : options.respondentEmail,
        answers: options.answers ?? model.questions.map((question) => ({
            requirementId: question.id,
            functional: 'LIKE',
            dysfunctional: 'DISLIKE',
        })),
    };
}

function jsonFile(payload: unknown, name = 'answer.kano.json'): File {
    return new File([JSON.stringify(payload)], name, { type: 'application/json' });
}

function htmlFile(payload: unknown, name = 'answer.html'): File {
    const html = `<!DOCTYPE html><html><body><script type="application/json" id="kano-offline-response">${JSON.stringify(payload)}</script></body></html>`;
    return new File([html], name, { type: 'text/html' });
}

function uploadRequest(files: File[], fields: Record<string, string> = {}): NextRequest {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
    return new NextRequest('http://localhost/api/projects/proj_1/kano/offline-responses', {
        method: 'POST',
        body: formData,
    });
}

function call(files: File[], fields: Record<string, string> = {}) {
    return POST(uploadRequest(files, fields), params);
}

function expectNoTransaction() {
    expect(transaction).not.toHaveBeenCalled();
}

function expectNoBareWrites() {
    expect(bareKanoResponse.deleteMany).not.toHaveBeenCalled();
    expect(bareKanoResponse.createMany).not.toHaveBeenCalled();
    expect(bareKanoSurveyInvitation.deleteMany).not.toHaveBeenCalled();
    expect(bareKanoSurveyInvitation.upsert).not.toHaveBeenCalled();
}

beforeEach(() => {
    vi.clearAllMocks();
    transactionOptions = undefined;
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    findManyRequirement.mockResolvedValue(CURRENT_REQUIREMENTS);
    findManyInvitation.mockResolvedValue([]);
    tx.kanoResponse.findMany.mockResolvedValue([]);
    tx.kanoResponse.deleteMany.mockResolvedValue({ count: 0 });
    tx.kanoResponse.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
    tx.kanoSurveyInvitation.deleteMany.mockResolvedValue({ count: 0 });
    tx.kanoSurveyInvitation.upsert.mockImplementation(async ({ create }: { create: { email: string } }) => ({ id: `inv_${create.email}` }));
    transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>, options: unknown) => {
        transactionOptions = options;
        return fn(tx);
    });
});

describe('POST /api/projects/[id]/kano/offline-responses', () => {
    it('1. 정상 2파일을 트랜잭션 안에서만 저장하고 개인정보를 응답에 담지 않는다', async () => {
        const res = await call([
            jsonFile(makePayload({ submissionNumber: 1, respondentEmail: 'one@x.com' }), 'one.kano.json'),
            jsonFile(makePayload({ submissionNumber: 2, respondentEmail: 'two@x.com' }), 'two.kano.json'),
        ]);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ success: true, respondentCount: 2, importedCount: 4, overwrittenRespondentCount: 0 });
        expect(JSON.stringify(body)).not.toContain('one@x.com');
        expect(JSON.stringify(body)).not.toContain('two@x.com');
        expect(tx.kanoResponse.deleteMany).toHaveBeenCalled();
        expect(tx.kanoResponse.createMany).toHaveBeenCalled();
        expect(tx.kanoSurveyInvitation.upsert).toHaveBeenCalledTimes(2);
        expectNoBareWrites();
        expect(JSON.stringify(logInfo.mock.calls)).not.toContain('one@x.com');
    });

    it('2. 가드 실패 파일을 제외하고 정상 파일을 저장한다', async () => {
        const res = await call([
            new File(['bad'], 'bad.txt', { type: 'text/plain' }),
            jsonFile(makePayload({ submissionNumber: 2 }), 'good.kano.json'),
        ]);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.respondentCount).toBe(1);
        expect(body.failures).toEqual([
            expect.objectContaining({ index: 0, fileName: 'bad.txt', code: 'GUARD' }),
        ]);
        expect(transaction).toHaveBeenCalledOnce();
    });

    it('3. 모든 파일이 실패하면 실패 목록과 400을 돌려주고 쓰지 않는다', async () => {
        const res = await call([new File(['bad'], 'bad.txt', { type: 'text/plain' })]);
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.failures).toHaveLength(1);
        expect(body.failures[0].code).toBe('GUARD');
        expectNoTransaction();
        expectNoBareWrites();
    });

    it('4. 질문 세트 불일치는 409 변경 요약을 돌려주고 쓰지 않는다', async () => {
        const changedRequirements: Requirement[] = [
            { ...CURRENT_REQUIREMENTS[0], kanoPositiveQ: '예전에는 빨랐다면 어떻습니까?' },
            {
                id: 'req_old',
                category: '기타',
                requirement: '예전 요구사항',
                kanoPositiveQ: '예전 기능이 있으면 어떻습니까?',
                kanoNegativeQ: '예전 기능이 없으면 어떻습니까?',
            },
        ];
        const res = await call([jsonFile(makePayload({ requirements: changedRequirements }), 'changed.kano.json')]);
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body).toEqual({
            error: expect.any(String),
            code: 'QUESTION_SET_CHANGED',
            added: 1,
            removed: 1,
            changed: 1,
            affectedFiles: ['changed.kano.json'],
        });
        expectNoTransaction();
        expectNoBareWrites();
    });

    it('5. 질문 세트 불일치를 수락하면 일치 문항만 저장한다', async () => {
        const oldRequirements: Requirement[] = [
            CURRENT_REQUIREMENTS[0],
            {
                id: 'req_old',
                category: '기타',
                requirement: '삭제된 요구사항',
                kanoPositiveQ: '삭제된 기능이 있으면 어떻습니까?',
                kanoNegativeQ: '삭제된 기능이 없으면 어떻습니까?',
            },
        ];
        const res = await call(
            [jsonFile(makePayload({ requirements: oldRequirements }))],
            { acceptQuestionSetMismatch: 'true' }
        );
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ importedCount: 1, droppedAnswerCount: 1, rematchedAnswerCount: 0 });
        const rows = tx.kanoResponse.createMany.mock.calls[0][0].data;
        expect(rows).toEqual([expect.objectContaining({ requirementId: 'req_1' })]);
    });

    it('5b. 문구가 같은 새 id로 모든 답을 재매칭한다', async () => {
        const oldRequirements = CURRENT_REQUIREMENTS.map((requirement, index) => ({
            ...requirement,
            id: `old_${index + 1}`,
        }));
        const res = await call(
            [jsonFile(makePayload({ requirements: oldRequirements }))],
            { acceptQuestionSetMismatch: 'true' }
        );
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ importedCount: 2, droppedAnswerCount: 0, rematchedAnswerCount: 2 });
        const rows = tx.kanoResponse.createMany.mock.calls[0][0].data;
        expect(rows.map((row: { requirementId: string }) => row.requirementId)).toEqual(['req_1', 'req_2']);
    });

    it('6. 다른 프로젝트 파일은 WRONG_PROJECT로 거절하고 쓰지 않는다', async () => {
        const res = await call([jsonFile(makePayload({ projectId: 'proj_other' }))]);
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.failures).toEqual([expect.objectContaining({ code: 'WRONG_PROJECT' })]);
        expectNoTransaction();
    });

    it('7. 같은 질문 세트 해시에 미지 requirementId가 있으면 거절하고 쓰지 않는다', async () => {
        const payload = makePayload({
            answers: [{ requirementId: 'req_unknown', functional: 'LIKE', dysfunctional: 'DISLIKE' }],
        });
        const res = await call([jsonFile(payload)]);
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.failures).toEqual([expect.objectContaining({ code: 'UNKNOWN_REQUIREMENT' })]);
        expectNoTransaction();
    });

    it('7b. 불일치를 수락해도 일치 문항이 없으면 거절하고 쓰지 않는다', async () => {
        const unrelated: Requirement[] = [{
            id: 'req_old',
            category: '기타',
            requirement: '다른 요구사항',
            kanoPositiveQ: '완전히 다른 긍정 질문',
            kanoNegativeQ: '완전히 다른 부정 질문',
        }];
        const res = await call(
            [jsonFile(makePayload({ requirements: unrelated }))],
            { acceptQuestionSetMismatch: 'true' }
        );
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.failures).toEqual([expect.objectContaining({ code: 'UNKNOWN_REQUIREMENT' })]);
        expectNoTransaction();
    });

    it('8. 같은 이메일의 두 파일은 모두 배치 중복으로 거절하고 쓰지 않는다', async () => {
        const res = await call([
            jsonFile(makePayload({ submissionNumber: 1, respondentEmail: 'same@x.com' }), 'first.kano.json'),
            jsonFile(makePayload({ submissionNumber: 2, respondentEmail: 'same@x.com' }), 'second.kano.json'),
        ]);
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.failures).toEqual([
            expect.objectContaining({ index: 0, code: 'DUPLICATE_IN_BATCH' }),
            expect.objectContaining({ index: 1, code: 'DUPLICATE_IN_BATCH' }),
        ]);
        expectNoTransaction();
    });

    it('9. 대소문자가 다른 기존 외부 초대 이메일도 기본 거절하고 쓰지 않는다', async () => {
        findManyInvitation.mockResolvedValue([{ email: 'Hong@X.COM', token: 'uuid-online-token' }]);
        const res = await call([jsonFile(makePayload({ respondentEmail: 'hong@x.com' }))]);
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.failures).toEqual([expect.objectContaining({ code: 'RESPONDENT_EXISTS' })]);
        expect(findManyInvitation).toHaveBeenCalledWith({
            where: { projectId: 'proj_1' },
            select: { email: true, token: true },
        });
        expectNoTransaction();
    });

    it('10. 파일 인덱스로 덮어쓰기를 승인하면 기존 외부 응답자를 저장한다', async () => {
        findManyInvitation.mockResolvedValue([{ email: 'Hong@X.COM', token: 'uuid-online-token' }]);
        const res = await call(
            [jsonFile(makePayload({ respondentEmail: 'hong@x.com' }))],
            { overwriteFiles: '0' }
        );
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.respondentCount).toBe(1);
        expect(transaction).toHaveBeenCalledOnce();
    });

    it('11. 기존 offline_ 초대는 승인 없이 재수입한다', async () => {
        findManyInvitation.mockResolvedValue([{ email: 'PERSON1@X.COM', token: `offline_${uuid(1)}` }]);
        const res = await call([jsonFile(makePayload())]);

        expect(res.status).toBe(200);
        expect(transaction).toHaveBeenCalledOnce();
    });

    it('12. 트랜잭션 실행 시간과 대기 시간을 명시한다', async () => {
        const res = await call([jsonFile(makePayload())]);

        expect(res.status).toBe(200);
        expect(transactionOptions).toEqual({ timeout: 60_000, maxWait: 10_000 });
    });

    it('13. 쓰기 권한이 없으면 403을 그대로 돌려주고 쓰지 않는다', async () => {
        requireProjectAccess.mockResolvedValue(NextResponse.json({ error: 'denied' }, { status: 403 }));
        const res = await call([jsonFile(makePayload())]);

        expect(res.status).toBe(403);
        expect(findManyRequirement).not.toHaveBeenCalled();
        expectNoTransaction();
        expectNoBareWrites();
    });

    it('14. 파일이 11개면 400을 돌려주고 쓰지 않는다', async () => {
        const files = Array.from({ length: 11 }, (_, index) => jsonFile(
            makePayload({ submissionNumber: index + 1 }),
            `${index}.kano.json`
        ));
        const res = await call(files);

        expect(res.status).toBe(400);
        expect(findManyRequirement).not.toHaveBeenCalled();
        expectNoTransaction();
    });

    it('14b. 401KB 파일은 GUARD 실패로 거절하고 쓰지 않는다', async () => {
        const file = new File(['x'.repeat(401 * 1024)], 'large.kano.json', { type: 'application/json' });
        const res = await call([file]);
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.failures).toEqual([expect.objectContaining({ code: 'GUARD' })]);
        expectNoTransaction();
    });

    it('14c. 응답 섬이 채워진 실제 HTML 답변 파일을 저장한다', async () => {
        const res = await call([htmlFile(makePayload())]);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ respondentCount: 1, importedCount: 2 });
        expect(transaction).toHaveBeenCalledOnce();
    });

    it('14d. 응답 섬이 빈 원본 설문 HTML은 survey-file 사유로 거절하고 쓰지 않는다', async () => {
        const file = new File([
            '<!DOCTYPE html><html><body><script type="application/json" id="kano-offline-response"></script></body></html>',
        ], 'survey.html', { type: 'text/html' });
        const res = await call([file]);
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.failures).toEqual([
            expect.objectContaining({ code: 'PARSE', detail: 'survey-file' }),
        ]);
        expectNoTransaction();
    });

    it('15. 내부 오류를 500 응답에 노출하지 않는다', async () => {
        findManyRequirement.mockRejectedValue(new Error('secret database detail'));
        const res = await call([jsonFile(makePayload())]);
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(body.error).toBe('오프라인 답변 파일 업로드에 실패했습니다.');
        expect(body.referenceId).toEqual(expect.any(String));
        expect(JSON.stringify(body)).not.toContain('secret database detail');
        expectNoTransaction();
    });

    it('16. 서버리스 실행 시간 상한을 export한다', () => {
        expect(route.maxDuration).toBe(60);
    });

    it('17. 정상 수입은 응답자 범위만 교체하고 프로젝트 전체를 삭제하지 않는다', async () => {
        const res = await call([jsonFile(makePayload())]);

        expect(res.status).toBe(200);
        expect(tx.kanoSurveyInvitation.deleteMany).not.toHaveBeenCalled();
        expect(tx.kanoResponse.deleteMany).toHaveBeenCalled();
        for (const [args] of tx.kanoResponse.deleteMany.mock.calls) {
            expect(args).toMatchObject({
                where: { respondentEmail: { in: expect.any(Array) } },
            });
        }
    });

    it('18. 파일 10개는 한 배치로 모두 저장한다', async () => {
        const files = Array.from({ length: 10 }, (_, index) => jsonFile(
            makePayload({ submissionNumber: index + 1 }),
            `${index}.kano.json`
        ));
        const res = await call(files);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.respondentCount).toBe(10);
    });

    it('19. 오프라인 초대는 즉시 만료돼 온라인 응답에 재사용되지 않는다', async () => {
        // 만료가 미래면 응답 리셋으로 respondedAt 이 비었을 때 이 토큰이 살아 있는 온라인
        // 설문 링크가 된다. 파일의 이메일은 자기 신고 값이라 남의 이름으로 초대를 만들 수
        // 있고, 그 링크가 유효하면 사칭 방어가 통째로 우회된다.
        const before = Date.now();
        const res = await call([jsonFile(makePayload())]);
        const after = Date.now();

        expect(res.status).toBe(200);
        expect(tx.kanoSurveyInvitation.upsert).toHaveBeenCalledTimes(1);
        const [{ create, update }] = tx.kanoSurveyInvitation.upsert.mock.calls[0];
        expect(create.token).toMatch(/^offline_/);
        const expiresAt = new Date(create.expiresAt).getTime();
        expect(expiresAt).toBeGreaterThanOrEqual(before);
        expect(expiresAt).toBeLessThanOrEqual(after);
        // 재수입이 만료를 늘려 주지도 않는다 — update 는 만료를 건드리지 않는다.
        expect(update.expiresAt).toBeUndefined();
    });
});
