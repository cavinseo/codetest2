import { getKanoTopic } from './utils/korean-utils';
import { kanoSurveyAnswerLabels, resolveKanoQuestionPair } from './kano-survey-document';

export interface KanoFormScriptRequirement {
    category?: string | null;
    subcategory?: string | null;
    requirement: string;
    kanoPositiveQ?: string | null;
    kanoNegativeQ?: string | null;
}

function escapeScriptString(value: string): string {
    return JSON.stringify(value);
}

function questionTitle(requirement: KanoFormScriptRequirement, index: number, type: 'positive' | 'negative'): string {
    const topic = getKanoTopic(requirement.requirement);
    const questionNumber = type === 'positive' ? 1 : 2;
    return `[${index + 1}-${questionNumber}] ${topic}`;
}

export function buildKanoGoogleFormScript(
    requirements: KanoFormScriptRequirement[],
    projectName = 'Kano 설문'
): string {
    const payload = requirements.map((requirement, index) => {
        const pair = resolveKanoQuestionPair(requirement);
        return {
            positiveTitle: questionTitle(requirement, index, 'positive'),
            positiveDescription: pair.positive,
            negativeTitle: questionTitle(requirement, index, 'negative'),
            negativeDescription: pair.negative,
        };
    });

    return `/**
 * Kano Google Forms 생성 스크립트
 *
 * 사용 방법:
 * 1. Google Drive에서 새 Google Apps Script 프로젝트를 만듭니다.
 * 2. 이 파일 내용을 붙여넣고 createKanoForm() 함수를 실행합니다.
 * 3. 권한 승인 후 로그에 출력되는 설문지 URL을 확인합니다.
 */
function createKanoForm() {
  const form = FormApp.create(${escapeScriptString(`Kano 설문 조사 - ${projectName}`)});
  form.setDescription(
    '이 설문은 제품/서비스의 각 기능에 대한 고객 만족도를 측정하기 위한 Kano 모델 기반 설문입니다.\\n\\n' +
    '각 기능에 대해 긍정 질문과 부정 질문 두 가지에 답변해 주세요.\\n\\n' +
    '응답 완료 후 Google Forms 응답 시트를 xlsx로 다운로드하여 시스템에 업로드할 수 있습니다.'
  );
  form.setCollectEmail(true);

  const choices = ${JSON.stringify(kanoSurveyAnswerLabels(), null, 2)};
  const questions = ${JSON.stringify(payload, null, 2)};

  questions.forEach((question) => {
    form.addMultipleChoiceItem()
      .setTitle(question.positiveTitle)
      .setHelpText(question.positiveDescription)
      .setChoiceValues(choices)
      .setRequired(true);

    form.addMultipleChoiceItem()
      .setTitle(question.negativeTitle)
      .setHelpText(question.negativeDescription)
      .setChoiceValues(choices)
      .setRequired(true);
  });

  Logger.log('응답자용 URL: ' + form.getPublishedUrl());
  Logger.log('편집용 URL: ' + form.getEditUrl());
}
`;
}
