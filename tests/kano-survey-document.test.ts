// 종이 설문지 모델이 양식의 문구와 행 번호 규칙을 그대로 지키는지 확인하는 테스트입니다.
import { describe, expect, it } from 'vitest';
import {
    KANO_SURVEY_CLOSING,
    KANO_SURVEY_GUIDE,
    KANO_SURVEY_INTRODUCTION,
    KANO_SURVEY_QUESTION_HEADER,
    KANO_SURVEY_TITLE,
    buildKanoSurveyDocumentModel,
    kanoSurveyAnswerLabels,
    kanoSurveyFileName,
    resolveKanoQuestionPair,
} from '../lib/kano-survey-document';
import { getKanoAnswerLabel } from '../lib/kano-response-display';

describe('resolveKanoQuestionPair', () => {
    it('저장된 질문이 있으면 그대로 쓴다', () => {
        const pair = resolveKanoQuestionPair({
            requirement: '오경보를 억제해야 한다',
            kanoPositiveQ: '오경보 억제 기능을 제공한다면 어떻게 생각하십니까?',
            kanoNegativeQ: '오경보 억제 기능을 제공하지 않는다면 어떻게 생각하십니까?',
        });
        expect(pair.positive).toBe('오경보 억제 기능을 제공한다면 어떻게 생각하십니까?');
        expect(pair.negative).toBe('오경보 억제 기능을 제공하지 않는다면 어떻게 생각하십니까?');
    });

    it('저장된 질문이 없으면 화면과 같은 기본 문구를 만든다', () => {
        // KanoManager 가 보여 주는 기본값과 같아야 인쇄물이 화면과 어긋나지 않는다.
        const pair = resolveKanoQuestionPair({ requirement: '오경보를 억제해야 한다' });
        expect(pair.positive).toMatch(/\(이\)라면 어떻게 생각하십니까\?$/);
        expect(pair.negative).toMatch(/\(이\)가 아니라면 어떻게 생각하십니까\?$/);
        expect(pair.positive).not.toBe(pair.negative);
    });

    it('공백뿐인 저장값은 없는 것으로 본다', () => {
        const pair = resolveKanoQuestionPair({ requirement: '오경보를 억제해야 한다', kanoPositiveQ: '   ' });
        expect(pair.positive).toMatch(/라면 어떻게 생각하십니까\?$/);
    });

    it('저장값 앞뒤 공백은 잘라 낸다', () => {
        const pair = resolveKanoQuestionPair({ requirement: 'x', kanoPositiveQ: '  질문  ', kanoNegativeQ: ' 부정 ' });
        expect(pair.positive).toBe('질문');
        expect(pair.negative).toBe('부정');
    });
});

