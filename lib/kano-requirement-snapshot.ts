// 순서 변경 전 설문 파일의 답변을 원래 요구사항 ID에 연결한다.
import * as XLSX from 'xlsx';
import { escapeHtml } from './html-escape';
import { resolveKanoQuestionPair, type KanoSurveyRequirement } from './kano-survey-document';
import { getKanoTopic } from './utils/korean-utils';

export const KANO_ORDER_SHEET = 'Kano문항연결';
const OFFLINE_ORDER_ID = 'kano-requirement-order';
type Requirement = KanoSurveyRequirement & { id: string };

export class KanoQuestionOrderError extends Error {
    constructor() {
        super('설문 문항을 현재 고객요구사항에 연결할 수 없습니다. 항목 ID 또는 원래 질문 목록이 포함된 응답 파일을 사용하세요. 삭제되거나 중복된 항목도 확인해 주세요.');
    }
}

export function kanoRequirementSnapshotRows(requirements: { id: string }[]): (string | number)[][] {
    return [['No', 'requirementId'], ...requirements.map((row, index) => [index + 1, row.id])];
}

function validateIds(ids: unknown[], requirements: Requirement[]): string[] {
    const known = new Set(requirements.map(row => row.id));
    if (!ids.length || ids.some(id => typeof id !== 'string' || !known.has(id)) || new Set(ids).size !== ids.length) {
        throw new KanoQuestionOrderError();
    }
    return ids as string[];
}

function uniqueId(requirements: Requirement[], matches: (row: Requirement) => boolean): string {
    const candidates = requirements.filter(matches);
    if (candidates.length !== 1) throw new KanoQuestionOrderError();
    return candidates[0].id;
}

export function embedKanoRequirementSnapshot(html: string, requirements: { id: string }[]): string {
    const json = JSON.stringify(requirements.map(row => row.id)).replace(/</g, '\\u003c');
    return html.replace('</body>', `<script type="application/json" id="${OFFLINE_ORDER_ID}">${json}</script>\n</body>`);
}

// 아래 두 탐색은 정규식 하나로 쓰면 짧지만 입력 길이의 제곱으로 느려진다.
// `<script ` 나 닫히지 않은 `<legend>` 를 수만 번 반복한 2MB 파일 하나가 서버를
// 몇 분씩 붙잡았다(요청당 100개까지 받는다). 한 번 지나간 구간을 다시 훑지
// 않도록 위치를 앞으로만 옮기며 찾는다.

/** id 가 kano-requirement-order 인 첫 script 태그의 본문. 없으면 null. */
function findSnapshotScriptBody(html: string): string | null {
    const idPattern = new RegExp(`\\bid=["']${OFFLINE_ORDER_ID}["']`);
    let cursor = 0;
    for (;;) {
        const open = html.indexOf('<script', cursor);
        if (open < 0) return null;
        const tagEnd = html.indexOf('>', open);
        if (tagEnd < 0) return null;
        cursor = tagEnd + 1;
        // `<scripts` 같은 다른 이름의 태그는 건너뛴다.
        if (/\w/.test(html.charAt(open + 7))) continue;
        if (!idPattern.test(html.slice(open + 7, tagEnd))) continue;
        const close = /<\/script\s*>/g;
        close.lastIndex = cursor;
        const closing = close.exec(html);
        return closing ? html.slice(cursor, closing.index) : null;
    }
}

/** 이전 양식의 `<legend><strong>번호</strong> 질문</legend>` 에서 질문 문구만 뽑는다. */
function findLegendQuestions(html: string): string[] {
    const opener = /<legend><strong>[^<]*<\/strong>/g;
    const legends: string[] = [];
    for (;;) {
        const opened = opener.exec(html);
        if (!opened) return legends;
        const bodyStart = opener.lastIndex;
        const close = html.indexOf('</legend>', bodyStart);
        // 닫는 태그가 더 없으면 뒤쪽 여는 태그도 짝을 찾지 못한다.
        if (close < 0) return legends;
        legends.push(html.slice(bodyStart, close).trim());
        opener.lastIndex = close + '</legend>'.length;
    }
}

export function readKanoOfflineRequirementIds(html: string, requirements: Requirement[]): string[] {
    const snapshot = findSnapshotScriptBody(html);
    if (snapshot !== null) {
        let ids: unknown;
        try { ids = JSON.parse(snapshot); } catch { throw new KanoQuestionOrderError(); }
        if (!Array.isArray(ids)) throw new KanoQuestionOrderError();
        return validateIds(ids, requirements);
    }
    // 이전 HTML에도 질문 문구가 있으므로 순번을 추측하지 않고 질문쌍으로 식별한다.
    const legends = findLegendQuestions(html);
    if (legends.length % 2) throw new KanoQuestionOrderError();
    const ids: string[] = [];
    for (let index = 0; index < legends.length; index += 2) {
        ids.push(uniqueId(requirements, row => {
            const pair = resolveKanoQuestionPair(row);
            return escapeHtml(pair.positive) === legends[index] && escapeHtml(pair.negative) === legends[index + 1];
        }));
    }
    return validateIds(ids, requirements);
}

function headerRequirementId(header: string, requirements: Requirement[]): string {
    const embedded = header.match(/\{id:([^}]+)\}/);
    if (embedded) return embedded[1];
    const text = header.replace(/^[👍👎\s]*/, '').replace(/^\[(?:긍정|부정)\]\s*/, '')
        .replace(/^\[\d+-[12]\]\s*/, '').replace(/^\[[^\]]+\]\s*/, '').trim();
    return uniqueId(requirements, row => {
        const pair = resolveKanoQuestionPair(row);
        return [row.requirement, getKanoTopic(row.requirement), pair.positive, pair.negative].includes(text);
    });
}

function numberedRows(rows: unknown[][]): unknown[][] {
    const numbered = rows.slice(1).filter(row => row.some(value => String(value).trim()))
        .sort((a, b) => Number(a[0]) - Number(b[0]));
    if (numbered.some((row, index) => Number(row[0]) !== index + 1)) throw new KanoQuestionOrderError();
    return numbered;
}

export function readKanoExcelRequirementIds(workbook: XLSX.WorkBook, sheet: XLSX.WorkSheet, requirements: Requirement[]): string[] {
    const snapshot = workbook.Sheets[KANO_ORDER_SHEET];
    if (snapshot) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(snapshot, { header: 1, defval: '' });
        return validateIds(numberedRows(rows).map(row => row[1]), requirements);
    }
    const questionSheet = workbook.Sheets['Kano질문목록'];
    if (questionSheet) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(questionSheet, { header: 1, defval: '' });
        const ids = numberedRows(rows).map(row => uniqueId(requirements, req => req.requirement.trim() === String(row[1]).trim()));
        return validateIds(ids, requirements);
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const headers = Object.keys(rows[0] ?? {}).filter(header => !/timestamp|타임스탬프|email|이메일|응답자|respondent/i.test(header));
    const negatives = headers.filter(header => /부정|negative|dysfunctional|\[\d+-2\]/i.test(header));
    const positives = headers.filter(header => !negatives.includes(header) && /긍정|positive|functional|\[\d+-1\]/i.test(header));
    if (!positives.length || positives.length !== negatives.length) throw new KanoQuestionOrderError();
    const ids = positives.map((header, index) => {
        const id = headerRequirementId(header, requirements);
        if (id !== headerRequirementId(negatives[index], requirements)) throw new KanoQuestionOrderError();
        return id;
    });
    return validateIds(ids, requirements);
}
