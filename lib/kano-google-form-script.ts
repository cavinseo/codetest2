import { kanoSurveyAnswerLabels, resolveKanoQuestionPair, type KanoSurveyRequirement } from './kano-survey-document';
import { buildKanoSurveyIntroduction, EMPTY_KANO_INTRODUCTION, type KanoSurveyIntroduction } from './kano-survey-introduction';

const KANO_RESPONSE_GUIDE = [
    '이 설문은 제품/서비스의 각 기능에 대한 고객 만족도를 측정하기 위한 Kano 모델 기반 설문입니다.',
    '각 기능에 대해 긍정 질문과 부정 질문 두 가지에 답변해 주세요.',
    '응답 완료 후 Google Forms 응답 시트를 xlsx로 다운로드하여 시스템에 업로드할 수 있습니다.',
].join('\n\n');

// 생성된 파일은 사용자의 Google 계정에서 실행된다. 프로젝트명·소개문 같은 입력값이
// 코드로 해석되지 않도록 모든 값을 JSON 리터럴로만 끼워 넣는다.
function toScriptLiteral(value: unknown): string {
    return JSON.stringify(value, null, 2);
}

// 오프라인 HTML 설문지와 같은 소개문을 맨 위에 둔다. 응답자가 어느 경로로 받든
// 누가 무엇을 왜 묻는지 같은 문구로 읽어야 한다.
function buildFormDescription(introduction: KanoSurveyIntroduction): string {
    return `${buildKanoSurveyIntroduction(introduction)}\n\n${KANO_RESPONSE_GUIDE}`;
}

// 응답자가 설명란을 따로 읽지 않아도 되도록 질문 문장 자체를 제목으로 쓴다.
// 응답 시트 머리글이 곧 이 제목이므로 업로드 해석기가 기대는 [n-1]/[n-2]
// 접두어는 남긴다. 요구사항 id 는 응답자 화면에 보이므로 넣지 않는다 — 업로드
// 때는 머리글의 질문 문장으로 요구사항을 찾는다(kano-requirement-snapshot).
function buildQuestionTitles(requirements: KanoSurveyRequirement[]): string[] {
    return requirements.flatMap((requirement, index) => {
        const { positive, negative } = resolveKanoQuestionPair(requirement);
        const requirementNumber = index + 1;
        return [`[${requirementNumber}-1] ${positive}`, `[${requirementNumber}-2] ${negative}`];
    });
}

export function buildKanoGoogleFormScript(
    requirements: KanoSurveyRequirement[],
    projectName = 'Kano 설문',
    // 저장된 소개문이 없으면 오프라인 양식처럼 빈칸이 남아, 만든 사람이 폼에서 채운다.
    introduction: KanoSurveyIntroduction = EMPTY_KANO_INTRODUCTION
): string {
    return `/**
 * Kano Google Forms 생성 스크립트
 *
 * 사용 방법:
 * 1. Google Drive에서 새 Google Apps Script 프로젝트를 만듭니다.
 * 2. 이 파일 내용을 붙여넣고 createKanoForm() 함수를 실행합니다.
 * 3. 권한 승인 후 로그에 출력되는 설문지 URL을 확인합니다.
 */
function createKanoForm() {
  const form = FormApp.create(${toScriptLiteral(`Kano 설문 조사 - ${projectName}`)});
  form.setDescription(${toScriptLiteral(buildFormDescription(introduction))});
  form.setCollectEmail(true);

  const choices = ${toScriptLiteral(kanoSurveyAnswerLabels())};
  const questionTitles = ${toScriptLiteral(buildQuestionTitles(requirements))};

  questionTitles.forEach((title) => {
    form.addMultipleChoiceItem()
      .setTitle(title)
      .setChoiceValues(choices)
      .setRequired(true);
  });

  Logger.log('응답자용 URL: ' + form.getPublishedUrl());
  Logger.log('편집용 URL: ' + form.getEditUrl());
}
`;
}
