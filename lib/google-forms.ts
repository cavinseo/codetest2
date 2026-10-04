// Google Forms API 래퍼
// Kano 설문지를 Google Forms로 자동 생성하고 응답을 가져옵니다

import { getKanoTopic } from './utils/korean-utils';

const FORMS_API_BASE = 'https://forms.googleapis.com/v1/forms';

interface Requirement {
    id: string;
    category: string;
    subcategory?: string;
    requirement: string;
    kanoPositiveQ?: string | null;
    kanoNegativeQ?: string | null;
    order: number;
}

export interface KanoFormQuestionPair {
    requirementId: string;
    functionalQuestionId: string;
    dysfunctionalQuestionId: string;
}

export class GoogleFormStructureError extends Error {}

const KANO_CHOICES = [
    '마음에 든다',
    '당연하다',
    '아무런느낌이 없다',
    '하는수 없다',
    '마음에 안든다',
];

const ANSWER_MAP: Record<string, string> = {
    '마음에 든다': 'LIKE',
    '당연하다': 'EXPECT',
    '아무런느낌이 없다': 'NEUTRAL',
    '하는수 없다': 'TOLERATE',
    '마음에 안든다': 'DISLIKE',
    '😍 매우 만족 (I like it)': 'LIKE',
    '😊 당연함 (I expect it)': 'EXPECT',
    '😐 상관없음 (I am neutral)': 'NEUTRAL',
    '😕 견딜만함 (I can tolerate it)': 'TOLERATE',
    '😠 매우 불만 (I dislike it)': 'DISLIKE',
};

/**
 * Kano 설문지를 Google Forms로 생성합니다
 */
export async function createKanoForm(
    accessToken: string,
    projectName: string,
    requirements: Requirement[]
): Promise<{ formId: string; formUrl: string; editUrl: string; questionPairs: KanoFormQuestionPair[] }> {
    // Step 1: 빈 폼 생성
    const createRes = await fetch(FORMS_API_BASE, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            info: {
                title: `Kano 설문 조사 - ${projectName}`,
            },
        }),
    });

    if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(`Form creation failed: ${JSON.stringify(err)}`);
    }

    const form = await createRes.json();
    const formId = form.formId;

    // Step 2: 질문 추가 (batchUpdate)
    const requests: any[] = [];

    // 설문 설명 추가
    requests.push({
        updateFormInfo: {
            info: {
                title: `Kano 설문 조사 - ${projectName}`,
                description:
                    '이 설문은 제품/서비스의 각 기능에 대한 고객 만족도를 측정하기 위한 Kano 모델 기반 설문입니다.\n\n' +
                    '각 기능에 대해 "긍정 질문"(기능이 있을 때)과 "부정 질문"(기능이 없을 때) 두 가지에 답변해 주세요.\n\n' +
                    '[참고] 설문 응답을 시스템으로 다시 가져오기 위해, 설문지 설정에서 "이메일 주소 수집"을 활성화해 주세요.',
            },
            updateMask: 'description',
        },
    });

    // 각 요구사항에 대해 긍정/부정 질문 쌍 생성
    let itemIndex = 0;
    for (const req of requirements) {
        const topic = getKanoTopic(req.requirement);
        const categoryLabel = req.category
            ? `[${req.category}${req.subcategory ? ` > ${req.subcategory}` : ''}] `
            : '';

        // 긍정 질문
        requests.push({
            createItem: {
                item: {
                    title: `👍 [긍정] ${categoryLabel}${topic}`,
                    description: req.kanoPositiveQ || `만약 "${topic}"(이)라면 어떻게 느끼시겠습니까?`,
                    questionItem: {
                        question: {
                            required: true,
                            choiceQuestion: {
                                type: 'RADIO',
                                options: KANO_CHOICES.map((choice) => ({
                                    value: choice,
                                })),
                            },
                        },
                    },
                },
                location: { index: itemIndex++ },
            },
        });

        // 부정 질문
        requests.push({
            createItem: {
                item: {
                    title: `👎 [부정] ${categoryLabel}${topic}`,
                    description: req.kanoNegativeQ || `만약 "${topic}"(이)가 아니라면 어떻게 느끼시겠습니까?`,
                    questionItem: {
                        question: {
                            required: true,
                            choiceQuestion: {
                                type: 'RADIO',
                                options: KANO_CHOICES.map((choice) => ({
                                    value: choice,
                                })),
                            },
                        },
                    },
                },
                location: { index: itemIndex++ },
            },
        });
    }

    // batchUpdate 실행
    const updateRes = await fetch(`${FORMS_API_BASE}/${formId}:batchUpdate`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
    });

    if (!updateRes.ok) {
        const err = await updateRes.json();
        throw new Error(`Form update failed: ${JSON.stringify(err)}`);
    }

    const structureRes = await fetch(`${FORMS_API_BASE}/${formId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!structureRes.ok) throw new Error('Failed to fetch created form structure');
    const questionIds = questionIdsFromForm(await structureRes.json());
    if (questionIds.length !== requirements.length * 2) {
        throw new GoogleFormStructureError('생성한 설문의 질문 구조를 확인할 수 없습니다.');
    }

    return {
        formId,
        formUrl: form.responderUri || `https://docs.google.com/forms/d/${formId}/viewform`,
        editUrl: `https://docs.google.com/forms/d/${formId}/edit`,
        questionPairs: requirements.map((requirement, index) => ({
            requirementId: requirement.id,
            functionalQuestionId: questionIds[index * 2],
            dysfunctionalQuestionId: questionIds[index * 2 + 1],
        })),
    };
}

