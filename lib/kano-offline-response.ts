// 피설문자가 저장한 답변 파일(.kano.json)을 읽어 검증하고 현재 질문 세트와 대조한다.
//
// zod 를 쓰지 않는다 — 이 모듈은 뮤테이션 100% 대상이라 판정 하나하나가 테스트로 고정돼야
// 하고, node_modules 없는 원격 세션에서도 실행 검증할 수 있어야 한다.
// 오류 사유는 코드로만 돌려주고 파일 내용은 에코하지 않는다.
import { KANO_ANSWER_SCORE, type KanoAnswer } from './constants';
import { KANO_OFFLINE_FORMAT, KANO_OFFLINE_VERSION } from './kano-offline-survey';

export const KANO_OFFLINE_MAX_ANSWERS = 300;

// 사유는 16종이고 전부 실제로 반환된다. submittedAt 은 거절 사유가 아니다 — 시계가 틀린
// PC 에서 저장한 파일을 버리면 응답이 사라지므로 now 로 대체한다.
export type KanoOfflineParseFailure =
    | 'empty' | 'survey-file' | 'html-no-island' | 'not-json' | 'format' | 'version'
    | 'project-id' | 'question-set-hash' | 'questions' | 'submission-id'
    | 'email' | 'answers-empty' | 'answers-too-many'
    | 'answer-shape' | 'answer-value' | 'answer-duplicate';

export interface KanoOfflineResponseFile {
    projectId: string;
    questionSetHash: string;
    questions: Array<{ id: string; h: string; t: string }>;
    submissionId: string;
    submittedAt: Date;
    /** 소문자·trim. 없으면 null. */
    respondentEmail: string | null;
    answers: Array<{ requirementId: string; functional: KanoAnswer; dysfunctional: KanoAnswer }>;
}

export type KanoOfflineParseResult =
    | { ok: true; file: KanoOfflineResponseFile }
    | { ok: false; reason: KanoOfflineParseFailure };

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_16 = /^[0-9a-f]{16}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// 최소한의 이메일 모양. 형식이 다르면 파일을 거절한다 — 조용히 합성 이메일로 바꾸면 응답자가 사라진다.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ANSWER_VALUES = new Set(Object.keys(KANO_ANSWER_SCORE));

const RESPONSE_ISLAND = /<script type="application\/json" id="kano-offline-response">([\s\S]*?)<\/script>/g;

/**
 * 답변 HTML 이면 응답 섬의 JSON 을, 아니면 텍스트 그대로를 돌려준다.
 * 섬이 여러 개면 마지막 비어 있지 않은 것을 쓴다 — 재저장된 파일의 최신 답이 뒤에 온다.
 */
export function extractKanoOfflinePayloadText(rawText: string): { ok: true; text: string } | { ok: false; reason: 'empty' | 'survey-file' | 'html-no-island' } {
    // 메모장이 붙이는 BOM 은 JSON 이 아니다.
    const text = rawText.replace(/^\uFEFF/, '').trim();
    if (!text) return { ok: false, reason: 'empty' };
    if (!text.startsWith('<')) return { ok: true, text };
    const islands = [...text.matchAll(RESPONSE_ISLAND)].map((m) => m[1].trim());
    if (islands.length === 0) return { ok: false, reason: 'html-no-island' };
    const filled = islands.filter((island) => island.length > 0);
    if (filled.length === 0) return { ok: false, reason: 'survey-file' };
    return { ok: true, text: filled[filled.length - 1] };
}

