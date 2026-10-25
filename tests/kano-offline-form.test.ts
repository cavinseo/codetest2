// 오프라인 Kano HTML 설문지의 정적 마크업과 브라우저 저장 동작을 검증한다.
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
    KANO_OFFLINE_PAYLOAD_ID,
    buildKanoOfflineFormHtml,
    kanoOfflineFormFileName,
} from '../lib/kano-offline-form';
import { resolveKanoQuestionPair } from '../lib/kano-survey-document';

const REQUIREMENTS = [
    { requirement: '안전', kanoPositiveQ: '안전하다면?', kanoNegativeQ: '안전하지 않다면?' },
    { requirement: '속도' },
];

// 두 요구사항의 긍정·부정 문항에 모두 답한 상태다.
const ALL_ANSWERED = { 'q0-positive': 1, 'q0-negative': 2, 'q1-positive': 3, 'q1-negative': 4 };

function buildHtml(overrides: Partial<Parameters<typeof buildKanoOfflineFormHtml>[0]> = {}): string {
    return buildKanoOfflineFormHtml({
        projectId: 'proj_1',
        projectName: '스마트팜',
        requirements: REQUIREMENTS,
        ...overrides,
    });
}

function extractPayload(html: string): Record<string, unknown> {
    const match = html.match(new RegExp(
        '<script id="' + KANO_OFFLINE_PAYLOAD_ID + '" type="application/json">([\\s\\S]*?)<\\/script>'
    ));
    expect(match).not.toBeNull();
    return JSON.parse(match![1]) as Record<string, unknown>;
}

function extractExecutableScript(html: string): string {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    return scripts[0][1];
}

interface FakeRadio {
    name: string;
    value: string;
    checked: boolean;
}

function executeBrowserScript(
    html: string,
    options: {
        confirm?: boolean;
        checked?: Record<string, number>;
        date?: { year: number; month: number; day: number; hour: number; minute: number; second: number };
        email?: string;
        showSaveFilePicker?: (options: unknown) => Promise<unknown>;
    } = {}
) {
    const payloadMatch = html.match(new RegExp(
        '<script id="' + KANO_OFFLINE_PAYLOAD_ID + '" type="application/json">([\\s\\S]*?)<\\/script>'
    ));
    if (!payloadMatch) throw new Error('페이로드가 없습니다.');
    const initialPayload = JSON.parse(payloadMatch[1]) as {
        respondentEmail: string;
        answers: Array<{ index: number; positive: number | null; negative: number | null }>;
    };
    const radios: FakeRadio[] = [];
    initialPayload.answers.forEach(({ index }) => {
        (['positive', 'negative'] as const).forEach((direction) => {
            for (let score = 1; score <= 5; score += 1) {
                radios.push({
                    name: `q${index}-${direction}`,
                    value: String(score),
                    checked: options.checked?.[`q${index}-${direction}`] === score,
                });
            }
        });
    });

    const listeners = new Map<string, () => void>();
    const emailInput = { value: '', focus: vi.fn() };
    const payloadElement = { textContent: payloadMatch[1] };
    const introductionElement = { textContent: '' };
    const introductionInput = { value: '', setAttribute: vi.fn(), addEventListener: vi.fn() };
    const saveButton = {
        addEventListener: (event: string, listener: () => void) => listeners.set(event, listener),
    };
    const anchors: Array<{ download: string; href: string; click: ReturnType<typeof vi.fn> }> = [];
    const document = {
        getElementById(id: string) {
            if (id === KANO_OFFLINE_PAYLOAD_ID) return payloadElement;
            if (id === 'kano-respondent-email') return emailInput;
            if (id === 'kano-save') return saveButton;
            if (id === 'kano-save-form') return { addEventListener: vi.fn() };
            if (id.startsWith('kano-intro-')) return introductionInput;
            return null;
        },
        querySelector(selector: string) {
            if (selector === '.introduction') return introductionElement;
            const name = selector.match(/name="([^"]+)"/)?.[1];
            const value = selector.match(/value="([^"]+)"/)?.[1];
            return radios.find((radio) => (
                radio.name === name
                && (value === undefined || radio.value === value)
                && (!selector.endsWith(':checked') || radio.checked)
            )) ?? null;
        },
        createElement(tag: string) {
            expect(tag).toBe('a');
            const anchor = { download: '', href: '', click: vi.fn() };
            anchors.push(anchor);
            return anchor;
        },
        body: {
            dataset: {
                downloadStem: html.match(/<body data-download-stem="([^"]+)"/)?.[1] ?? '',
            },
            appendChild: vi.fn(),
            removeChild: vi.fn(),
        },
        documentElement: {
            get outerHTML() {
                return `<html><script id="${KANO_OFFLINE_PAYLOAD_ID}" type="application/json">${payloadElement.textContent}</script></html>`;
            },
        },
    };
    const blobs: Array<{ parts: string[]; options: { type?: string } }> = [];
    class FakeBlob {
        constructor(parts: string[], blobOptions: { type?: string }) {
            blobs.push({ parts, options: blobOptions });
        }
    }
    const confirm = vi.fn(() => options.confirm ?? true);
    const alert = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:offline-response');
    const revokeObjectURL = vi.fn();
    const date = options.date ?? { year: 2026, month: 9, day: 5, hour: 12, minute: 34, second: 56 };
    class FakeDate {
        getFullYear() { return date.year; }
        getMonth() { return date.month - 1; }
        getDate() { return date.day; }
        getHours() { return date.hour; }
        getMinutes() { return date.minute; }
        getSeconds() { return date.second; }
    }
    vm.runInNewContext(extractExecutableScript(html), {
        document,
        confirm,
        alert,
        Promise,
        ...(options.showSaveFilePicker ? { showSaveFilePicker: options.showSaveFilePicker } : {}),
        Blob: FakeBlob,
        URL: { createObjectURL, revokeObjectURL },
        Date: FakeDate,
        Number,
        JSON,
    });

    // 저장본 복원이 끝난 뒤 응답자가 입력한 것처럼 이메일을 채운다.
    if (options.email !== undefined) emailInput.value = options.email;

    return {
        alert,
        anchors,
        blobs,
        confirm,
        createObjectURL,
        emailInput,
        listeners,
        payloadElement,
        radios,
        revokeObjectURL,
    };
}

