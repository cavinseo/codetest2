// WS-6 오프라인 응답지(자체 완결형 HTML)를 문자열로 만든다.
//
// 응답자는 인터넷 없이 파일 하나만 열어 답하고 「응답 저장」 을 눌러 답변이 박힌 HTML 을
// 다시 받는다. 관리자는 그 파일을 업로드한다. 답변은 화면 상태가 아니라 JSON 블록에
// 박히므로 kano-offline-response.ts 가 정규식 하나로 읽을 수 있다.
import { escapeHtml } from './html-escape';
import {
    KANO_SURVEY_CLOSING,
    KANO_SURVEY_GUIDE,
    KANO_SURVEY_INTRODUCTION,
    KANO_SURVEY_TITLE,
    KanoSurveyRequirement,
    kanoSurveyAnswerLabels,
    kanoSurveyFileNameStem,
    resolveKanoQuestionPair,
} from './kano-survey-document';

export const KANO_OFFLINE_PAYLOAD_ID = 'kano-offline-response';
export const KANO_OFFLINE_PAYLOAD_KIND = 'kano-offline-response';
export const KANO_OFFLINE_PAYLOAD_VERSION = 1;

export interface KanoOfflineFormInput {
    projectId: string;
    projectName: string;
    requirements: KanoSurveyRequirement[];
}

interface KanoOfflinePayload {
    kind: typeof KANO_OFFLINE_PAYLOAD_KIND;
    version: typeof KANO_OFFLINE_PAYLOAD_VERSION;
    projectId: string;
    respondentEmail: string;
    answers: Array<{
        index: number;
        positive: number | null;
        negative: number | null;
    }>;
}

export function kanoOfflineFormFileName(projectName: string | null | undefined): string {
    return `Kano_오프라인_응답지_${kanoSurveyFileNameStem(projectName)}.html`;
}

function serializePayload(payload: KanoOfflinePayload): string {
    return JSON.stringify(payload).replace(/</g, '\\u003c');
}

function renderAnswerOptions(name: string, labels: string[]): string {
    return labels.map((label, index) => {
        const score = index + 1;
        return `<label class="answer"><input type="radio" name="${name}" value="${score}"><span>${escapeHtml(label)}</span></label>`;
    }).join('');
}

