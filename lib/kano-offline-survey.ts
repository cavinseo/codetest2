// 오프라인 HTML 설문의 내용과 마크업을 만든다.
//
// 자급자족 파일이어야 한다 — 피설문자는 인터넷 없이 파일을 더블클릭해 연다. 그래서
// Tailwind·폰트·이미지·CDN 을 쓰지 않고 CSS 와 JS 를 인라인으로 넣는다. 문구의 정본은
// lib/kano-survey-document.ts(화면·Word 와 같은 출처)이고, 이 파일은 배치와 응답 파일
// 생성 로직만 가진다. 실DB 도 브라우저도 없이 테스트한다.
import { createHash } from 'crypto';
import { escapeHtml } from './html-escape';
import { KANO_ANSWER_SCORE } from './constants';
import { kanoSurveyAnswerLabels, resolveKanoQuestionPair, sanitizeKanoFileNameStem } from './kano-survey-document';

export const KANO_OFFLINE_FORMAT = 'kano-offline-response';
export const KANO_OFFLINE_VERSION = 1;

export interface KanoOfflineRequirement {
    id: string;
    requirement: string;
    category?: string | null;
    kanoPositiveQ?: string | null;
    kanoNegativeQ?: string | null;
}

export interface KanoOfflineQuestion {
    id: string;
    no: number;
    requirement: string;
    category: string;
    positive: string;
    negative: string;
    /** 문항 해시(id 포함). 세트 해시가 어긋나도 이 답이 어떤 문구에 대한 것인지 문항 단위로 증명한다. */
    h: string;
    /** 문구만의 해시(id 제외). AI 재생성·JSON 이관으로 id 가 통째로 바뀐 뒤 문구로 재매칭할 때 쓴다. */
    t: string;
}