export function parseKanoOfflineResponseText(rawText: string, now: Date = new Date()): KanoOfflineParseResult {
    const extracted = extractKanoOfflinePayloadText(rawText);
    if (!extracted.ok) return { ok: false, reason: extracted.reason };
    const text = extracted.text;

    let data: unknown;
    try {
        data = JSON.parse(text);
    }
    // Stryker disable next-line BlockStatement: 빈 catch도 undefined가 다음 isRecord 검사에서 같은 not-json으로 반환되므로 등가다.
    catch {
        return { ok: false, reason: 'not-json' };
    }
    if (!isRecord(data)) return { ok: false, reason: 'not-json' };
    if (data.format !== KANO_OFFLINE_FORMAT) return { ok: false, reason: 'format' };
    if (data.version !== KANO_OFFLINE_VERSION) return { ok: false, reason: 'version' };
    if (!isNonEmptyString(data.projectId)) return { ok: false, reason: 'project-id' };
    if (typeof data.questionSetHash !== 'string' || !HEX_64.test(data.questionSetHash)) return { ok: false, reason: 'question-set-hash' };
    if (!Array.isArray(data.questions) || !data.questions.every((q) => isRecord(q) && isNonEmptyString(q.id)
        && typeof q.h === 'string' && HEX_16.test(q.h) && typeof q.t === 'string' && HEX_16.test(q.t))) {
        return { ok: false, reason: 'questions' };
    }
    if (typeof data.submissionId !== 'string' || !UUID.test(data.submissionId)) return { ok: false, reason: 'submission-id' };

    // 시계가 틀린 PC 에서 저장한 미래 시각은 now 로 대체한다(5분 허용).
    const submittedAtRaw = typeof data.submittedAt === 'string' ? new Date(data.submittedAt) : new Date(NaN);
    const submittedAt = Number.isNaN(submittedAtRaw.getTime()) || submittedAtRaw.getTime() > now.getTime() + 5 * 60 * 1000
        ? now
        : submittedAtRaw;

    let respondentEmail: string | null = null;
    if (data.respondentEmail !== null && data.respondentEmail !== undefined && data.respondentEmail !== '') {
        if (typeof data.respondentEmail !== 'string') return { ok: false, reason: 'email' };
        const normalized = data.respondentEmail.trim().toLowerCase();
        if (!EMAIL.test(normalized)) return { ok: false, reason: 'email' };
        respondentEmail = normalized;
    }

    if (!Array.isArray(data.answers) || data.answers.length === 0) return { ok: false, reason: 'answers-empty' };
    if (data.answers.length > KANO_OFFLINE_MAX_ANSWERS) return { ok: false, reason: 'answers-too-many' };
    const seen = new Set<string>();
    const answers: KanoOfflineResponseFile['answers'] = [];
    for (const answer of data.answers) {
        if (!isRecord(answer) || !isNonEmptyString(answer.requirementId)) return { ok: false, reason: 'answer-shape' };
        // Stryker disable next-line ConditionalExpression,LogicalOperator: ANSWER_VALUES Set.has가 비문자열을 엄격 비교로 거절해 typeof 조건을 바꿔도 결과가 같으므로 등가다.
        if (typeof answer.functional !== 'string' || typeof answer.dysfunctional !== 'string'
            || !ANSWER_VALUES.has(answer.functional) || !ANSWER_VALUES.has(answer.dysfunctional)) {
            return { ok: false, reason: 'answer-value' };
        }
        if (seen.has(answer.requirementId)) return { ok: false, reason: 'answer-duplicate' };
        seen.add(answer.requirementId);
        answers.push({ requirementId: answer.requirementId, functional: answer.functional as KanoAnswer, dysfunctional: answer.dysfunctional as KanoAnswer });
    }

    return {
        ok: true,
        file: {
            projectId: data.projectId,
            questionSetHash: data.questionSetHash,
            questions: data.questions.map((q) => {
                const question = q as { id: string; h: string; t: string };
                return { id: question.id, h: question.h, t: question.t };
            }),
            submissionId: data.submissionId.toLowerCase(),
            submittedAt,
            respondentEmail,
            answers,
        },
    };
}

export interface KanoCurrentQuestionSet {
    projectId: string;
    questionSetHash: string;
    /** requirementId → 문항 해시 h */
    questionHashById: Map<string, string>;
    /** 문구 해시 t → 그 문구를 가진 현재 requirementId 목록. 재매칭은 정확히 하나일 때만 한다. */
    requirementIdsByTextHash: Map<string, string[]>;
}

export type KanoOfflineReconcile =
    | { status: 'wrong-project' }
    | { status: 'unknown-requirement'; unknownIds: string[] }
    | { status: 'ok'; answers: KanoOfflineResponseFile['answers']; dropped: 0; rematched: 0 }
    | { status: 'question-set-changed'; matched: KanoOfflineResponseFile['answers']; dropped: number; rematched: number };

/**
 * 현재 질문 세트와 대조한다. 세트 해시가 같으면 전부 수입 가능. 다르면 (1) 문항 해시 h 가 현재와
 * 같은 답은 그대로, (2) id 는 없어졌지만 문구 해시 t 가 현재 문항 정확히 하나와 같은 답은 그
 * 문항으로 재매칭(AI 재생성·JSON 이관으로 id 가 통째로 바뀐 경우), (3) 나머지는 버린다 —
 * 문구가 바뀐 문항의 답은 어떤 경로로도 저장되지 않는다.
 * requirementId 소속 검증은 해시가 같아도 항상 한다(해시 충돌·조작 방어의 최종선).
 */
