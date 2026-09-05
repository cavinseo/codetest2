// 저장된 오프라인 Kano HTML에서 신뢰할 수 있는 응답만 추출하는 계약을 검증한다.
import { describe, expect, it } from 'vitest';
import {
    KANO_OFFLINE_PAYLOAD_ID,
    buildKanoOfflineFormHtml,
} from '../lib/kano-offline-form';
import { parseKanoOfflineResponseHtml } from '../lib/kano-offline-response';

const OPTIONS = {
    requirementCount: 2,
    projectId: 'proj_1',
    fallbackEmail: 'offline-html-1@import.local',
};

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        kind: 'kano-offline-response',
        version: 1,
        projectId: 'proj_1',
        respondentEmail: 'respondent@example.com',
        answers: [{ index: 0, positive: 1, negative: 5 }],
        ...overrides,
    };
}

function htmlWithPayload(value: unknown, openingTag?: string): string {
    const serialized = JSON.stringify(value).replace(/</g, '\\u003c');
    return `<html><body>${openingTag ?? `<script id="${KANO_OFFLINE_PAYLOAD_ID}" type="application/json">`}${serialized}</script></body></html>`;
}

function replaceGeneratedPayload(html: string, value: unknown): string {
    const serialized = JSON.stringify(value).replace(/</g, '\\u003c');
    const pattern = new RegExp(
        `(<script id="${KANO_OFFLINE_PAYLOAD_ID}" type="application/json">)[\\s\\S]*?(<\\/script>)`
    );
    return html.replace(pattern, (_match, opening, closing) => opening + serialized + closing);
}