describe('buildKanoSurveyDocumentModel', () => {
    const REQS = [
        { requirement: '가', kanoPositiveQ: '가-긍정', kanoNegativeQ: '가-부정' },
        { requirement: '나', kanoPositiveQ: '나-긍정', kanoNegativeQ: '나-부정' },
    ];

    it('양식의 고정 문구를 그대로 담는다', () => {
        const model = buildKanoSurveyDocumentModel(REQS);
        expect(model.title).toBe('고객니즈조사 설문지');
        expect(model.guide).toBe(KANO_SURVEY_GUIDE);
        expect(model.introduction).toBe(KANO_SURVEY_INTRODUCTION);
        expect(model.questionHeader).toBe('질 문 문 항');
        expect(model.closing).toBe(KANO_SURVEY_CLOSING);
    });

    it('고정 문구가 양식 원문과 같다', () => {
        // 문구가 바뀌면 양식과 어긋나는 것이므로 원문을 그대로 단언한다.
        expect(KANO_SURVEY_TITLE).toBe('고객니즈조사 설문지');
        expect(KANO_SURVEY_GUIDE).toContain('Kano 방식으로 작성되어');
        expect(KANO_SURVEY_GUIDE).toContain('긍정과 부정의 질문 모두 해당되는 항목에 표시');
        // 부분 문자열 검사만으로는 이어 붙인 조각 하나가 통째로 사라져도 통과한다 —
        // 실제로 stryker 가 contains 에 안 걸린 조각 3개(43·45·46행)를 "" 로 바꿔도
        // 살아남았다(2026-09-04, 94.34%). 그래서 전문을 그대로 단언한다.
        expect(KANO_SURVEY_INTRODUCTION).toBe(
            '(제품/서비스 소개) 안녕하세요. 「　　　　　　　」 기술을 활용하여 다양한 「　　　　」제품을 '
            + '개발하고 있는 「　　　　」 대표 「　　　　」입니다. 본 설문은 자사에서 제공하는 「　　　　」에 '
            + '대하여, 소비자의 의견을 수렴하여 좀 더 나은 서비스를 만드는데 필요한 기초 자료를 얻는 것에 '
            + '목적이 있습니다. 귀하께서 응답하시는 내용은 정답이 없으며, 오직 제품 레벨 업을 위한 용도로만 '
            + '사용할 것을 약속드립니다. 바쁘신 가운데 시간을 내어 주셔서 대단히 감사합니다. '
            + '/(필요시 이미지 자료 첨부가능)'
        );
        // 결정 6의 기록: 양식 원문의 "좀 더 나은 더 나은 서비스" 오타는 고쳐 담는다.
        expect(KANO_SURVEY_INTRODUCTION).not.toContain('나은 더 나은');
        expect(KANO_SURVEY_QUESTION_HEADER).toBe('질 문 문 항');
        expect(KANO_SURVEY_CLOSING).toBe(
            '긴 시간 질문에 성심껏 응답해 주셔서 감사합니다. 귀하의 의견을 참고하여 좋은 자료로 활용 하겠습니다.'
        );
    });

    it('응답 척도는 앱의 라벨 5개를 점수 순서로 쓴다', () => {
        expect(kanoSurveyAnswerLabels()).toEqual([1, 2, 3, 4, 5].map((s) => getKanoAnswerLabel(s)));
        expect(kanoSurveyAnswerLabels()).toEqual(['마음에 든다', '당연하다', '아무런느낌이 없다', '하는수 없다', '마음에 안든다']);
        expect(buildKanoSurveyDocumentModel([]).answerLabels).toEqual(kanoSurveyAnswerLabels());
    });

    it('요구사항마다 N-1(긍정)·N-2(부정) 두 행을 순서대로 만든다', () => {
        const model = buildKanoSurveyDocumentModel(REQS);
        expect(model.rows).toEqual([
            { no: '1-1', text: '가-긍정' },
            { no: '1-2', text: '가-부정' },
            { no: '2-1', text: '나-긍정' },
            { no: '2-2', text: '나-부정' },
        ]);
    });

    it('요구사항이 없으면 행이 없다', () => {
        expect(buildKanoSurveyDocumentModel([]).rows).toEqual([]);
    });

    it('저장되지 않은 요구사항은 기본 문구로 채운다', () => {
        const model = buildKanoSurveyDocumentModel([{ requirement: '오경보를 억제해야 한다' }]);
        expect(model.rows[0].text).toMatch(/라면 어떻게 생각하십니까\?$/);
        expect(model.rows[1].text).toMatch(/아니라면 어떻게 생각하십니까\?$/);
    });
});

describe('kanoSurveyFileName', () => {
    it('프로젝트명을 붙인 .docx 이름을 만든다', () => {
        expect(kanoSurveyFileName('스마트팜')).toBe('Kano_설문지_스마트팜.docx');
    });

    it('경로 구분자와 제어 문자는 밑줄로 바꾼다', () => {
        expect(kanoSurveyFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('Kano_설문지_a_b_c_d_e_f_g_h_i_j.docx');
        expect(kanoSurveyFileName('줄\n바꿈')).toBe('Kano_설문지_줄_바꿈.docx');
    });

    // 줄바꿈 말고 다른 제어 문자(탭·NUL 등)도 밑줄로 바뀌는지 확인하는 회귀 테스트다.
    // 소스에 제어 문자를 날로 넣으면 에디터·git·인코딩 검사에서 다시 같은 혼동이
    // 생기므로 String.fromCharCode 로 코드포인트를 명시한다.
    it('줄바꿈 이외의 제어 문자(탭)도 밑줄로 바꾼다', () => {
        const withTab = `탭${String.fromCharCode(9)}칸`;
        expect(kanoSurveyFileName(withTab)).toBe('Kano_설문지_탭_칸.docx');
    });

    it('공백류가 아닌 제어 문자(NUL)도 밑줄로 바꾸고 원문 그대로 남기지 않는다', () => {
        // NUL 이 파일명이나 Content-Disposition 헤더에 그대로 남으면 안 된다.
        const withNul = `널${String.fromCharCode(0)}문자`;
        const result = kanoSurveyFileName(withNul);
        expect(result).toBe('Kano_설문지_널_문자.docx');
        expect(result).not.toContain(String.fromCharCode(0));
    });

    it('연속 공백은 하나로 줄이고 앞뒤 공백은 잘라 낸다', () => {
        expect(kanoSurveyFileName('  스마트   팜  ')).toBe('Kano_설문지_스마트 팜.docx');
    });

    it('비어 있거나 없으면 기본 이름을 쓴다', () => {
        expect(kanoSurveyFileName('')).toBe('Kano_설문지_프로젝트.docx');
        expect(kanoSurveyFileName('   ')).toBe('Kano_설문지_프로젝트.docx');
        expect(kanoSurveyFileName(null)).toBe('Kano_설문지_프로젝트.docx');
        expect(kanoSurveyFileName(undefined)).toBe('Kano_설문지_프로젝트.docx');
    });

    it('너무 긴 이름은 60자에서 자른다', () => {
        const long = '가'.repeat(80);
        expect(kanoSurveyFileName(long)).toBe(`Kano_설문지_${'가'.repeat(60)}.docx`);
    });
});