function questionIdsFromForm(form: { items?: Array<{ questionItem?: { question?: { questionId?: string } } }> }): string[] {
    return (form.items ?? []).flatMap((item) => {
        const questionId = item.questionItem?.question?.questionId;
        return questionId ? [questionId] : [];
    });
}

function kanoAnswer(value: unknown): string | null {
    return typeof value === 'string' ? ANSWER_MAP[value] ?? null : null;
}

/**
 * Google Forms 응답을 가져와 Kano 형식으로 변환합니다
 */
export async function getFormResponses(
    accessToken: string,
    formId: string,
    questionPairs: KanoFormQuestionPair[]
): Promise<{
    responses: Array<{
        respondentEmail?: string;
        answers: Array<{
            requirementId: string;
            functional: string;
            dysfunctional: string;
        }>;
        submittedAt: string;
    }>;
}> {
    // 폼 구조 가져오기 (질문 순서 확인)
    const formRes = await fetch(`${FORMS_API_BASE}/${formId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!formRes.ok) {
        throw new Error('Failed to fetch form structure');
    }

    const formData = await formRes.json();

    const availableQuestionIds = new Set(questionIdsFromForm(formData));
    if (questionPairs.some((pair) => !availableQuestionIds.has(pair.functionalQuestionId)
        || !availableQuestionIds.has(pair.dysfunctionalQuestionId))) {
        throw new GoogleFormStructureError('설문 문항이 변경되었습니다. 새 설문을 생성해 주세요.');
    }

    const rawResponses: any[] = [];
    let pageToken: string | undefined;
    do {
        const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '';
        const responsesRes = await fetch(`${FORMS_API_BASE}/${formId}/responses${query}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!responsesRes.ok) throw new Error('Failed to fetch responses');
        const page = await responsesRes.json();
        rawResponses.push(...(page.responses ?? []));
        pageToken = typeof page.nextPageToken === 'string' ? page.nextPageToken : undefined;
    } while (pageToken);

    const parsedResponses = rawResponses.map((response: any) => {
        const respondentEmail = response.respondentEmail
            ?? (response.responseId ? `anonymous-${response.responseId}@google-forms.invalid` : undefined);
        if (!respondentEmail) {
            throw new GoogleFormStructureError('응답자 식별 정보를 확인할 수 없습니다.');
        }
        const answers: Array<{
            requirementId: string;
            functional: string;
            dysfunctional: string;
        }> = [];

        for (const pair of questionPairs) {
            const functionalAnswer = kanoAnswer(response.answers?.[pair.functionalQuestionId]?.textAnswers?.answers?.[0]?.value);
            const dysfunctionalAnswer = kanoAnswer(response.answers?.[pair.dysfunctionalQuestionId]?.textAnswers?.answers?.[0]?.value);
            if (!functionalAnswer || !dysfunctionalAnswer) {
                throw new GoogleFormStructureError('설문 응답 형식을 확인할 수 없습니다.');
            }
            answers.push({
                requirementId: pair.requirementId,
                functional: functionalAnswer,
                dysfunctional: dysfunctionalAnswer,
            });
        }

        return {
            respondentEmail,
            answers,
            submittedAt: response.lastSubmittedTime || new Date().toISOString(),
        };
    });

    return { responses: parsedResponses };
}