describe('buildKanoOfflineFormHtml 정적 계약', () => {
    it('DOCTYPE과 한국어 문서로 시작한다', () => {
        const html = buildHtml();
        expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(html).toContain('<html lang="ko"');
    });

    it('설문 고정 문구 전문을 담는다', () => {
        const html = buildHtml();
        expect(html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1]).toBe('고객니즈조사 설문지');
        expect(html.match(/<p class="guide">([\s\S]*?)<\/p>/)?.[1]).toBe(
            '본 설문은 고객의 정확한 의견을 도출하기 위해 Kano 방식으로 작성되어 같은 내용의 질문을 '
            + '긍정과 부정으로 작성되어 있습니다. 각 항목을 읽고 긍정과 부정의 질문 모두 해당되는 항목에 '
            + '표시하여 주시기 바랍니다.'
        );
        expect(html.match(/<p class="introduction">([\s\S]*?)<\/p>/)?.[1]).toBe(
            '(제품/서비스 소개) 안녕하세요. 「　　　　　　　」 기술을 활용하여 다양한 「　　　　」제품을 '
            + '개발하고 있는 「　　　　」 대표 「　　　　」입니다. 본 설문은 자사에서 제공하는 「　　　　」에 '
            + '대하여, 소비자의 의견을 수렴하여 좀 더 나은 서비스를 만드는데 필요한 기초 자료를 얻는 것에 '
            + '목적이 있습니다. 귀하께서 응답하시는 내용은 정답이 없으며, 오직 제품 레벨 업을 위한 용도로만 '
            + '사용할 것을 약속드립니다. 바쁘신 가운데 시간을 내어 주셔서 대단히 감사합니다. '
            + '/(필요시 이미지 자료 첨부가능)'
        );
        expect(html.match(/<p class="closing">([\s\S]*?)<\/p>/)?.[1]).toBe(
            '긴 시간 질문에 성심껏 응답해 주셔서 감사합니다. 귀하의 의견을 참고하여 좋은 자료로 활용 하겠습니다.'
        );
    });

    it('요구사항마다 긍정·부정 라디오 5개씩을 그린다', () => {
        const html = buildHtml();
        const fieldsets = [...html.matchAll(
            /<fieldset>\s*<legend><strong>([^<]+)<\/strong> ([\s\S]*?)<\/legend>\s*<div class="answers">([\s\S]*?)<\/div>\s*<\/fieldset>/g
        )];
        const expectedQuestions = [
            { number: '1-1', question: '안전하다면?', name: 'q0-positive' },
            { number: '1-2', question: '안전하지 않다면?', name: 'q0-negative' },
            { number: '2-1', question: resolveKanoQuestionPair(REQUIREMENTS[1]).positive, name: 'q1-positive' },
            { number: '2-2', question: resolveKanoQuestionPair(REQUIREMENTS[1]).negative, name: 'q1-negative' },
        ];
        expect(fieldsets).toHaveLength(4);
        fieldsets.forEach((fieldset, index) => {
            expect({ number: fieldset[1], question: fieldset[2] }).toEqual({
                number: expectedQuestions[index].number,
                question: expectedQuestions[index].question,
            });
            const options = [...fieldset[3].matchAll(
                /<label class="answer"><input type="radio" name="([^"]+)" value="([1-5])"><span>([^<]+)<\/span><\/label>/g
            )];
            expect(options.map((option) => ({ name: option[1], value: option[2], label: option[3] }))).toEqual([
                { name: expectedQuestions[index].name, value: '1', label: '마음에 든다' },
                { name: expectedQuestions[index].name, value: '2', label: '당연하다' },
                { name: expectedQuestions[index].name, value: '3', label: '아무런느낌이 없다' },
                { name: expectedQuestions[index].name, value: '4', label: '하는수 없다' },
                { name: expectedQuestions[index].name, value: '5', label: '마음에 안든다' },
            ]);
        });
        expect(html.match(/<\/span><\/label><label class="answer"/g)).toHaveLength(16);
        expect(html.match(/<\/section>\n<section/g)).toHaveLength(1);
    });

    it('저장된 질문이 없으면 같은 모델의 기본 문구를 쓴다', () => {
        const html = buildHtml();
        const pair = resolveKanoQuestionPair(REQUIREMENTS[1]);
        expect(html).toContain(pair.positive);
        expect(html).toContain(pair.negative);
    });

    it('프로젝트명과 다운로드 stem을 각 문맥에 맞게 escape한다', () => {
        const html = buildHtml({ projectName: '<img src=x onerror=alert(1)>' });
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).toContain('<body data-download-stem="_img src=x onerror=alert(1)_">');
    });

    it('script 종료 문자열을 주입해도 페이로드가 종료되지 않고 원문이 복원된다', () => {
        const injected = '</script><script>alert(1)</script>';
        const html = buildHtml({
            projectId: 'proj_' + injected,
            projectName: injected,
            requirements: [{ requirement: injected, kanoPositiveQ: injected, kanoNegativeQ: injected }],
        });
        expect(html.match(/<\/script>/g)).toHaveLength(2);
        expect(extractPayload(html).projectId).toBe('proj_' + injected);
        expect(html).toContain('&lt;/script&gt;');
    });

    it('외부 자원을 참조하지 않는다', () => {
        const html = buildHtml();
        expect(html).not.toContain('http://');
        expect(html).not.toContain('https://');
        expect(html).not.toContain('<link');
    });

    it('초기 JSON payload가 버전·프로젝트·null 답변 계약을 지킨다', () => {
        expect(extractPayload(buildHtml())).toEqual({
            kind: 'kano-offline-response',
            version: 1,
            projectId: 'proj_1',
            respondentEmail: '',
            answers: [
                { index: 0, positive: null, negative: null },
                { index: 1, positive: null, negative: null },
            ],
        });
    });

    it('응답자 이메일을 필수로 표시하고 저장 제어를 둔다', () => {
        const html = buildHtml();
        expect(html).toContain('<input id="kano-respondent-email" type="email" required>');
        expect(html).toContain('이메일 (필수)');
        expect(html).not.toContain('선택 사항');
        expect(html).toContain('<button type="button" id="kano-save">');
        expect(html).toContain('응답 저장');
        const script = extractExecutableScript(html);
        expect(script).not.toContain('`');
        expect(script).not.toContain('${');
    });
});

