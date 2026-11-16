// 공개 Kano 설문이 전체 HTML 문항과 독립 라디오 선택을 유지하며 응답을 제출하는지 검증한다.
// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SurveyPage from '../app/survey/[token]/page';
import {
    KANO_SURVEY_CLOSING,
    KANO_SURVEY_GUIDE,
    KANO_SURVEY_TITLE,
    kanoSurveyAnswerLabels,
    resolveKanoQuestionPair,
} from '../lib/kano-survey-document';
import { buildKanoSurveyIntroduction } from '../lib/kano-survey-introduction';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
    useParams: () => ({ token: 'test-survey-token' }),
    useRouter: () => ({ push: mocks.push }),
}));
vi.mock('next/link', () => ({
    default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement('a', props),
}));

const requirements = [
    { id: 'req_saved', category: '품질', requirement: '안정적인 동작', order: 0,
        kanoPositiveQ: '  저장한 긍정 질문  ', kanoNegativeQ: '  저장한 부정 질문  ' },
    { id: 'req_default', category: '성능', requirement: '빠른 처리', order: 1,
        kanoPositiveQ: null, kanoNegativeQ: ' ' },
];
const introduction = buildKanoSurveyIntroduction({
    technology: '테스트 기술', productType: '테스트 장비', companyName: '테스트 기업',
    representativeName: '테스트 대표', offering: '테스트 서비스',
});
const survey = { projectName: '테스트 프로젝트', requirements, introduction };
let container: HTMLDivElement;
let root: Root;

function postCalls() {
    return mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
}

async function mount() {
    await act(async () => { root.render(createElement(SurveyPage)); });
}

async function answerAll() {
    await act(async () => {
        container.querySelector<HTMLInputElement>('input[name="req_saved-functional"][value="LIKE"]')!.click();
        container.querySelector<HTMLInputElement>('input[name="req_saved-dysfunctional"][value="DISLIKE"]')!.click();
        container.querySelector<HTMLInputElement>('input[name="req_default-functional"][value="EXPECT"]')!.click();
        container.querySelector<HTMLInputElement>('input[name="req_default-dysfunctional"][value="TOLERATE"]')!.click();
    });
}

async function submit() {
    await act(async () => {
        container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', mocks.fetch);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    mocks.fetch.mockImplementation(async (_url, init) => new Response(JSON.stringify(
        init?.method === 'POST' ? { success: true, responseCount: 2 } : survey
    ), { status: 200 }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('공유 제목·소개문과 모든 N-1/N-2 문항을 다섯 라디오씩 한 화면에 표시한다', async () => {
    await mount();

    expect(container.querySelector('h1')?.textContent).toBe(KANO_SURVEY_TITLE);
    for (const text of [survey.projectName, KANO_SURVEY_GUIDE, introduction, KANO_SURVEY_CLOSING]) {
        expect(container.textContent).toContain(text);
    }
    expect([...container.querySelectorAll('legend')].map(item => item.textContent)).toEqual(
        requirements.flatMap((requirement, index) => {
            const pair = resolveKanoQuestionPair(requirement);
            return [`${index + 1}-1 ${pair.positive}`, `${index + 1}-2 ${pair.negative}`];
        })
    );
    const fieldsets = [...container.querySelectorAll('fieldset')];
    expect(fieldsets).toHaveLength(4);
    fieldsets.forEach(fieldset => {
        expect(fieldset.querySelectorAll('input[type="radio"]')).toHaveLength(5);
        expect([...fieldset.querySelectorAll('label')].map(label => label.textContent)).toEqual(kanoSurveyAnswerLabels());
        fieldset.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach(input => {
            expect(input.required).toBe(true);
            expect(fieldset.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
        });
    });
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(container.querySelector('input[type="email"], details, a[download]')).toBeNull();
    expect(container.textContent).not.toContain('이전');
    expect(container.textContent).not.toContain('다음');
});

it('연속 입력과 다른 문항의 선택을 보존하고 요구사항 ID와 기존 enum으로 제출한다', async () => {
    await mount();
    await answerAll();
    await act(async () => {
        container.querySelector<HTMLInputElement>('input[name="req_saved-functional"][value="NEUTRAL"]')!.click();
    });

    expect([...container.querySelectorAll<HTMLInputElement>('input:checked')].map(input => [input.name, input.value])).toEqual([
        ['req_saved-functional', 'NEUTRAL'], ['req_saved-dysfunctional', 'DISLIKE'],
        ['req_default-functional', 'EXPECT'], ['req_default-dysfunctional', 'TOLERATE'],
    ]);
    await submit();

    expect(postCalls()).toHaveLength(1);
    expect(postCalls()[0]).toEqual(['/api/survey/test-survey-token/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: {
            req_saved: { functional: 'NEUTRAL', dysfunctional: 'DISLIKE' },
            req_default: { functional: 'EXPECT', dysfunctional: 'TOLERATE' },
        } }),
    }]);
    expect(window.alert).toHaveBeenCalledWith('설문 응답이 완료되었습니다. 감사합니다!');
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/');
});

it('한 질문이라도 답하지 않으면 제출 요청을 보내지 않는다', async () => {
    await mount();
    await act(async () => {
        container.querySelector<HTMLInputElement>('input[name="req_saved-functional"][value="LIKE"]')!.click();
        container.querySelector<HTMLInputElement>('input[name="req_saved-dysfunctional"][value="DISLIKE"]')!.click();
        container.querySelector<HTMLInputElement>('input[name="req_default-functional"][value="EXPECT"]')!.click();
    });
    await submit();

    expect(postCalls()).toHaveLength(0);
    expect(window.alert).toHaveBeenCalledWith('모든 질문에 답변해주세요.');
    expect(mocks.push).not.toHaveBeenCalled();
});

it('제출 실패 후 선택을 유지하고 같은 내용으로 재시도할 수 있다', async () => {
    await mount();
    await answerAll();
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: '다시 시도해 주세요.' }), { status: 500 }));
    await submit();

    expect(container.querySelectorAll('input:checked')).toHaveLength(4);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    expect(window.alert).toHaveBeenCalledWith('다시 시도해 주세요.');
    expect(mocks.push).not.toHaveBeenCalled();
    await submit();

    expect(postCalls()).toHaveLength(2);
    expect(postCalls()[1][1].body).toBe(postCalls()[0][1].body);
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/');
});

it('제출이 진행 중이면 연속 submit 이벤트도 한 요청만 보낸다', async () => {
    await mount();
    await answerAll();
    let finishSubmission!: (response: Response) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finishSubmission = resolve; }));
    await act(async () => {
        const form = container.querySelector('form')!;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(postCalls()).toHaveLength(1);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    expect([...container.querySelectorAll('fieldset')].every(fieldset => fieldset.disabled)).toBe(true);
    await act(async () => { finishSubmission(new Response(JSON.stringify({ success: true }), { status: 200 })); });
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/');
});

it('로딩 화면에도 이모지를 표시하지 않는다', async () => {
    let finishLoading!: (response: Response) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finishLoading = resolve; }));
    await mount();

    expect(container.textContent).toContain('설문 로딩 중');
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    await act(async () => { finishLoading(new Response(JSON.stringify(survey), { status: 200 })); });
});

it('유효하지 않은 링크의 오류 화면에 이모지가 없고 응답 폼을 표시하지 않는다', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: '유효하지 않은 설문 링크입니다.' }), { status: 404 }));
    await mount();

    expect(container.textContent).toContain('설문을 찾을 수 없습니다');
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/');
});
