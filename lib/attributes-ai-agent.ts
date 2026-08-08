// WS-3 제품속성서 작성을 돕는 규칙 기반 멘토링 엔진.
// 네트워크나 외부 모델 없이 동작하므로 항상 사용할 수 있고, LLM 프로바이더 실패 시 폴백으로도 쓰인다.
import type {
    AttributeDraftInput,
    AttributeDraftIssue,
    AttributeDraftResult,
    AttributeDraftRow,
    MentorQuestion,
    MentorQuestionsInput,
    MentorQuestionsResult,
} from './ai/types';

interface QuestionSeed {
    id: string;
    field: MentorQuestion['field'];
    question: string;
    hint: string;
    examples: string[];
}

const QUESTION_SEEDS: QuestionSeed[] = [
    {
        id: 'segmentation-basis',
        field: 'marketSegment',
        question: '이 제품의 시장을 무엇을 기준으로 나누시겠습니까? (규모, 이용 목적, 지불 능력 등)',
        hint: '기준이 하나로 정리되면 세분시장이 겹치지 않게 나뉩니다.',
        examples: ['조직 규모', '운영 목적(영리/비영리)', '이용 빈도'],
    },
    {
        id: 'market-segments',
        field: 'marketSegment',
        question: '그 기준으로 나눈 세분시장을 한 줄에 하나씩 적어주세요.',
        hint: '3~5개가 적당합니다. 너무 잘게 나누면 뒤 워크시트가 복잡해집니다.',
        examples: ['소규모 비영리 동호회 (회원 10~30명)', '중대형 동호회·정기 소셜 운영'],
    },
    {
        id: 'customer-names',
        field: 'customerName',
        question: '각 세분시장에서 실제로 제품을 쓰는 사람은 누구입니까? 세분시장별로 구체적인 역할명을 적어주세요.',
        hint: '"세분시장명: 고객1, 고객2" 형태로 적으면 자동으로 짝지어집니다.',
        examples: ['소규모 비영리 동호회: 운영진 1~2인 겸업 운영자, 총무·회계 담당자'],
    },
    {
        id: 'customer-problems',
        field: 'customerNeed',
        question: '세분시장별로 그 고객이 지금 겪는 가장 큰 문제는 무엇입니까?',
        hint: '"무엇이 불편하다"보다 "무엇 때문에 시간을 얼마나 쓴다"처럼 구체적일수록 좋습니다.',
        examples: ['소규모 비영리 동호회: 엑셀·카톡으로 흩어진 명단과 회비를 혼자 관리'],
    },
    {
        id: 'expected-benefits',
        field: 'benefit',
        question: '그 문제가 해결되면 고객이 얻는 혜택은 무엇입니까?',
        hint: '고객이 체감하는 결과로 적어주세요. 기능 설명이 아니라 결과입니다.',
        examples: ['주당 운영 시간 절감', '운영진 번아웃 완화'],
    },
];

export function generateAttributeMentorQuestions(input: MentorQuestionsInput): MentorQuestionsResult {
    const rows = input.existingRows ?? [];
    const filled = {
        marketSegment: rows.some((row) => row.marketSegment?.trim()),
        customerName: rows.some((row) => row.customerName?.trim()),
        customerNeed: rows.some((row) => row.customerNeed?.trim()),
        benefit: rows.some((row) => row.benefit?.trim()),
    };

    // 이미 채워진 항목은 "보완" 질문으로 낮추고, 비어 있는 항목을 먼저 묻는다.
    const questions = QUESTION_SEEDS.map((seed) => ({
        id: seed.id,
        field: seed.field,
        question: filled[seed.field]
            ? `${seed.question} (이미 입력된 내용이 있으면 빠진 것만 보완해 주세요)`
            : seed.question,
        hint: seed.hint,
        examples: seed.examples,
    }));

    const pending = QUESTION_SEEDS.filter((seed) => !filled[seed.field]);
    const focus = pending.length === 0
        ? '모든 항목에 입력이 있습니다. 빠진 세분시장이나 고객을 보완하는 데 집중하세요.'
        : `${pending.length}개 항목이 비어 있습니다. ${describeFields(pending)}부터 채우세요.`;

    return { questions, focus };
}