export function buildKanoOfflineFormHtml(input: KanoOfflineFormInput): string {
    const answerLabels = kanoSurveyAnswerLabels();
    const initialPayload: KanoOfflinePayload = {
        kind: KANO_OFFLINE_PAYLOAD_KIND,
        version: KANO_OFFLINE_PAYLOAD_VERSION,
        projectId: input.projectId,
        respondentEmail: '',
        answers: input.requirements.map((_, index) => ({ index, positive: null, negative: null })),
    };
    const questions = input.requirements.map((requirement, index) => {
        const pair = resolveKanoQuestionPair(requirement);
        const number = index + 1;
        return `<section class="requirement" data-requirement-index="${index}">
            <fieldset>
                <legend><strong>${number}-1</strong> ${escapeHtml(pair.positive)}</legend>
                <div class="answers">${renderAnswerOptions(`q${index}-positive`, answerLabels)}</div>
            </fieldset>
            <fieldset>
                <legend><strong>${number}-2</strong> ${escapeHtml(pair.negative)}</legend>
                <div class="answers">${renderAnswerOptions(`q${index}-negative`, answerLabels)}</div>
            </fieldset>
        </section>`;
    }).join('\n');
    const script = `(function () {
    'use strict';
    var payloadElement = document.getElementById('${KANO_OFFLINE_PAYLOAD_ID}');
    var emailInput = document.getElementById('kano-respondent-email');
    var saveButton = document.getElementById('kano-save');
    var payload = JSON.parse(payloadElement.textContent || '{}');

    emailInput.value = payload.respondentEmail || '';
    payload.answers.forEach(function (answer) {
        var positive = document.querySelector('input[name="q' + answer.index + '-positive"][value="' + answer.positive + '"]');
        var negative = document.querySelector('input[name="q' + answer.index + '-negative"][value="' + answer.negative + '"]');
        if (positive) positive.checked = true;
        if (negative) negative.checked = true;
    });

    saveButton.addEventListener('click', function () {
        var answers = payload.answers.map(function (answer) {
            var positive = document.querySelector('input[name="q' + answer.index + '-positive"]:checked');
            var negative = document.querySelector('input[name="q' + answer.index + '-negative"]:checked');
            return {
                index: answer.index,
                positive: positive ? Number(positive.value) : null,
                negative: negative ? Number(negative.value) : null
            };
        });
        var incompleteCount = answers.filter(function (answer) {
            return answer.positive === null || answer.negative === null;
        }).length;
        if (incompleteCount > 0 && !confirm(incompleteCount + '개 문항이 비어 있습니다. 그래도 저장할까요?')) {
            return;
        }

        var nextPayload = {
            kind: '${KANO_OFFLINE_PAYLOAD_KIND}',
            version: ${KANO_OFFLINE_PAYLOAD_VERSION},
            projectId: payload.projectId,
            respondentEmail: emailInput.value,
            answers: answers
        };
        payloadElement.textContent = JSON.stringify(nextPayload).replace(/</g, '\\\\u003c');
        payload = nextPayload;

        var html = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement('a');
        var date = new Date();
        var pad = function (value) { return String(value).padStart(2, '0'); };
        var timestamp = String(date.getFullYear())
            + pad(date.getMonth() + 1)
            + pad(date.getDate())
            + '-'
            + pad(date.getHours())
            + pad(date.getMinutes())
            + pad(date.getSeconds());
        anchor.href = url;
        anchor.download = 'Kano_오프라인_응답_' + document.body.dataset.downloadStem + '_' + timestamp + '.html';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    });
}());`;

    return `<!DOCTYPE html>
<html lang="ko" data-project-id="${escapeHtml(input.projectId)}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(KANO_SURVEY_TITLE)} - ${escapeHtml(input.projectName)}</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, "Malgun Gothic", sans-serif; line-height: 1.55; }
        main { width: min(920px, calc(100% - 32px)); margin: 32px auto; padding: 40px; background: white; border-radius: 16px; }
        h1 { margin: 0 0 8px; font-size: 30px; }
        .project-name { margin: 0 0 24px; color: #4b5563; }
        .guide, .introduction, .closing { white-space: pre-wrap; }
        .requirement { margin: 28px 0; padding-top: 8px; border-top: 1px solid #d1d5db; }
        fieldset { margin: 18px 0; padding: 16px; border: 1px solid #d1d5db; border-radius: 10px; }
        legend { padding: 0 8px; font-weight: 500; }
        legend strong { margin-right: 8px; color: #1d4ed8; }
        .answers { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
        .answer { display: flex; gap: 6px; align-items: flex-start; padding: 8px; border: 1px solid #e5e7eb; border-radius: 8px; }
        .respondent { display: grid; gap: 6px; margin: 28px 0 16px; }
        .respondent input { width: 100%; padding: 10px 12px; border: 1px solid #9ca3af; border-radius: 8px; font: inherit; }
        button { padding: 12px 20px; border: 0; border-radius: 8px; background: #2563eb; color: white; font: inherit; font-weight: 700; cursor: pointer; }
        @media (max-width: 720px) { main { padding: 22px; } .answers { grid-template-columns: 1fr; } }
        @media print { body { background: white; } main { width: 100%; margin: 0; padding: 0; } .respondent, button { display: none; } }
    </style>
</head>
<body data-download-stem="${escapeHtml(kanoSurveyFileNameStem(input.projectName))}">
<main>
    <header>
        <h1>${escapeHtml(KANO_SURVEY_TITLE)}</h1>
        <p class="project-name">${escapeHtml(input.projectName)}</p>
        <p class="guide">${escapeHtml(KANO_SURVEY_GUIDE)}</p>
        <p class="introduction">${escapeHtml(KANO_SURVEY_INTRODUCTION)}</p>
    </header>
    <form id="kano-survey-form">
${questions}
        <label class="respondent" for="kano-respondent-email">
            <span>이메일 (선택 사항)</span>
            <input id="kano-respondent-email" type="email">
        </label>
        <button type="button" id="kano-save">응답 저장</button>
    </form>
    <p class="closing">${escapeHtml(KANO_SURVEY_CLOSING)}</p>
</main>
<script id="${KANO_OFFLINE_PAYLOAD_ID}" type="application/json">${serializePayload(initialPayload)}</script>
<script>${script}</script>
</body>
</html>`;
}
