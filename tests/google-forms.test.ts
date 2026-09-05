// Google Forms 래퍼가 설문을 만들고 응답을 Kano 형식으로 옮기는 과정을 확인하는 테스트.
//
// 이 모듈은 외부 API 응답을 any 로 받아 인덱스로 훑는다. 형태가 어긋나도 예외가 나지
// 않고 조용히 값이 채워지므로, 정상 경로뿐 아니라 어긋난 입력에서 무엇이 나오는지까지
// 고정해 둔다. 여기서 파서 동작을 바꾸지는 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKanoForm, getFormResponses } from '../lib/google-forms';

const FORMS_API_BASE = 'https://forms.googleapis.com/v1/forms';

const fetchMock = vi.fn();

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

function ok(body: unknown) {
    return { ok: true, json: () => Promise.resolve(body) };
}

function denied(body: unknown = { error: { message: 'denied' } }) {
    return { ok: false, json: () => Promise.resolve(body) };
}

// 첫 요구사항은 세분류가 있고 문항이 비어 기본 문구를 쓰는 경우,
// 둘째는 세분류가 없고 문항이 직접 지정된 경우다. 두 분기를 한 번에 지난다.
const REQUIREMENTS = [
    {
        id: 'req_1',
        category: '사용성',
        subcategory: '온보딩',
        requirement: '초기 설정 자동화',
        kanoPositiveQ: null,
        kanoNegativeQ: null,
        order: 0,
    },
    {
        id: 'req_2',
        category: '성능',
        subcategory: undefined,
        requirement: '외부 API 연동',
        kanoPositiveQ: '연동되면?',
        kanoNegativeQ: '안 되면?',
        order: 1,
    },
];

// 질문 항목이 아닌 항목(설명 블록 등)이 섞여 있어도 질문 ID 만 추려야 한다.
const FORM_STRUCTURE = {
    items: [
        { questionItem: { question: { questionId: 'q1' } } },
        { questionItem: { question: { questionId: 'q2' } } },
        { title: '설명만 있는 항목' },
        { questionItem: { question: { questionId: 'q3' } } },
        { questionItem: { question: { questionId: 'q4' } } },
    ],
};

describe('createKanoForm', () => {
    it('폼을 만들고 요구사항마다 긍정·부정 질문을 붙인다', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ formId: 'form_abc', responderUri: 'https://forms.gle/xyz' }))
            .mockResolvedValueOnce(ok({}));

        const result = await createKanoForm('token_1', 'KS-QFD', REQUIREMENTS);

        expect(result).toEqual({
            formId: 'form_abc',
            formUrl: 'https://forms.gle/xyz',
            editUrl: 'https://docs.google.com/forms/d/form_abc/edit',
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);

        const [createUrl, createInit] = fetchMock.mock.calls[0];
        expect(createUrl).toBe(FORMS_API_BASE);
        expect(createInit.headers.Authorization).toBe('Bearer token_1');
        expect(JSON.parse(createInit.body)).toEqual({ info: { title: 'Kano 설문 조사 - KS-QFD' } });

        const [updateUrl, updateInit] = fetchMock.mock.calls[1];
        expect(updateUrl).toBe(`${FORMS_API_BASE}/form_abc:batchUpdate`);
        expect(updateInit.headers.Authorization).toBe('Bearer token_1');

        // 설명 갱신 1건 + 요구사항 2건 x (긍정·부정) = 5건.
        const requests = JSON.parse(updateInit.body).requests;
        expect(requests).toHaveLength(5);
        expect(requests[0].updateFormInfo.updateMask).toBe('description');

        const items = requests.slice(1).map((request: { createItem: { item: { title: string; description: string }; location: { index: number } } }) => ({
            title: request.createItem.item.title,
            description: request.createItem.item.description,
            index: request.createItem.location.index,
        }));
        expect(items).toEqual([
            {
                title: '👍 [긍정] [사용성 > 온보딩] 초기 설정 자동화',
                description: '만약 "초기 설정 자동화"(이)라면 어떻게 느끼시겠습니까?',
                index: 0,
            },
            {
                title: '👎 [부정] [사용성 > 온보딩] 초기 설정 자동화',
                description: '만약 "초기 설정 자동화"(이)가 아니라면 어떻게 느끼시겠습니까?',
                index: 1,
            },
            { title: '👍 [긍정] [성능] 외부 API 연동', description: '연동되면?', index: 2 },
            { title: '👎 [부정] [성능] 외부 API 연동', description: '안 되면?', index: 3 },
        ]);

        // 응답 선택지는 Kano 5단계 그대로여야 집계가 맞는다.
        const choices = requests[1].createItem.item.questionItem.question.choiceQuestion;
        expect(choices.type).toBe('RADIO');
        expect(choices.options.map((option: { value: string }) => option.value)).toEqual([
            '마음에 든다',
            '당연하다',
            '아무런느낌이 없다',
            '하는수 없다',
            '마음에 안든다',
        ]);
    });

    it('응답 주소가 오지 않으면 폼 ID 로 조립한 주소를 쓴다', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ formId: 'form_abc' }))
            .mockResolvedValueOnce(ok({}));

        const result = await createKanoForm('token_1', 'KS-QFD', REQUIREMENTS);

        expect(result.formUrl).toBe('https://docs.google.com/forms/d/form_abc/viewform');
    });

    it('폼 생성이 거부되면 응답 본문을 담아 던진다', async () => {
        fetchMock.mockResolvedValueOnce(denied({ error: { message: 'insufficient scope' } }));

        await expect(createKanoForm('token_1', 'KS-QFD', REQUIREMENTS))
            .rejects.toThrow(/Form creation failed.*insufficient scope/);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('질문 추가가 거부되면 던진다', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ formId: 'form_abc' }))
            .mockResolvedValueOnce(denied({ error: { message: 'quota' } }));

        await expect(createKanoForm('token_1', 'KS-QFD', REQUIREMENTS))
            .rejects.toThrow(/Form update failed.*quota/);
    });
});

