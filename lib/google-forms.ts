// Google Forms API 래퍼
// Kano 설문지를 Google Forms로 자동 생성하고 응답을 가져옵니다

const FORMS_API_BASE = 'https://forms.googleapis.com/v1/forms';

interface Requirement {
    id: string;
    category: string;
    subcategory?: string;
    requirement: string;
    order: number;
}

const KANO_CHOICES = [
    '😍 매우 만족 (I like it)',
    '😊 당연함 (I expect it)',
    '😐 상관없음 (I am neutral)',
    '😕 견딜만함 (I can tolerate it)',
    '😠 매우 불만 (I dislike it)',
];

const ANSWER_MAP: Record<string, string> = {
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
): Promise<{ formId: string; formUrl: string; editUrl: string }> {
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
                    '각 기능에 대해 "긍정 질문"(기능이 있을 때)과 "부정 질문"(기능이 없을 때) 두 가지에 답변해 주세요.',
            },
            updateMask: 'description',
        },
    });

    // 각 요구사항에 대해 긍정/부정 질문 쌍 생성
    let itemIndex = 0;
    for (const req of requirements) {
        const categoryLabel = req.category
            ? `[${req.category}${req.subcategory ? ` > ${req.subcategory}` : ''}] `
            : '';

        // 긍정 질문
        requests.push({
            createItem: {
                item: {
                    title: `👍 [긍정] ${categoryLabel}${req.requirement}`,
                    description: `만약 "${req.requirement}" 기능이 있다면 어떻게 느끼시겠습니까?`,
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
                    title: `👎 [부정] ${categoryLabel}${req.requirement}`,
                    description: `만약 "${req.requirement}" 기능이 없다면 어떻게 느끼시겠습니까?`,
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

    return {
        formId,
        formUrl: form.responderUri || `https://docs.google.com/forms/d/${formId}/viewform`,
        editUrl: `https://docs.google.com/forms/d/${formId}/edit`,
    };
}

/**
 * Google Forms 응답을 가져와 Kano 형식으로 변환합니다
 */
export async function getFormResponses(
    accessToken: string,
    formId: string
): Promise<{
    responses: Array<{
        respondentEmail?: string;
        answers: Array<{
            requirementIndex: number;
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

    // 응답 가져오기
    const responsesRes = await fetch(`${FORMS_API_BASE}/${formId}/responses`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!responsesRes.ok) {
        throw new Error('Failed to fetch responses');
    }

    const responsesData = await responsesRes.json();
    const formData = await formRes.json();

    // 질문 ID 매핑 (짝수 인덱스 = 긍정, 홀수 인덱스 = 부정)
    const questionIds: string[] = [];
    if (formData.items) {
        for (const item of formData.items) {
            if (item.questionItem?.question?.questionId) {
                questionIds.push(item.questionItem.question.questionId);
            }
        }
    }

    const parsedResponses = (responsesData.responses || []).map((response: any) => {
        const answers: Array<{
            requirementIndex: number;
            functional: string;
            dysfunctional: string;
        }> = [];

        // 질문을 쌍으로 그룹화 (긍정/부정)
        for (let i = 0; i < questionIds.length; i += 2) {
            const functionalQId = questionIds[i];
            const dysfunctionalQId = questionIds[i + 1];

            const functionalAnswer = response.answers?.[functionalQId]?.textAnswers?.answers?.[0]?.value || '';
            const dysfunctionalAnswer = response.answers?.[dysfunctionalQId]?.textAnswers?.answers?.[0]?.value || '';

            answers.push({
                requirementIndex: Math.floor(i / 2),
                functional: ANSWER_MAP[functionalAnswer] || 'NEUTRAL',
                dysfunctional: ANSWER_MAP[dysfunctionalAnswer] || 'NEUTRAL',
            });
        }

        return {
            respondentEmail: response.respondentEmail,
            answers,
            submittedAt: response.lastSubmittedTime || new Date().toISOString(),
        };
    });

    return { responses: parsedResponses };
}