export function generateAttributeDraft(input: AttributeDraftInput): AttributeDraftResult {
    const segments = splitLines(input.answers.marketSegments);
    const issues: AttributeDraftIssue[] = [];

    if (segments.length === 0) {
        return {
            rows: [],
            issues: [{ severity: 'error', message: '세분시장이 입력되지 않아 초안을 만들 수 없습니다.' }],
        };
    }

    const namesBySegment = parseBySegment(input.answers.customerNames, segments);
    const problemsBySegment = parseBySegment(input.answers.customerProblems, segments);
    const benefitsBySegment = parseBySegment(input.answers.expectedBenefits, segments);

    const rows: AttributeDraftRow[] = [];

    for (const segment of segments) {
        const names = namesBySegment.get(segment) ?? [];
        const problems = problemsBySegment.get(segment) ?? [];
        const benefits = benefitsBySegment.get(segment) ?? [];

        if (names.length === 0) {
            issues.push({ severity: 'warning', message: `"${segment}"의 고객명이 없어 빈 칸으로 두었습니다.` });
        }
        if (problems.length === 0) {
            issues.push({ severity: 'warning', message: `"${segment}"의 고객 문제가 없어 빈 칸으로 두었습니다.` });
        }

        // 고객명이 여러 명이면 각각 행을 만들고, 문제·혜택은 세분시장 단위로 같은 값을 넣는다.
        // 같은 값이 반복되면 WS-3 표에서 하나로 병합돼 보인다.
        const customerNames = names.length > 0 ? names : [''];
        const customerNeed = problems.join(', ');
        const benefit = benefits.join(', ');

        for (const customerName of customerNames) {
            rows.push({ marketSegment: segment, customerName, customerNeed, benefit });
        }
    }

    if (segments.length > 6) {
        issues.push({ severity: 'info', message: '세분시장이 6개를 넘습니다. 뒤 워크시트가 복잡해질 수 있습니다.' });
    }

    return { rows, issues };
}

function describeFields(seeds: QuestionSeed[]): string {
    const labels: Record<MentorQuestion['field'], string> = {
        marketSegment: '세분시장',
        customerName: '고객명',
        customerNeed: '고객 니즈',
        benefit: '제공혜택',
    };
    return unique(seeds.map((seed) => labels[seed.field])).join('·');
}

// "세분시장명: 값1, 값2" 형태면 해당 세분시장에 붙이고,
// 접두사가 없으면 모든 세분시장에 공통으로 적용한다.
function parseBySegment(raw: string | undefined, segments: string[]): Map<string, string[]> {
    const result = new Map<string, string[]>();
    const shared: string[] = [];

    for (const line of splitLines(raw)) {
        const separatorIndex = findSegmentSeparator(line);
        if (separatorIndex === -1) {
            shared.push(...splitValues(line));
            continue;
        }

        const label = line.slice(0, separatorIndex).trim();
        const values = splitValues(line.slice(separatorIndex + 1));
        const matched = matchSegment(label, segments);

        if (!matched) {
            shared.push(...splitValues(line));
            continue;
        }

        result.set(matched, unique([...(result.get(matched) ?? []), ...values]));
    }

    for (const segment of segments) {
        const existing = result.get(segment) ?? [];
        result.set(segment, unique([...existing, ...shared]));
    }

    return result;
}

function findSegmentSeparator(line: string): number {
    const colon = line.indexOf(':');
    const fullWidthColon = line.indexOf('：');
    if (colon === -1) return fullWidthColon;
    if (fullWidthColon === -1) return colon;
    return Math.min(colon, fullWidthColon);
}

function matchSegment(label: string, segments: string[]): string | null {
    const key = normalize(label);
    if (!key) return null;

    const exact = segments.find((segment) => normalize(segment) === key);
    if (exact) return exact;

    // 사용자가 "소규모 동호회"처럼 줄여 적는 경우를 허용한다.
    return segments.find((segment) => {
        const segmentKey = normalize(segment);
        return segmentKey.includes(key) || key.includes(segmentKey);
    }) ?? null;
}

function splitLines(raw: string | undefined): string[] {
    return unique((raw ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
}

function splitValues(raw: string): string[] {
    return unique(raw.split(/[,;/·]+/).map((value) => value.trim()).filter(Boolean));
}

function unique(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const key = normalize(value);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(value);
    }
    return result;
}

function normalize(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