describe('getFormResponses', () => {
    it('질문을 두 개씩 묶어 요구사항 순서대로 맞춘다', async () => {
        fetchMock
            .mockResolvedValueOnce(ok(FORM_STRUCTURE))
            .mockResolvedValueOnce(ok({
                responses: [{
                    respondentEmail: 'r@example.com',
                    lastSubmittedTime: '2026-08-27T00:00:00.000Z',
                    answers: {
                        q1: { textAnswers: { answers: [{ value: '마음에 든다' }] } },
                        q2: { textAnswers: { answers: [{ value: '하는수 없다' }] } },
                        q3: { textAnswers: { answers: [{ value: '😍 매우 만족 (I like it)' }] } },
                        q4: { textAnswers: { answers: [{ value: '마음에 안든다' }] } },
                    },
                }],
            }));

        const result = await getFormResponses('token_1', 'form_abc');

        expect(result).toEqual({
            responses: [{
                respondentEmail: 'r@example.com',
                submittedAt: '2026-08-27T00:00:00.000Z',
                answers: [
                    { requirementIndex: 0, functional: 'LIKE', dysfunctional: 'TOLERATE' },
                    { requirementIndex: 1, functional: 'LIKE', dysfunctional: 'DISLIKE' },
                ],
            }],
        });

        expect(fetchMock.mock.calls[0][0]).toBe(`${FORMS_API_BASE}/form_abc`);
        expect(fetchMock.mock.calls[1][0]).toBe(`${FORMS_API_BASE}/form_abc/responses`);
    });

    it('응답이 하나도 없으면 빈 배열을 돌려준다', async () => {
        fetchMock
            .mockResolvedValueOnce(ok(FORM_STRUCTURE))
            .mockResolvedValueOnce(ok({}));

        await expect(getFormResponses('token_1', 'form_abc')).resolves.toEqual({ responses: [] });
    });

    it('빠진 답변과 알 수 없는 답변을 모두 NEUTRAL 로 채운다', async () => {
        // NEUTRAL 은 응답자가 실제로 고를 수 있는 값이기도 하다. 그래서 조회 실패와
        // 진짜 "아무런느낌이 없다" 가 결과에서 구분되지 않는다. 현재 동작을 고정만 한다.
        fetchMock
            .mockResolvedValueOnce(ok(FORM_STRUCTURE))
            .mockResolvedValueOnce(ok({
                responses: [{
                    answers: {
                        q1: { textAnswers: { answers: [{ value: '알 수 없는 보기' }] } },
                        // q2·q3·q4 는 응답에 아예 없다.
                    },
                }],
            }));

        const result = await getFormResponses('token_1', 'form_abc');

        expect(result.responses[0].answers).toEqual([
            { requirementIndex: 0, functional: 'NEUTRAL', dysfunctional: 'NEUTRAL' },
            { requirementIndex: 1, functional: 'NEUTRAL', dysfunctional: 'NEUTRAL' },
        ]);
        expect(result.responses[0].respondentEmail).toBeUndefined();
    });

    it('제출 시각이 없으면 조회 시각으로 채운다', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ items: [{ questionItem: { question: { questionId: 'q1' } } }] }))
            .mockResolvedValueOnce(ok({
                responses: [{ answers: { q1: { textAnswers: { answers: [{ value: '당연하다' }] } } } }],
            }));

        const result = await getFormResponses('token_1', 'form_abc');

        // 질문이 홀수면 마지막 쌍의 부정 질문이 없어 NEUTRAL 로 채워진다.
        expect(result.responses[0].answers).toEqual([
            { requirementIndex: 0, functional: 'EXPECT', dysfunctional: 'NEUTRAL' },
        ]);
        expect(new Date(result.responses[0].submittedAt).toISOString()).toBe(result.responses[0].submittedAt);
    });

    it('폼 구조 조회가 실패하면 던진다', async () => {
        fetchMock.mockResolvedValueOnce(denied());

        await expect(getFormResponses('token_1', 'form_abc'))
            .rejects.toThrow('Failed to fetch form structure');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('응답 조회가 실패하면 던진다', async () => {
        fetchMock
            .mockResolvedValueOnce(ok(FORM_STRUCTURE))
            .mockResolvedValueOnce(denied());

        await expect(getFormResponses('token_1', 'form_abc'))
            .rejects.toThrow('Failed to fetch responses');
    });
});