describe('kanoOfflineFormFileName', () => {
    it('공용 stem 규칙으로 HTML 파일명을 만든다', () => {
        expect(kanoOfflineFormFileName('스마트팜')).toBe('Kano_오프라인_응답지_스마트팜.html');
        expect(kanoOfflineFormFileName('')).toBe('Kano_오프라인_응답지_프로젝트.html');
        expect(kanoOfflineFormFileName('a/b')).toBe('Kano_오프라인_응답지_a_b.html');
    });
});

describe('인라인 브라우저 스크립트', () => {
    it('저장본의 이메일과 라디오 답변을 열 때 복원한다', () => {
        const html = buildHtml().replace(
            /(<script id="kano-offline-response" type="application\/json">)[\s\S]*?(<\/script>)/,
            '$1' + JSON.stringify({
                kind: 'kano-offline-response',
                version: 1,
                projectId: 'proj_1',
                respondentEmail: 'saved@example.com',
                answers: [
                    { index: 0, positive: 2, negative: 4 },
                    { index: 1, positive: 5, negative: 1 },
                ],
            }) + '$2'
        );
        const browser = executeBrowserScript(html);
        expect(browser.emailInput.value).toBe('saved@example.com');
        expect(browser.radios.filter((radio) => radio.checked).map(({ name, value }) => ({ name, value }))).toEqual([
            { name: 'q0-positive', value: '2' },
            { name: 'q0-negative', value: '4' },
            { name: 'q1-positive', value: '5' },
            { name: 'q1-negative', value: '1' },
        ]);
    });

    it('긍정이나 부정 중 하나라도 빈 요구사항 수로 confirm하고 취소하면 무동작한다', () => {
        const browser = executeBrowserScript(buildHtml(), {
            confirm: false,
            email: 'tester@example.com',
            checked: { 'q0-positive': 1, 'q1-positive': 2, 'q1-negative': 3 },
        });
        browser.listeners.get('click')!();
        expect(browser.confirm).toHaveBeenCalledWith('1개 문항이 비어 있습니다. 그래도 저장할까요?');
        expect(browser.payloadElement.textContent).toBe(JSON.stringify(extractPayload(buildHtml())));
        expect(browser.blobs).toHaveLength(0);
        expect(browser.anchors).toHaveLength(0);
    });

    it('파일을 고를 수 없는 브라우저는 승인한 답변을 이메일이 붙은 이름으로 내려받는다', () => {
        const browser = executeBrowserScript(buildHtml(), {
            confirm: true,
            checked: { 'q0-positive': 1, 'q1-positive': 2, 'q1-negative': 3 },
        });
        browser.emailInput.value = '  Test.User<unsafe>@example.com  ';
        browser.listeners.get('click')!();
        expect(browser.payloadElement.textContent).not.toContain('<');
        expect(JSON.parse(browser.payloadElement.textContent)).toEqual({
            kind: 'kano-offline-response',
            version: 1,
            projectId: 'proj_1',
            respondentEmail: 'Test.User<unsafe>@example.com',
            answers: [
                { index: 0, positive: 1, negative: null },
                { index: 1, positive: 2, negative: 3 },
            ],
        });
        expect(browser.blobs).toEqual([{
            parts: [expect.stringMatching(/^<!DOCTYPE html>\n<html>/)],
            options: { type: 'text/html;charset=utf-8' },
        }]);
        // 응답자마다 이름이 달라야 모아도 겹치지 않는다. 파일 이름에 못 쓰는 < > 는 밑줄로 바꾼다.
        expect(browser.anchors[0].download).toBe('Kano_오프라인_응답지_스마트팜_Test.User_unsafe_@example.com.html');
        expect(browser.anchors[0].href).toBe('blob:offline-response');
        expect(browser.anchors[0].click).toHaveBeenCalledOnce();
        expect(browser.createObjectURL).toHaveBeenCalledOnce();
        expect(browser.revokeObjectURL).toHaveBeenCalledWith('blob:offline-response');
    });

    it('파일 이름에 쓸 수 없는 문자는 밑줄로 바꿔 내려받는다', () => {
        const browser = executeBrowserScript(buildHtml(), {
            email: 'a:b/c*d\\e@example.com',
            checked: ALL_ANSWERED,
        });
        browser.listeners.get('click')!();
        expect(browser.anchors[0].download).toBe('Kano_오프라인_응답지_스마트팜_a_b_c_d_e@example.com.html');
    });

    it('완전한 답변은 confirm 없이 저장한다', () => {
        const browser = executeBrowserScript(buildHtml(), {
            email: 'tester@example.com',
            checked: ALL_ANSWERED,
        });
        browser.listeners.get('click')!();
        expect(browser.confirm).not.toHaveBeenCalled();
        expect(browser.blobs).toHaveLength(1);
        expect(browser.anchors[0].click).toHaveBeenCalledOnce();
    });

    it.each([
        ['비어 있으면', ''],
        ['공백뿐이면', '   '],
        ['형식이 틀리면', 'tester@example'],
        ['@ 가 없으면', 'tester.example.com'],
    ])('이메일이 %s 저장하지 않고 입력을 요구한다', (_case, email) => {
        const browser = executeBrowserScript(buildHtml(), {
            email,
            checked: ALL_ANSWERED,
        });
        browser.listeners.get('click')!();
        expect(browser.alert).toHaveBeenCalledWith('이메일 주소를 입력해야 응답을 저장할 수 있습니다.');
        expect(browser.emailInput.focus).toHaveBeenCalledOnce();
        expect(browser.confirm).not.toHaveBeenCalled();
        expect(browser.payloadElement.textContent).toBe(JSON.stringify(extractPayload(buildHtml())));
        expect(browser.blobs).toHaveLength(0);
        expect(browser.anchors).toHaveLength(0);
    });
});