export function reconcileKanoOfflineResponse(file: KanoOfflineResponseFile, current: KanoCurrentQuestionSet): KanoOfflineReconcile {
    if (file.projectId !== current.projectId) return { status: 'wrong-project' };
    const unknownIds = file.answers.map((a) => a.requirementId).filter((id) => !current.questionHashById.has(id));
    if (file.questionSetHash === current.questionSetHash) {
        if (unknownIds.length > 0) return { status: 'unknown-requirement', unknownIds };
        return { status: 'ok', answers: file.answers, dropped: 0, rematched: 0 };
    }
    const fileQuestionById = new Map(file.questions.map((q) => [q.id, q]));
    const matched: KanoOfflineResponseFile['answers'] = [];
    const taken = new Set<string>();
    const leftovers: Array<{ answer: KanoOfflineResponseFile['answers'][number]; fileQuestion: { id: string; h: string; t: string } }> = [];
    let rematched = 0;

    // 1차: id 가 현재에도 있는 답을 먼저 확정한다. 재매칭을 같은 반복에서 처리하면 파일 순서에
    // 따라 재매칭이 남아 있는 문항의 자리를 가로채고, 그 문항의 제 답이 뒤이어 또 들어와
    // 같은 requirementId 가 두 번 실린다(문구가 겹치던 문항 하나가 삭제되면 재현된다).
    for (const answer of file.answers) {
        const fileQuestion = fileQuestionById.get(answer.requirementId);
        if (!fileQuestion) continue;
        const currentHash = current.questionHashById.get(answer.requirementId);
        if (currentHash === undefined) {
            leftovers.push({ answer, fileQuestion });
            continue;
        }
        if (currentHash === fileQuestion.h) {
            matched.push(answer);
            taken.add(answer.requirementId);
        }
        // id 는 있는데 문구가 바뀜 — 버린다.
    }

    // 2차: id 가 사라진 답만 문구 해시로 재매칭한다. 남은 자리가 정확히 하나일 때만이다.
    for (const { answer, fileQuestion } of leftovers) {
        const candidates = (current.requirementIdsByTextHash.get(fileQuestion.t) ?? []).filter((id) => !taken.has(id));
        if (candidates.length === 1) {
            matched.push({ ...answer, requirementId: candidates[0] });
            taken.add(candidates[0]);
            rematched += 1;
        }
    }
    return { status: 'question-set-changed', matched, dropped: file.answers.length - matched.length, rematched };
}

export function resolveKanoOfflineRespondentEmail(file: Pick<KanoOfflineResponseFile, 'respondentEmail' | 'submissionId'>): string {
    return file.respondentEmail ?? `offline-${file.submissionId.replace(/-/g, '').slice(0, 12)}@import.local`;
}

export function kanoOfflineInvitationToken(file: Pick<KanoOfflineResponseFile, 'submissionId'>): string {
    return `offline_${file.submissionId}`;
}

/** 한 배치 안에서 같은 이메일(또는 submissionId)이 둘 이상이면 그 파일들의 인덱스를 돌려준다. 서버가 승자를 고르지 않는다. */
export function findDuplicateKanoOfflineFiles(files: Array<Pick<KanoOfflineResponseFile, 'respondentEmail' | 'submissionId'>>): number[] {
    const byKey = new Map<string, number[]>();
    files.forEach((file, index) => {
        for (const key of [`e:${resolveKanoOfflineRespondentEmail(file)}`, `s:${file.submissionId}`]) {
            byKey.set(key, [...(byKey.get(key) ?? []), index]);
        }
    });
    const duplicates = new Set<number>();
    for (const indexes of byKey.values()) {
        if (indexes.length > 1) indexes.forEach((i) => duplicates.add(i));
    }
    return [...duplicates].sort((a, b) => a - b);
}

/** 409 안내용 변경 요약. */
export function describeKanoQuestionSetChange(
    fileQuestions: Array<{ id: string; h: string }>,
    current: Map<string, string>
): { added: number; removed: number; changed: number } {
    const fileById = new Map(fileQuestions.map((q) => [q.id, q.h]));
    let removed = 0;
    let changed = 0;
    for (const [id, h] of fileById) {
        const now = current.get(id);
        if (now === undefined) removed += 1;
        else if (now !== h) changed += 1;
    }
    let added = 0;
    for (const id of current.keys()) if (!fileById.has(id)) added += 1;
    return { added, removed, changed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}
