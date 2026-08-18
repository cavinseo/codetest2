// 태스크별 프롬프트 빌더.
//
// openai-compatible.ts 안에 인라인으로 두면 서버가 직접 LLM을 부를 때만 쓸 수 있다.
// 브라우저 경유 호출에서는 서버가 프로바이더 없이 같은 프롬프트를 만들어 내려보내야
// 하므로 여기로 분리한다.
import type {
    AttributeDraftInput,
    MentorQuestionsInput,
    SpecDraftInput,
} from './types';

export interface AiPrompts {
    system: string;
    user: string;
}

const MENTOR_QUESTIONS_SPEC = `{
  "questions": [
    { "id": "짧은 영문 슬러그", "field": "marketSegment | customerName | customerNeed | benefit",
      "question": "한국어 질문", "hint": "한국어 힌트", "examples": ["예시1", "예시2"] }
  ],
  "focus": "지금 가장 먼저 채워야 할 항목에 대한 한 문장 안내"
}`;

const ATTRIBUTE_DRAFT_SPEC = `{
  "rows": [
    { "marketSegment": "세분시장", "customerName": "고객명",
      "customerNeed": "고객 니즈", "benefit": "제공혜택" }
  ],
  "issues": [ { "severity": "info | warning | error", "message": "한국어 설명" } ]
}`;

const SPEC_DRAFT_SPEC = `{
  "cores": [
    { "name": "핵심기술 이름",
      "subs": [
        { "name": "세부기술 이름",
          "details": [
            { "name": "구현기능 이름", "technology": "적용기술 이름" }
          ] }
      ] }
  ]
}`;

export function buildMentorQuestionsPrompts(input: MentorQuestionsInput): AiPrompts {
    return {
        system: `당신은 제품기획 워크시트(WS-3 제품속성서) 작성을 돕는 멘토입니다.
사용자가 시장세분화, 세분시장별 고객명, 고객 문제를 스스로 구체화하도록 질문을 만드세요.
반드시 아래 JSON 형식으로만 답하세요.
${MENTOR_QUESTIONS_SPEC}`,
        user: `제품명: ${input.project.name}
설명: ${input.project.description ?? ''}
상세: ${input.project.detailedDescription ?? ''}
이미 입력된 행 수: ${input.existingRows?.length ?? 0}
이미 입력된 내용 요약: ${summarizeRows(input.existingRows)}`,
    };
}

export function buildAttributeDraftPrompts(input: AttributeDraftInput): AiPrompts {
    return {
        system: `당신은 제품기획 워크시트(WS-3 제품속성서) 작성을 돕는 멘토입니다.
사용자의 답변을 표의 행으로 정리하세요.
같은 세분시장 안에서 고객 니즈와 제공혜택이 동일하면 같은 문장을 그대로 반복해 넣으세요(표에서 병합되어 한 번만 표기됩니다).
반드시 아래 JSON 형식으로만 답하세요.
${ATTRIBUTE_DRAFT_SPEC}`,
        user: `제품명: ${input.project.name}
설명: ${input.project.description ?? ''}
세분화 기준: ${input.answers.segmentationBasis ?? ''}
세분시장: ${input.answers.marketSegments ?? ''}
세분시장별 고객명: ${input.answers.customerNames ?? ''}
세분시장별 고객 문제: ${input.answers.customerProblems ?? ''}
기대 혜택: ${input.answers.expectedBenefits ?? ''}`,
    };
}

export function buildSpecDraftPrompts(input: SpecDraftInput): AiPrompts {
    // 로컬 소형 모델의 문맥 한계를 고려해, 원본 문맥에서 필요한 것만 짧게 추린다.
    const hints = {
        customerNeeds: joinNames([
            ...(input.productAttributes ?? []).map((row) => row.customerNeed),
            ...(input.customerRequirements ?? []).map((row) => row.requirement),
        ]),
        technologies: joinNames([
            ...(input.productAttributes ?? []).map((row) => row.techCapability),
            ...(input.qfdTechnicals ?? []).map((row) => row.name),
        ]),
        existingSpecNames: joinNames((input.existingSpecs ?? []).map((row) => row.name)),
    };

    return {
        system: `당신은 제품기획 워크시트(WS-2 AS-IS 스펙표) 작성을 돕는 기술 분석가입니다.
제품을 FAST 3계층으로 분해하세요.
- 핵심기술(core): 제품을 이루는 큰 기술 덩어리. 3~6개.
- 세부기술(sub): 각 핵심기술을 이루는 하위 기술. 핵심기술마다 2~3개.
- 구현기능(detail): 실제로 만들 기능. 세부기술마다 2개. 각 구현기능에는 적용기술을 하나씩 적습니다.
이름은 모두 한국어로, 40자 이내의 명사구로 쓰세요.
반드시 아래 JSON 형식으로만 답하세요.
${SPEC_DRAFT_SPEC}`,
        user: `제품명: ${input.project.name}
설명: ${input.project.description ?? ''}
상세 제품개요: ${truncate(input.project.detailedDescription ?? '', 1200)}
추가 세부설명: ${truncate(input.additionalDescription ?? '', 800)}
원하는 기능: ${truncate(input.structuredInput?.currentFunctions ?? '', 500)}
참고 - 고객 요구사항: ${truncate(hints.customerNeeds, 500) || '없음'}
참고 - 보유 기술: ${truncate(hints.technologies, 500) || '없음'}
참고 - 기존 스펙 항목: ${truncate(hints.existingSpecNames, 500) || '없음'}`,
    };
}

function joinNames(values: Array<string | null | undefined>): string {
    return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))
        .slice(0, 12)
        .join(', ');
}

function truncate(value: string, max: number): string {
    const trimmed = value.trim();
    return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}...`;
}

function summarizeRows(rows: MentorQuestionsInput['existingRows']): string {
    if (!rows || rows.length === 0) return '없음';
    return rows
        .slice(0, 10)
        .map((row) => [row.marketSegment, row.customerName, row.customerNeed, row.benefit].filter(Boolean).join(' / '))
        .filter(Boolean)
        .join(' | ') || '없음';
}