describe('설문지 파일 덮어쓰기', () => {

    function fakePicker(options: { rejectWith?: unknown } = {}) {
        const writes: unknown[] = [];
        const close = vi.fn(() => Promise.resolve());
        const handle = {
            createWritable: vi.fn(() => Promise.resolve({
                write: (data: unknown) => { writes.push(data); return Promise.resolve(); },
                close,
            })),
        };
        const picker = vi.fn((_options: unknown) => (options.rejectWith
            ? Promise.reject(options.rejectWith)
            : Promise.resolve(handle)));
        return { picker, handle, writes, close };
    }

    it('처음 저장할 때 이메일이 붙은 이름을 제안하고 그 파일에 쓴다', async () => {
        const fake = fakePicker();
        const browser = executeBrowserScript(buildHtml(), {
            email: 'tester@example.com', checked: ALL_ANSWERED, showSaveFilePicker: fake.picker,
        });
        browser.listeners.get('click')!();
        await vi.waitFor(() => expect(browser.alert).toHaveBeenCalledWith('설문지 파일에 응답을 저장했습니다.'));
        expect(fake.picker).toHaveBeenCalledWith({
            suggestedName: 'Kano_오프라인_응답지_스마트팜_tester@example.com.html',
            types: [{ description: 'HTML 설문지', accept: { 'text/html': ['.html'] } }],
        });
        expect(fake.writes).toHaveLength(1);
        expect(fake.close).toHaveBeenCalledOnce();
        expect(browser.blobs.at(-1)).toEqual({
            parts: [expect.stringMatching(/^<!DOCTYPE html>\n<html>/)],
            options: { type: 'text/html;charset=utf-8' },
        });
        expect(browser.anchors).toHaveLength(0);
    });

    it('다시 저장하면 파일을 또 묻지 않고 같은 파일을 덮어쓴다', async () => {
        const fake = fakePicker();
        const browser = executeBrowserScript(buildHtml(), {
            email: 'tester@example.com', checked: ALL_ANSWERED, showSaveFilePicker: fake.picker,
        });
        browser.listeners.get('click')!();
        await vi.waitFor(() => expect(browser.alert).toHaveBeenCalledTimes(1));
        browser.listeners.get('click')!();
        await vi.waitFor(() => expect(browser.alert).toHaveBeenCalledTimes(2));
        expect(fake.picker).toHaveBeenCalledOnce();
        expect(fake.handle.createWritable).toHaveBeenCalledTimes(2);
        expect(fake.writes).toHaveLength(2);
    });

    it('이메일을 바꾸면 이전 파일에 덮어쓰지 않고 새 이름으로 다시 묻는다', async () => {
        const fake = fakePicker();
        const browser = executeBrowserScript(buildHtml(), {
            email: 'first@example.com', checked: ALL_ANSWERED, showSaveFilePicker: fake.picker,
        });
        browser.listeners.get('click')!();
        await vi.waitFor(() => expect(browser.alert).toHaveBeenCalledTimes(1));
        browser.emailInput.value = 'second@example.com';
        browser.listeners.get('click')!();
        await vi.waitFor(() => expect(browser.alert).toHaveBeenCalledTimes(2));
        expect(fake.picker).toHaveBeenCalledTimes(2);
        expect(fake.picker).toHaveBeenLastCalledWith(expect.objectContaining({
            suggestedName: 'Kano_오프라인_응답지_스마트팜_second@example.com.html',
        }));
    });

    it('파일 선택을 취소하면 아무것도 알리지 않는다', async () => {
        const fake = fakePicker({ rejectWith: { name: 'AbortError' } });
        const browser = executeBrowserScript(buildHtml(), {
            email: 'tester@example.com', checked: ALL_ANSWERED, showSaveFilePicker: fake.picker,
        });
        browser.listeners.get('click')!();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(fake.picker).toHaveBeenCalledOnce();
        expect(browser.alert).not.toHaveBeenCalled();
        expect(browser.anchors).toHaveLength(0);
    });

    it('쓰기에 실패하면 알리고 다음 저장에서 파일을 다시 고르게 한다', async () => {
        const fake = fakePicker();
        fake.handle.createWritable
            .mockImplementationOnce(() => Promise.reject(new Error('denied')));
        const browser = executeBrowserScript(buildHtml(), {
            email: 'tester@example.com', checked: ALL_ANSWERED, showSaveFilePicker: fake.picker,
        });
        browser.listeners.get('click')!();
        await vi.waitFor(() => expect(browser.alert).toHaveBeenCalledWith('설문지 파일에 저장하지 못했습니다. 다시 시도해 주세요.'));
        browser.listeners.get('click')!();
        await vi.waitFor(() => expect(browser.alert).toHaveBeenCalledWith('설문지 파일에 응답을 저장했습니다.'));
        expect(fake.picker).toHaveBeenCalledTimes(2);
        expect(fake.writes).toHaveLength(1);
    });
});

