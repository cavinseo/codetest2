// 응답자가 저장한 오프라인 HTML 에서 답변을 꺼낸다.
//
// HTML 을 파싱하지 않고 임베드된 JSON 블록만 꺼낸다 — 마크업이 어떻게 바뀌어도 계약은
// JSON 하나뿐이고, 업로드된 파일의 스크립트를 실행할 일이 없어 안전하다.
import type { KanoAnswer } from './kano-algorithm';
import {
    KANO_OFFLINE_PAYLOAD_KIND,
    KANO_OFFLINE_PAYLOAD_VERSION,
} from './kano-offline-form';
import type { ParsedKanoUploadAnswer } from './kano-upload-parser';

export type KanoOfflineParseResult =
    | { ok: true; respondentEmail: string; answers: ParsedKanoUploadAnswer[] }
    | { ok: false; error: string };

const PAYLOAD_SCRIPT_PATTERN = /<script\b(?=(?:\s+[^\s"'=<>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>]+))?)*\s+id\s*=\s*(["'])kano-offline-response\1(?:\s|>))[^>]*>([\s\S]*?)<\/script\s*>/;

function isObject(value: unknown): value is Record<string, unknown> {
    return Object(value) === value;
}

function isKanoAnswer(value: unknown): value is KanoAnswer {
    return Number.isInteger(value)
        && (value as number) >= 1
        && (value as number) <= 5;
}

export function parseKanoOfflineResponseHtml(
    html: string,
    options: { requirementCount: number; projectId: string; fallbackEmail: string }
): KanoOfflineParseResult {
    const match = html.match(PAYLOAD_SCRIPT_PATTERN);
    if (!match) {
        return {
            ok: false,
            error: '오프라인 응답지 형식이 아닙니다. 설문지에서 「응답 저장」 으로 만든 HTML 을 올려 주세요.',
        };
    }

    let payload: unknown;
    try {
        payload = JSON.parse(match[2]);
    } catch {
        return {
            ok: false,
            error: '응답 데이터를 읽을 수 없습니다. 파일이 손상되었을 수 있습니다.',
        };
    }

    if (
        !isObject(payload)
        || payload.kind !== KANO_OFFLINE_PAYLOAD_KIND
        || payload.version !== KANO_OFFLINE_PAYLOAD_VERSION
    ) {
        return { ok: false, error: '지원하지 않는 오프라인 응답지 버전입니다.' };
    }

    if (payload.projectId !== options.projectId) {
        return { ok: false, error: '다른 프로젝트의 응답지입니다.' };
    }

    const trimmedEmail = typeof payload.respondentEmail === 'string'
        ? payload.respondentEmail.trim()
        : '';
    const respondentEmail = trimmedEmail || options.fallbackEmail;
    if (!Array.isArray(payload.answers)) {
        return { ok: false, error: '응답이 하나도 없습니다.' };
    }
    const rawAnswers = payload.answers;
    const answers: ParsedKanoUploadAnswer[] = [];

    rawAnswers.forEach((answer) => {
        if (!isObject(answer)) return;
        const { index, positive, negative } = answer;
        if (!Number.isInteger(index)) return;
        const requirementIndex = index as number;
        if (requirementIndex < 0 || requirementIndex >= options.requirementCount) return;
        if (!isKanoAnswer(positive) || !isKanoAnswer(negative)) return;

        answers.push({
            respondentEmail,
            requirementIndex,
            positiveAnswer: positive,
            negativeAnswer: negative,
        });
    });

    if (answers.length === 0) {
        return { ok: false, error: '응답이 하나도 없습니다.' };
    }

    return { ok: true, respondentEmail, answers };
}