export interface KanoOfflineSurveyModel {
    projectId: string;
    projectName: string;
    questionSetHash: string;
    questions: KanoOfflineQuestion[];
    /** [enum 값, 라벨]. 점수 1~5 순서다. */
    answerOptions: Array<{ value: keyof typeof KANO_ANSWER_SCORE; label: string }>;
    exportedAt: string;
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export function computeKanoQuestionHash(question: { id: string; positive: string; negative: string }): string {
    return sha256(`${question.id}\n${question.positive}\n${question.negative}`).slice(0, 16);
}

export function computeKanoQuestionTextHash(question: { positive: string; negative: string }): string {
    return sha256(`${question.positive}\n${question.negative}`).slice(0, 16);
}

/** id 로 정렬한다 — 매칭이 id 기반이라 순서 변경은 답을 무효화할 이유가 아니다. */
export function computeKanoQuestionSetHash(questions: Array<{ id: string; positive: string; negative: string }>): string {
    const sorted = [...questions]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((q) => [q.id, q.positive, q.negative]);
    return sha256(JSON.stringify(sorted));
}

export function buildKanoOfflineSurveyModel(input: {
    projectId: string;
    projectName: string;
    requirements: KanoOfflineRequirement[];
    exportedAt?: Date;
}): KanoOfflineSurveyModel {
    const labels = kanoSurveyAnswerLabels();
    const answerOptions = (Object.keys(KANO_ANSWER_SCORE) as Array<keyof typeof KANO_ANSWER_SCORE>)
        .sort((a, b) => KANO_ANSWER_SCORE[a] - KANO_ANSWER_SCORE[b])
        .map((value) => ({ value, label: labels[KANO_ANSWER_SCORE[value] - 1] }));

    const questions = input.requirements.map((requirement, index) => {
        const pair = resolveKanoQuestionPair(requirement);
        const base = { id: requirement.id, positive: pair.positive, negative: pair.negative };
        return {
            ...base,
            no: index + 1,
            requirement: requirement.requirement,
            category: requirement.category ?? '',
            h: computeKanoQuestionHash(base),
            t: computeKanoQuestionTextHash(base),
        };
    });

    return {
        projectId: input.projectId,
        projectName: input.projectName,
        questionSetHash: computeKanoQuestionSetHash(questions),
        questions,
        answerOptions,
        exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    };
}

export function kanoOfflineSurveyFileName(projectName: string | null | undefined): string {
    return `Kano_설문_${sanitizeKanoFileNameStem(projectName) || '프로젝트'}.html`;
}

/** <script> 안에 JSON 을 넣을 때 </script> 나 <!-- 로 파서가 끊기지 않게 한다. */
export function jsonForScript(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

// Stryker disable next-line StringLiteral: 장식 CSS 는 동작 계약이 아니다.
const CSS = `
:root { color-scheme: light; font-family: Arial, "Noto Sans KR", sans-serif; color: #252525; background: #f3f0f7; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 16px; }
.paper { max-width: 920px; margin: 0 auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 3px 18px rgba(0,0,0,.12); }
.bar { height: 12px; background: #673ab7; }
header, .body { padding: 28px 36px; }
h1 { margin: 0 0 10px; color: #45278a; }
.project { margin-bottom: 22px; font-size: 18px; font-weight: 700; }
.tips { margin: 20px 0; padding: 14px 18px; border-left: 5px solid #673ab7; background: #f5f0ff; }
.tips ul { margin: 8px 0 0; padding-left: 22px; }
.req, .star { color: #c62828; }
.item { margin-bottom: 24px; border: 1px solid #ddd5eb; border-radius: 8px; overflow: hidden; }
.head { display: flex; align-items: center; gap: 10px; padding: 13px 16px; background: #ede7f6; }
.head h3 { margin: 0; font-size: 17px; }
.no { display: inline-grid; place-items: center; min-width: 28px; height: 28px; border-radius: 50%; color: #fff; background: #673ab7; }
.cat { padding: 3px 8px; border-radius: 12px; font-size: 12px; background: #d1c4e9; }
.q { padding: 16px; border-top: 1px solid #eee8f5; }
.q p { margin: 0 0 12px; }
.neg-bg { background: #fafafa; }
.dot { display: inline-block; width: 11px; height: 11px; margin-right: 8px; border-radius: 50%; }
.dot.pos { background: #2e7d32; }
.dot.neg { background: #d32f2f; }
.options { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
.options label { display: flex; align-items: center; justify-content: center; gap: 5px; min-height: 44px; padding: 7px; border: 1px solid #d7cce8; border-radius: 6px; text-align: center; cursor: pointer; }
.options input { accent-color: #673ab7; }
.missing { outline: 3px solid #d32f2f; outline-offset: -3px; }
.submit { margin-top: 32px; padding-top: 24px; border-top: 2px solid #673ab7; }
.email { display: grid; gap: 7px; font-weight: 700; }
.email input, textarea { width: 100%; padding: 11px; border: 1px solid #aaa; border-radius: 5px; font: inherit; }
.note { color: #595959; font-size: 13px; }
button { padding: 11px 18px; border: 0; border-radius: 5px; color: #fff; background: #673ab7; font: inherit; font-weight: 700; cursor: pointer; }
.status { min-height: 24px; font-weight: 700; }
.fallback { margin-top: 20px; padding: 16px; border: 1px dashed #673ab7; background: #faf7ff; }
.fallback button { margin-top: 8px; }
@media (max-width: 720px) { .options { grid-template-columns: 1fr; } header, .body { padding: 22px 18px; } }
@media print { .submit { display: none } body { padding: 0; background: #fff; } .paper { box-shadow: none; } }
`;

const SCRIPT = `
(function () {
    'use strict';
    var survey = JSON.parse(document.getElementById('kano-offline-survey').textContent);
    var save = document.getElementById('save');
    var status = document.getElementById('status');
    var email = document.getElementById('email');
    var fallback = document.getElementById('fallback');
    var payloadBox = document.getElementById('payload');

    function parsePriorResponse() {
        var responseText = document.getElementById('kano-offline-response').textContent.trim();
        if (!responseText) return null;
        try { return JSON.parse(responseText); } catch (_) { return null; }
    }

    function createSubmissionId() {
        if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        var bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        var hex = Array.prototype.map.call(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    }

    function selected(name) {
        return Array.prototype.find.call(document.getElementsByName(name), function (input) { return input.checked; });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var priorResponseText = document.getElementById('kano-offline-response').textContent.trim();
        if (priorResponseText) {
            payloadBox.value = priorResponseText;
            fallback.hidden = false;
            status.textContent = '이전에 저장한 답변이 실려 있습니다. 수정 후 다시 저장할 수 있습니다.';
        }
    });

    save.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.q.missing'), function (item) {
            item.classList.remove('missing');
        });

        var missing = [];
        var answers = survey.questions.map(function (question) {
            var functional = selected('f_' + question.id);
            var dysfunctional = selected('d_' + question.id);
            if (!functional) missing.push(document.getElementById('q-f-' + question.id));
            if (!dysfunctional) missing.push(document.getElementById('q-d-' + question.id));
            return {
                requirementId: question.id,
                functional: functional && functional.value,
                dysfunctional: dysfunctional && dysfunctional.value
            };
        });

        if (missing.length) {
            missing[0].classList.add('missing');
            missing[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            status.textContent = '아직 답하지 않은 질문이 ' + missing.length + '개 있습니다.';
            return;
        }

        Array.prototype.forEach.call(document.querySelectorAll('input[type="radio"]'), function (input) {
            if (input.checked) input.setAttribute('checked', '');
            else input.removeAttribute('checked');
        });
        email.setAttribute('value', email.value);

        var prior = parsePriorResponse();
        var submissionId = prior && prior.submissionId ? prior.submissionId : createSubmissionId();
        var payload = {
            format: survey.format,
            version: survey.version,
            projectId: survey.projectId,
            questionSetHash: survey.questionSetHash,
            questions: survey.questions,
            submissionId: submissionId,
            exportedAt: survey.exportedAt,
            submittedAt: new Date().toISOString(),
            respondentEmail: email.value.trim() || null,
            answers: answers
        };
        var payloadText = JSON.stringify(payload)
            .replace(/</g, '\\\\u003c')
            .replace(/\\u2028/g, '\\\\u2028')
            .replace(/\\u2029/g, '\\\\u2029');
        document.getElementById('kano-offline-response').textContent = payloadText;
        payloadBox.value = payloadText;
        fallback.hidden = false;

        var fileName = 'kano-response-' + submissionId.slice(0, 8) + '.html';
        var html = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
        var blob = new Blob([html], { type: 'text/html' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
        status.textContent = '답변이 담긴 설문 파일 ' + fileName + ' 을 저장합니다. 다운로드된 파일을 설문 담당자에게 보내 주세요. 다시 저장하면 같은 응답이 갱신됩니다.';
    });

    document.getElementById('copy').addEventListener('click', function () {
        var copyFallback = function () {
            payloadBox.select();
            document.execCommand('copy');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(payloadBox.value).catch(copyFallback);
        } else {
            copyFallback();
        }
    });
}());
`;

export function renderKanoOfflineSurveyHtml(model: KanoOfflineSurveyModel): string {
    const island = {
        format: KANO_OFFLINE_FORMAT,
        version: KANO_OFFLINE_VERSION,
        projectId: model.projectId,
        questionSetHash: model.questionSetHash,
        questions: model.questions.map((q) => ({ id: q.id, h: q.h, t: q.t })),
        exportedAt: model.exportedAt,
    };
    const options = (name: string) => model.answerOptions.map((option) =>
        `<label><input type="radio" name="${name}" value="${option.value}"><span>${escapeHtml(option.label)}</span></label>`
    ).join('');
    const blocks = model.questions.map((q) => `
<section class="item" data-qid="${escapeHtml(q.id)}">
    <div class="head"><span class="no">${q.no}</span>${q.category ? `<span class="cat">${escapeHtml(q.category)}</span>` : ''}<h3>${escapeHtml(q.requirement)}</h3></div>
    <div class="q" id="q-f-${escapeHtml(q.id)}"><p><span class="dot pos"></span>Q${q.no}-1. ${escapeHtml(q.positive)}<span class="star">*</span></p><div class="options">${options(`f_${escapeHtml(q.id)}`)}</div></div>
    <div class="q neg-bg" id="q-d-${escapeHtml(q.id)}"><p><span class="dot neg"></span>Q${q.no}-2. ${escapeHtml(q.negative)}<span class="star">*</span></p><div class="options">${options(`d_${escapeHtml(q.id)}`)}</div></div>
</section>`).join('');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kano 설문 - ${escapeHtml(model.projectName)}</title>
<style>${CSS}</style>
</head>
<body>
<main class="paper">
    <div class="bar"></div>
    <header>
        <h1>Kano 모델 기반 고객 만족도 조사</h1>
        <div class="project">프로젝트: ${escapeHtml(model.projectName)}</div>
        <p>안녕하세요! 본 설문은 제품의 각 기능이 제공되었을 때와 제공되지 않았을 때 여러분이 느끼시는 만족도를 파악하기 위한 조사입니다.</p>
        <div class="tips"><b>💡 응답 요령:</b><ul><li>각 기능에 대해 <b>긍정 질문(있는 경우)</b>과 <b>부정 질문(없는 경우)</b> 두 가지에 모두 답해 주세요.</li><li>모두 답한 뒤 맨 아래 <b>「답변 파일 저장」</b>을 누르고, 받은 파일을 설문 담당자에게 보내 주세요. <b>한 번만</b> 저장해 주세요.</li></ul></div>
        <div class="req">* 표시는 필수 항목입니다</div>
        <noscript><div class="req">이 설문은 브라우저의 JavaScript 가 켜져 있어야 답변 파일을 만들 수 있습니다.</div></noscript>
    </header>
    <div class="body">${blocks}
        <section class="submit">
            <label class="email">이메일 (선택) <input type="email" id="email" placeholder="입력하지 않으면 익명으로 집계됩니다"></label>
            <p class="note">입력한 이메일은 답변 파일에 담기며 설문 결과 관리 목적으로만 쓰입니다. 문의: 설문 담당자</p>
            <button type="button" id="save">답변 저장</button>
            <p id="status" class="status" aria-live="polite"></p>
            <div id="fallback" class="fallback" hidden>
                <p>다운로드 창이 뜨지 않았다면 아래 내용을 <b>「내용 복사」</b>로 복사해 담당자에게 메일로 보내 주세요.</p>
                <textarea id="payload" readonly rows="6"></textarea>
                <button type="button" id="copy">내용 복사</button>
            </div>
        </section>
    </div>
</main>
<script type="application/json" id="kano-offline-response"></script>
<script type="application/json" id="kano-offline-survey">${jsonForScript(island)}</script>
<script>${SCRIPT}</script>
</body>
</html>`;
}