describe('미리보기와 배포본의 마크업 경계', () => {
    // 미리보기는 화면 안에서 설문지 모양만 보여 주므로 편집기·저장 스크립트가 없어야 하고,
    // 배포본에는 그 자리에 다른 글자가 끼어들면 안 된다.
    const preview = buildHtml({ preview: true });
    const form = buildHtml();

    it('미리보기는 소개문 뒤에 편집기 없이 머리말을 닫는다', () => {
        expect(preview).toMatch(/<p class="introduction">[^<]*<\/p>\s*<\/header>/);
    });

    it('미리보기는 응답·저장 컨트롤을 숨기고 실행 스크립트를 싣지 않는다', () => {
        expect(preview).toContain('.respondent, .save-hint, button { display: none; }');
        expect(preview).toMatch(/<\/script>\s*<\/body>/);
        expect(preview.match(/<script>/g)).toBeNull();
    });

    it('배포본 스타일에는 미리보기 전용 규칙이 끼지 않는다', () => {
        expect(form).toMatch(/\.introduction-fields input \{[^}]*\}\s*\.requirement \{/);
    });

    it('배포본 편집기의 입력 칸은 구분 문자 없이 이어 붙인다', () => {
        const fields = form.match(/<div class="introduction-fields">([\s\S]*?)<\/div>/)?.[1] ?? '';
        expect(fields).toMatch(/^(<label for="kano-intro-[a-zA-Z]+">[^<]*<input [^>]*><\/label>)+$/);
    });
});

describe('저장 안내 문구', () => {
    it('첫 저장 때 뜨는 저장 창에서 제안된 이름 그대로 저장하라고 안내한다', () => {
        // 브라우저가 페이지의 파일 쓰기를 막아 첫 저장은 반드시 위치를 묻는다. 안내가 없으면
        // 응답자가 이름을 바꿔 저장해 응답자별 구분이 흐트러진다.
        const html = buildHtml();
        expect(html).toMatch(/<button type="button" id="kano-save">응답 저장<\/button>\s*<p class="save-hint">처음 저장할 때 저장 위치를 묻는 창이 뜨면, 제안된 이름\(설문지 이름 뒤에 이메일이 붙은 이름\) 그대로 저장하세요\./);
    });

    it('미리보기와 인쇄에서는 안내를 숨긴다', () => {
        expect(buildHtml({ preview: true })).toContain('.respondent, .save-hint, button { display: none; }');
        expect(buildHtml()).toContain('@media print { body { background: white; } main { width: 100%; margin: 0; padding: 0; } .respondent, .save-hint, button, .introduction-editor { display: none; } }');
    });
});