describe('parseKanoOfflineResponseHtml', () => {
    it('생성기 HTML의 저장 payload를 업로드 응답으로 왕복한다', () => {
        const generated = buildKanoOfflineFormHtml({
            projectId: 'proj_1',
            projectName: '스마트팜',
            requirements: [{ requirement: '안전' }, { requirement: '속도' }],
        });
        const html = replaceGeneratedPayload(generated, payload({
            respondentEmail: '  saved@example.com  ',
            answers: [
                { index: 0, positive: 1, negative: 5 },
                { index: 1, positive: 2, negative: 4 },
            ],
        }));

        expect(parseKanoOfflineResponseHtml(html, OPTIONS)).toEqual({
            ok: true,
            respondentEmail: 'saved@example.com',
            answers: [
                {
                    respondentEmail: 'saved@example.com',
                    requirementIndex: 0,
                    positiveAnswer: 1,
                    negativeAnswer: 5,
                },
                {
                    respondentEmail: 'saved@example.com',
                    requirementIndex: 1,
                    positiveAnswer: 2,
                    negativeAnswer: 4,
                },
            ],
        });
    });

    it('속성 순서와 따옴표 종류가 달라도 payload를 찾는다', () => {
        const html = htmlWithPayload(
            payload(),
            `<script type='application/json' data-note='saved' id='${KANO_OFFLINE_PAYLOAD_ID}'>`
        );
        const flexibleAttributes = htmlWithPayload(
            payload(),
            `<script  async  data-note \n = \n saved \n  id = '${KANO_OFFLINE_PAYLOAD_ID}'>`
        );
        const unquotedAttribute = htmlWithPayload(
            payload(),
            `<script data-note=saved id='${KANO_OFFLINE_PAYLOAD_ID}'>`
        );

        expect(parseKanoOfflineResponseHtml(html, OPTIONS).ok).toBe(true);
        expect(parseKanoOfflineResponseHtml(flexibleAttributes, OPTIONS).ok).toBe(true);
        expect(parseKanoOfflineResponseHtml(unquotedAttribute, OPTIONS).ok).toBe(true);
    });

    it('ID 속성 주변과 닫는 태그에 공백이 있어도 payload를 찾는다', () => {
        const serialized = JSON.stringify(payload());
        const html = `<script type="application/json" id \n = \n "${KANO_OFFLINE_PAYLOAD_ID}">${serialized}</script \n >`;

        expect(parseKanoOfflineResponseHtml(html, OPTIONS).ok).toBe(true);
    });

    it('다른 속성값 속 가짜 ID와 대문자 ID 값은 대상 script로 보지 않는다', () => {
        const serialized = JSON.stringify(payload());
        const decoy = `<script data-note="fake id='${KANO_OFFLINE_PAYLOAD_ID}'">${serialized}</script>`;
        const upperCaseId = `<script id="${KANO_OFFLINE_PAYLOAD_ID.toUpperCase()}">${serialized}</script>`;
        const expected = {
            ok: false,
            error: '오프라인 응답지 형식이 아닙니다. 설문지에서 「응답 저장」 으로 만든 HTML 을 올려 주세요.',
        };

        expect(parseKanoOfflineResponseHtml(decoy, OPTIONS)).toEqual(expected);
        expect(parseKanoOfflineResponseHtml(upperCaseId, OPTIONS)).toEqual(expected);
    });

    it('안전 직렬화된 script 종료 문자열을 projectId 원문으로 비교한다', () => {
        const projectId = 'proj_</script><script>alert(1)</script>';
        const generated = buildKanoOfflineFormHtml({
            projectId,
            projectName: '스크립트 안전성',
            requirements: [{ requirement: '안전' }],
        });
        const html = replaceGeneratedPayload(generated, payload({ projectId }));

        expect(parseKanoOfflineResponseHtml(html, {
            requirementCount: 1,
            projectId,
            fallbackEmail: 'offline-html-1@import.local',
        })).toMatchObject({ ok: true, respondentEmail: 'respondent@example.com' });
    });

    it('대상 script 블록이 없으면 형식 오류를 돌려준다', () => {
        expect(parseKanoOfflineResponseHtml('<html></html>', OPTIONS)).toEqual({
            ok: false,
            error: '오프라인 응답지 형식이 아닙니다. 설문지에서 「응답 저장」 으로 만든 HTML 을 올려 주세요.',
        });
    });

    it('JSON을 읽을 수 없으면 손상 오류를 돌려준다', () => {
        const html = `<script id="${KANO_OFFLINE_PAYLOAD_ID}" type="application/json">{broken}</script>`;

        expect(parseKanoOfflineResponseHtml(html, OPTIONS)).toEqual({
            ok: false,
            error: '응답 데이터를 읽을 수 없습니다. 파일이 손상되었을 수 있습니다.',
        });
    });

    it.each([
        null,
        [],
        'payload',
        1,
        {},
        payload({ kind: 'other' }),
        payload({ version: 2 }),
    ])('비객체 또는 kind/version 불일치는 버전 오류로 수렴시킨다', (value) => {
        expect(parseKanoOfflineResponseHtml(htmlWithPayload(value), OPTIONS)).toEqual({
            ok: false,
            error: '지원하지 않는 오프라인 응답지 버전입니다.',
        });
    });

    it('프로젝트 불일치를 답변 검증보다 먼저 거부한다', () => {
        const html = htmlWithPayload(payload({ projectId: 'proj_other', answers: [] }));

        expect(parseKanoOfflineResponseHtml(html, OPTIONS)).toEqual({
            ok: false,
            error: '다른 프로젝트의 응답지입니다.',
        });
    });

    it('잘못된 항목만 버리고 유효 항목과 중복 index는 입력 순서대로 유지한다', () => {
        const html = htmlWithPayload(payload({
            answers: [
                null,
                { index: 0, positive: 1, negative: 5 },
                { index: -1, positive: 1, negative: 5 },
                { index: 2, positive: 1, negative: 5 },
                { index: 0.5, positive: 1, negative: 5 },
                { index: '0', positive: 1, negative: 5 },
                { index: 1, positive: null, negative: 4 },
                { index: 1, positive: 0, negative: 4 },
                { index: 1, positive: 2, negative: 6 },
                { index: 1, positive: 2.5, negative: 4 },
                { index: 1, positive: '2', negative: 4 },
                { index: 1, positive: 2, negative: 4 },
                { index: 0, positive: 3, negative: 3 },
            ],
        }));

        expect(parseKanoOfflineResponseHtml(html, OPTIONS)).toEqual({
            ok: true,
            respondentEmail: 'respondent@example.com',
            answers: [
                {
                    respondentEmail: 'respondent@example.com',
                    requirementIndex: 0,
                    positiveAnswer: 1,
                    negativeAnswer: 5,
                },
                {
                    respondentEmail: 'respondent@example.com',
                    requirementIndex: 1,
                    positiveAnswer: 2,
                    negativeAnswer: 4,
                },
                {
                    respondentEmail: 'respondent@example.com',
                    requirementIndex: 0,
                    positiveAnswer: 3,
                    negativeAnswer: 3,
                },
            ],
        });
    });

    it.each([
        undefined,
        null,
        [],
        [{ index: 0, positive: null, negative: 5 }],
    ])('채택할 답변이 없으면 빈 응답 오류를 돌려준다', (answers) => {
        expect(parseKanoOfflineResponseHtml(
            htmlWithPayload(payload({ answers })),
            OPTIONS
        )).toEqual({ ok: false, error: '응답이 하나도 없습니다.' });
    });

    it.each(['', '   ', null, 123])('이메일이 비었거나 문자열이 아니면 fallback을 쓴다', (respondentEmail) => {
        const result = parseKanoOfflineResponseHtml(
            htmlWithPayload(payload({ respondentEmail })),
            OPTIONS
        );

        expect(result).toEqual({
            ok: true,
            respondentEmail: 'offline-html-1@import.local',
            answers: [{
                respondentEmail: 'offline-html-1@import.local',
                requirementIndex: 0,
                positiveAnswer: 1,
                negativeAnswer: 5,
            }],
        });
    });
});
