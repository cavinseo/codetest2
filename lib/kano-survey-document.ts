// WS-6 종이 설문지(「고객니즈조사 설문지」 양식)의 내용을 순수 데이터로 만든다.
//
// 문구·행 번호 규칙·파일명은 전부 여기에 있고 .docx 로 바꾸는 일은 kano-survey-docx.ts 가
// 한다. 양식이 바뀌면 이 파일만 고치면 되고, 실DB 도 Word 도 없이 테스트할 수 있다.
import { getKanoTopic } from './utils/korean-utils';
import { getKanoAnswerLabel } from './kano-response-display';

export interface KanoSurveyRequirement {
    requirement: string;
    kanoPositiveQ?: string | null;
    kanoNegativeQ?: string | null;
}

export interface KanoSurveyRow {
    /** 양식의 행 번호. N-1 이 긍정, N-2 가 부정이다. */
    no: string;
    text: string;
}

export interface KanoSurveyDocumentModel {
    title: string;
    guide: string;
    introduction: string;
    /** 표 첫 열 머리글. */
    questionHeader: string;
    /** 응답 척도 5개. 점수 1~5 순서다. */
    answerLabels: string[];
    rows: KanoSurveyRow[];
    closing: string;
}

export const KANO_SURVEY_TITLE = '고객니즈조사 설문지';

export const KANO_SURVEY_GUIDE =
    '본 설문은 고객의 정확한 의견을 도출하기 위해 Kano 방식으로 작성되어 같은 내용의 질문을 '
    + '긍정과 부정으로 작성되어 있습니다. 각 항목을 읽고 긍정과 부정의 질문 모두 해당되는 항목에 '
    + '표시하여 주시기 바랍니다.';

// 「　」 는 회사가 배포 전에 손으로 채우는 빈칸이다. 프로젝트명 등을 자동으로 넣지 않는다 —
// 틀린 값이 인쇄물에 박히는 것보다 빈칸이 낫다.
export const KANO_SURVEY_INTRODUCTION =
    '(제품/서비스 소개) 안녕하세요. 「　　　　　　　」 기술을 활용하여 다양한 「　　　　」제품을 '
    + '개발하고 있는 「　　　　」 대표 「　　　　」입니다. 본 설문은 자사에서 제공하는 「　　　　」에 '
    + '대하여, 소비자의 의견을 수렴하여 좀 더 나은 서비스를 만드는데 필요한 기초 자료를 얻는 것에 '
    + '목적이 있습니다. 귀하께서 응답하시는 내용은 정답이 없으며, 오직 제품 레벨 업을 위한 용도로만 '
    + '사용할 것을 약속드립니다. 바쁘신 가운데 시간을 내어 주셔서 대단히 감사합니다. '
    + '/(필요시 이미지 자료 첨부가능)';

export const KANO_SURVEY_QUESTION_HEADER = '질 문 문 항';

export const KANO_SURVEY_CLOSING =
    '긴 시간 질문에 성심껏 응답해 주셔서 감사합니다. 귀하의 의견을 참고하여 좋은 자료로 활용 하겠습니다.';

/** 응답 척도. 앱의 문구를 그대로 써야 종이 응답을 엑셀 업로드 양식에 옮길 때 헷갈리지 않는다. */
export function kanoSurveyAnswerLabels(): string[] {
    return [1, 2, 3, 4, 5].map((score) => getKanoAnswerLabel(score));
}

/**
 * 저장된 질문이 없으면 화면(KanoManager)이 보여 주는 것과 같은 기본 문구를 만든다.
 * 인쇄물이 화면과 달라지면 안 되므로 규칙은 여기 한 곳에만 둔다.
 */
export function resolveKanoQuestionPair(requirement: KanoSurveyRequirement): { positive: string; negative: string } {
    const topic = getKanoTopic(requirement.requirement);
    return {
        positive: requirement.kanoPositiveQ?.trim() || `${topic}(이)라면 어떻게 생각하십니까?`,
        negative: requirement.kanoNegativeQ?.trim() || `${topic}(이)가 아니라면 어떻게 생각하십니까?`,
    };
}

export function buildKanoSurveyDocumentModel(requirements: KanoSurveyRequirement[]): KanoSurveyDocumentModel {
    const rows: KanoSurveyRow[] = [];
    requirements.forEach((requirement, index) => {
        const pair = resolveKanoQuestionPair(requirement);
        const n = index + 1;
        rows.push({ no: `${n}-1`, text: pair.positive });
        rows.push({ no: `${n}-2`, text: pair.negative });
    });

    return {
        title: KANO_SURVEY_TITLE,
        guide: KANO_SURVEY_GUIDE,
        introduction: KANO_SURVEY_INTRODUCTION,
        questionHeader: KANO_SURVEY_QUESTION_HEADER,
        answerLabels: kanoSurveyAnswerLabels(),
        rows,
        closing: KANO_SURVEY_CLOSING,
    };
}

const FILE_NAME_MAX = 60;

/**
 * 내려받을 파일명. 프로젝트명에 경로 구분자나 제어 문자가 있으면 브라우저가 파일명을
 * 자르거나 거부하므로 밑줄로 바꾼다. 비어 있으면 기본 이름을 쓴다.
 *
 * 두 단계로 나눈 이유: 제어 문자(U+0000~U+001F — 줄바꿈·탭·NUL 등)는 파일명과
 * 응답 헤더(Content-Disposition)에 그대로 남으면 안 되므로 무조건 밑줄로 바꾼다.
 * 반면 일반 공백(스페이스)은 파일명에 남아도 무해하므로, 사람이 실수로 겹쳐 넣은
 * 것만 하나로 줄이면 된다 — 없애야 할 것과 다듬기만 하면 되는 것이 다르므로 정규식도
 * 나눴다. 먼저 예약 문자·제어 문자 전 범위를 밑줄로 바꾸고, 그 뒤에 남은 공백만
 * 하나로 줄인다(제어 문자는 이미 밑줄이 됐으므로 이 단계에서 다시 섞이지 않는다).
 *
 * 정규식에 제어 문자 범위(U+0000~U+001F)를 직접 쓴 것은 실수가 아니라 의도다 —
 * 파일명·HTTP 헤더에 제어 문자가 새면 안 된다는 요구를 정규식 하나로 표현한 것이며,
 * 아래 테스트(탭·NUL)가 이 범위가 빠지면 바로 실패해 고정한다. ESLint 의
 * no-control-regex 규칙이 이 프로젝트 설정(next/core-web-vitals)에서 실제로
 * 걸리는지는 이 환경(node_modules 없음)에서 확인하지 못했다 — 걸리면 아래처럼
 * 이유를 적은 disable 주석으로 대응한다(RISKS 참고).
 * 접두사와 확장자는 부르는 쪽이 붙인다 — 설문지(.docx)와 오프라인 응답지(.html)가 같은 정리 규칙을 써야 하기 때문이다.
 */
export function kanoSurveyFileNameStem(projectName: string | null | undefined): string {
    const cleaned = (projectName ?? '')
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, FILE_NAME_MAX);
    return cleaned || '프로젝트';
}

export function kanoSurveyFileName(projectName: string | null | undefined): string {
    return `Kano_설문지_${kanoSurveyFileNameStem(projectName)}.docx`;
}
