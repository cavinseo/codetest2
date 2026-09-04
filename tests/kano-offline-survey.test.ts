// 오프라인 Kano 설문의 해시·모델·HTML 계약을 검증한다.
import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import {
    KANO_OFFLINE_FORMAT,
    KANO_OFFLINE_VERSION,
    buildKanoOfflineSurveyModel,
    computeKanoQuestionHash,
    computeKanoQuestionSetHash,
    computeKanoQuestionTextHash,
    jsonForScript,
    kanoOfflineSurveyFileName,
    renderKanoOfflineSurveyHtml,
    type KanoOfflineSurveyModel,
} from '../lib/kano-offline-survey';

const EXPORTED_AT = new Date('2026-09-04T00:00:00.000Z');

function sha256(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

function createModel(): KanoOfflineSurveyModel {
    return buildKanoOfflineSurveyModel({
        projectId: 'proj_1',
        projectName: '스마트팜',
        requirements: [
            {
                id: 'req_b',
                category: '안전',
                requirement: '오경보를 억제해야 한다',
                kanoPositiveQ: '오경보 억제를 제공한다면 어떻습니까?',
                kanoNegativeQ: '오경보 억제를 제공하지 않는다면 어떻습니까?',
            },
            {
                id: 'req_a',
                category: '성능',
                requirement: '응답이 빨라야 한다',
            },
        ],
        exportedAt: EXPORTED_AT,
    });
}

function surveyIsland(html: string): { raw: string; value: Record<string, unknown> } {
    const match = html.match(/<script type="application\/json" id="kano-offline-survey">([\s\S]*?)<\/script>/);
    expect(match).toBeTruthy();
    const raw = match?.[1] ?? '';
    return { raw, value: JSON.parse(raw) as Record<string, unknown> };
}

describe('Kano 오프라인 설문 해시', () => {
    it('응답 형식 상수와 UTF-8 해시 입력을 고정한다', async () => {
        const hash = {
            update: vi.fn(),
            digest: vi.fn(() => 'a'.repeat(64)),
        };
        hash.update.mockReturnValue(hash);
        vi.resetModules();
        vi.doMock('crypto', () => ({ createHash: vi.fn(() => hash) }));

        const freshModule = await import('../lib/kano-offline-survey');
        expect(freshModule.KANO_OFFLINE_FORMAT).toBe('kano-offline-response');
        expect(freshModule.KANO_OFFLINE_VERSION).toBe(1);
        expect(freshModule.computeKanoQuestionHash({ id: '문항', positive: '긍정', negative: '부정' })).toBe(
            'a'.repeat(16)
        );
        expect(hash.update).toHaveBeenCalledWith('문항\n긍정\n부정', 'utf8');
        expect(hash.digest).toHaveBeenCalledWith('hex');

        vi.doUnmock('crypto');
        vi.resetModules();
    });

    it('같은 문항은 같은 16자 해시와 문구 해시를 만든다', () => {
        const question = { id: 'req_1', positive: '긍정', negative: '부정' };

        expect(computeKanoQuestionHash(question)).toBe(sha256('req_1\n긍정\n부정').slice(0, 16));
        expect(computeKanoQuestionHash(question)).toBe(computeKanoQuestionHash({ ...question }));
        expect(computeKanoQuestionTextHash(question)).toBe(sha256('긍정\n부정').slice(0, 16));
        expect(computeKanoQuestionTextHash(question)).toHaveLength(16);
    });

    it('세트 해시는 id 정렬을 사용해 입력 순서에 영향을 받지 않는다', () => {
        const a = { id: 'a', positive: 'a+', negative: 'a-' };
        const b = { id: 'b', positive: 'b+', negative: 'b-' };
        const expected = sha256(JSON.stringify([
            ['a', 'a+', 'a-'],
            ['b', 'b+', 'b-'],
        ]));

        expect(computeKanoQuestionSetHash([b, a])).toBe(expected);
        expect(computeKanoQuestionSetHash([a, b])).toBe(expected);
        expect(expected).toHaveLength(64);
    });

    it('세트 해시 정렬 비교기가 작은 값·큰 값·같은 값을 구분한다', () => {
        const sortSpy = vi.spyOn(Array.prototype, 'sort');
        const a = { id: 'a', positive: 'a+', negative: 'a-' };
        const b = { id: 'b', positive: 'b+', negative: 'b-' };

        computeKanoQuestionSetHash([b, a]);

        const compare = sortSpy.mock.calls[0]?.[0] as ((left: typeof a, right: typeof a) => number) | undefined;
        expect(compare).toBeTypeOf('function');
        expect(compare?.(a, b)).toBe(-1);
        expect(compare?.(b, a)).toBe(1);
        expect(compare?.(a, { ...a })).toBe(0);
        sortSpy.mockRestore();
    });

    it('문구 한 글자 변경은 문항 해시·문구 해시·세트 해시를 모두 바꾼다', () => {
        const before = { id: 'a', positive: '좋다', negative: '싫다' };
        const after = { ...before, positive: '좋음' };

        expect(computeKanoQuestionHash(after)).not.toBe(computeKanoQuestionHash(before));
        expect(computeKanoQuestionTextHash(after)).not.toBe(computeKanoQuestionTextHash(before));
        expect(computeKanoQuestionSetHash([after])).not.toBe(computeKanoQuestionSetHash([before]));
    });

    it('id만 바뀌면 문항 해시는 바뀌고 문구 해시는 유지된다', () => {
        const before = { id: 'a', positive: '좋다', negative: '싫다' };
        const after = { ...before, id: 'b' };

        expect(computeKanoQuestionHash(after)).not.toBe(computeKanoQuestionHash(before));
        expect(computeKanoQuestionTextHash(after)).toBe(computeKanoQuestionTextHash(before));
    });

    it('문항 추가와 삭제는 세트 해시를 바꾼다', () => {
        const a = { id: 'a', positive: 'a+', negative: 'a-' };
        const b = { id: 'b', positive: 'b+', negative: 'b-' };

        expect(computeKanoQuestionSetHash([a, b])).not.toBe(computeKanoQuestionSetHash([a]));
        expect(computeKanoQuestionSetHash([])).not.toBe(computeKanoQuestionSetHash([a]));
    });

    it('저장 질문의 앞뒤 공백은 모델 해시에서 무시한다', () => {
        const withSpaces = buildKanoOfflineSurveyModel({
            projectId: 'p',
            projectName: 'n',
            requirements: [{ id: 'q', requirement: 'r', kanoPositiveQ: '  긍정  ', kanoNegativeQ: '  부정  ' }],
            exportedAt: EXPORTED_AT,
        });
        const trimmed = buildKanoOfflineSurveyModel({
            projectId: 'p',
            projectName: 'n',
            requirements: [{ id: 'q', requirement: 'r', kanoPositiveQ: '긍정', kanoNegativeQ: '부정' }],
            exportedAt: EXPORTED_AT,
        });

        expect(withSpaces.questionSetHash).toBe(trimmed.questionSetHash);
        expect(withSpaces.questions[0].h).toBe(trimmed.questions[0].h);
        expect(withSpaces.questions[0].t).toBe(trimmed.questions[0].t);
    });
});

describe('buildKanoOfflineSurveyModel', () => {
    it('응답 옵션을 점수 순서의 enum과 앱 라벨로 만든다', () => {
        expect(createModel().answerOptions).toEqual([
            { value: 'LIKE', label: '마음에 든다' },
            { value: 'EXPECT', label: '당연하다' },
            { value: 'NEUTRAL', label: '아무런느낌이 없다' },
            { value: 'TOLERATE', label: '하는수 없다' },
            { value: 'DISLIKE', label: '마음에 안든다' },
        ]);
    });

    it('응답 옵션 정렬 비교기가 점수 차를 사용한다', () => {
        const sortSpy = vi.spyOn(Array.prototype, 'sort');

        buildKanoOfflineSurveyModel({
            projectId: 'p',
            projectName: 'n',
            requirements: [],
            exportedAt: EXPORTED_AT,
        });

        const compare = sortSpy.mock.calls[0]?.[0] as ((left: 'LIKE' | 'DISLIKE', right: 'LIKE' | 'DISLIKE') => number) | undefined;
        expect(compare).toBeTypeOf('function');
        expect(compare?.('LIKE', 'DISLIKE')).toBe(-4);
        expect(compare?.('DISLIKE', 'LIKE')).toBe(4);
        sortSpy.mockRestore();
    });

    it('저장 질문이 없으면 기본 문구를 쓰고 번호는 1부터 시작한다', () => {
        const model = createModel();

        expect(model.projectId).toBe('proj_1');
        expect(model.projectName).toBe('스마트팜');
        expect(model.exportedAt).toBe(EXPORTED_AT.toISOString());
        expect(model.questions.map((question) => question.no)).toEqual([1, 2]);
        expect(model.questions[0].category).toBe('안전');
        expect(model.questions[1].category).toBe('성능');
        expect(model.questions[1].positive).toContain('(이)라면 어떻게 생각하십니까?');
        expect(model.questions[1].negative).toContain('(이)가 아니라면 어떻게 생각하십니까?');

        const uncategorized = buildKanoOfflineSurveyModel({
            projectId: 'p',
            projectName: 'n',
            requirements: [{ id: 'q', requirement: '분류 없음' }],
            exportedAt: EXPORTED_AT,
        });
        expect(uncategorized.questions[0].category).toBe('');
    });
});

describe('renderKanoOfflineSurveyHtml', () => {
    it('설문 섬 JSON이 모델의 형식·버전·해시를 보존한다', () => {
        const model = createModel();
        const { value } = surveyIsland(renderKanoOfflineSurveyHtml(model));

        expect(value).toEqual({
            format: KANO_OFFLINE_FORMAT,
            version: KANO_OFFLINE_VERSION,
            projectId: model.projectId,
            questionSetHash: model.questionSetHash,
            questions: model.questions.map((question) => ({ id: question.id, h: question.h, t: question.t })),
            exportedAt: model.exportedAt,
        });
    });

    it('빈 응답 섬 하나를 설문 섬과 동작 스크립트보다 앞에 둔다', () => {
        const html = renderKanoOfflineSurveyHtml(createModel());
        const responseTag = '<script type="application/json" id="kano-offline-response"></script>';
        const responseIndex = html.indexOf(responseTag);
        const surveyIndex = html.indexOf('id="kano-offline-survey"');
        const actionScriptIndex = html.lastIndexOf('<script>');

        expect(html.split(responseTag)).toHaveLength(2);
        expect(responseIndex >= 0).toBe(true);
        expect(responseIndex < surveyIndex).toBe(true);
        expect(surveyIndex < actionScriptIndex).toBe(true);
    });

    it('동작 스크립트에 저장·복원·폴백 계약을 담는다', () => {
        const html = renderKanoOfflineSurveyHtml(createModel());
        const script = html.slice(html.lastIndexOf('<script>'));

        expect(script).toContain("getElementById('kano-offline-response')");
        expect(script).toContain('textContent.trim()');
        expect(script).toContain("addEventListener('DOMContentLoaded'");
        expect(script).toContain('이전에 저장한 답변이 실려 있습니다. 수정 후 다시 저장할 수 있습니다.');
        expect(script).toContain('crypto.randomUUID');
        expect(script).toContain('crypto.getRandomValues');
        expect(script).toContain("setAttribute('checked', '')");
        expect(script).toContain("removeAttribute('checked')");
        expect(script).toContain("setAttribute('value'");
        expect(script).toContain("'<!DOCTYPE html>\\n' + document.documentElement.outerHTML");
        expect(script).toContain("new Blob([html], { type: 'text/html' })");
        expect(script).toContain('kano-response-');
        expect(script).toContain('아직 답하지 않은 질문이 ');
        expect(script).toContain("classList.add('missing')");
        expect(script).toContain('scrollIntoView');
        expect(script).toContain('fallback.hidden = false');
        expect(script).toContain('답변이 담긴 설문 파일 ');
        expect(script).toContain('다시 저장하면 같은 응답이 갱신됩니다.');
        expect(script).not.toContain('save.disabled');
        expect(script).toContain('navigator.clipboard.writeText');
        expect(script).toContain("document.execCommand('copy')");
    });

    it('저장 파일을 다시 열면 응답 JSON을 복사 폴백에 복원한다', () => {
        const html = renderKanoOfflineSurveyHtml(createModel());
        const script = html.slice(html.lastIndexOf('<script>'));
        const restoreBlock = script.match(
            /document\.addEventListener\('DOMContentLoaded', function \(\) \{([\s\S]*?)\n    \}\);/
        )?.[1] ?? '';

        expect(restoreBlock).toContain(
            "var priorResponseText = document.getElementById('kano-offline-response').textContent.trim();"
        );
        expect(restoreBlock).toContain('payloadBox.value = priorResponseText;');
        expect(restoreBlock).toContain('fallback.hidden = false;');
        expect(restoreBlock).toContain('이전에 저장한 답변이 실려 있습니다. 수정 후 다시 저장할 수 있습니다.');
    });

    it('문항별 긍정·부정 라디오를 다섯 값씩 만든다', () => {
        const html = renderKanoOfflineSurveyHtml(createModel());

        expect(html.match(/name="f_req_b"/g)).toHaveLength(5);
        expect(html.match(/name="d_req_b"/g)).toHaveLength(5);
        expect(html.match(/name="f_req_a"/g)).toHaveLength(5);
        expect(html.match(/name="d_req_a"/g)).toHaveLength(5);
        for (const value of ['LIKE', 'EXPECT', 'NEUTRAL', 'TOLERATE', 'DISLIKE']) {
            expect(html).toContain(`name="f_req_b" value="${value}"`);
            expect(html).toContain(`name="d_req_b" value="${value}"`);
        }
        expect(html).toContain('</span></label><label><input');
        expect(html).toContain('<span class="no">1</span><span class="cat">안전</span><h3>오경보를 억제해야 한다</h3>');
        expect(html).toContain('<span class="no">2</span><span class="cat">성능</span><h3>응답이 빨라야 한다</h3>');
        expect(html).toContain('</section>\n<section class="item"');

        const withoutCategory = renderKanoOfflineSurveyHtml(buildKanoOfflineSurveyModel({
            projectId: 'p',
            projectName: 'n',
            requirements: [{ id: 'q', requirement: '분류 없음' }],
            exportedAt: EXPORTED_AT,
        }));
        expect(withoutCategory).toContain('<span class="no">1</span><h3>분류 없음</h3>');
    });

    it('개인정보·언어·문자셋·JavaScript 안내를 포함한다', () => {
        const html = renderKanoOfflineSurveyHtml(createModel());

        expect(html).toContain('입력한 이메일은 답변 파일에 담기며 설문 결과 관리 목적으로만 쓰입니다. 문의: 설문 담당자');
        expect(html).toContain('<html lang="ko">');
        expect(html).toContain('<meta charset="utf-8">');
        expect(html).toContain('<noscript>');
    });

    it('외부 자원 참조가 없는 자급자족 문서를 만든다', () => {
        const html = renderKanoOfflineSurveyHtml(createModel());

        expect(html).not.toMatch(/https?:\/\//i);
        expect(html).not.toContain('src=');
        expect(html).not.toContain('@import');
        expect(html).not.toContain('url(');
    });

    it('문구와 JSON을 이스케이프해 script 삽입을 막는다', () => {
        const attack = '</script><script>alert(1)</script>';
        const model = buildKanoOfflineSurveyModel({
            projectId: 'proj_xss',
            projectName: attack,
            requirements: [{
                id: attack,
                category: attack,
                requirement: attack,
                kanoPositiveQ: attack,
                kanoNegativeQ: attack,
            }],
            exportedAt: EXPORTED_AT,
        });
        const html = renderKanoOfflineSurveyHtml(model);
        const island = surveyIsland(html);

        expect(html).not.toContain('<script>alert');
        expect(html).toContain('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(island.raw).not.toContain('</script>');
        expect(island.raw).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
        expect((island.value.questions as Array<{ id: string }>)[0].id).toBe(attack);
        expect(jsonForScript({ text: `<${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}` })).toBe(
            '{"text":"\\u003c\\u2028\\u2029"}'
        );
    });
});

describe('kanoOfflineSurveyFileName', () => {
    it('Word 설문과 같은 정제 규칙으로 HTML 파일명을 만든다', () => {
        expect(kanoOfflineSurveyFileName('a/b')).toBe('Kano_설문_a_b.html');
        expect(kanoOfflineSurveyFileName('')).toBe('Kano_설문_프로젝트.html');
        expect(kanoOfflineSurveyFileName(undefined)).toBe('Kano_설문_프로젝트.html');
    });
});
