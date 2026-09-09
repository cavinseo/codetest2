// 라우트마다 다른 배열 키와 type 별 열 재사용이 보고서에서 뒤바뀌지 않는지 고정한다.
import { describe, expect, it } from 'vitest';
import {
    buildWorksheetData,
    pickArray,
    pickCoachName,
    splitImprovementItems,
    toKanoChartPoints,
    type WorksheetPayloads,
} from '../lib/final-report-inputs';

describe('pickArray', () => {
    it('키가 가리키는 배열을 그대로 돌려준다', () => {
        expect(pickArray({ rows: [1, 2] }, 'rows')).toEqual([1, 2]);
    });
    // 케이스마다 타입이 달라 튜플로 못박는다. 안 그러면 tsc 가 배열 union 으로 추론해
    // 콜백 인자와 맞지 않는다고 본다.
    const nonArrayCases: Array<[unknown, string]> = [
        [null, 'rows'],
        [undefined, 'rows'],
        ['문자열', 'rows'],
        [42, 'rows'],
        [{ rows: null }, 'rows'],
        [{ rows: { 0: 'a' } }, 'rows'],
        [{ entries: [1] }, 'rows'],
    ];
    it.each(nonArrayCases)('배열이 아니면 빈 배열이다 (%s)', (payload, key) => {
        expect(pickArray(payload, key)).toEqual([]);
    });
});

describe('splitImprovementItems', () => {
    const items = [
        { type: 'need', content: '니즈', improvementRate: '1.5', devProportion: '30%' },
        { type: 'feature', content: '우선순위', improvementRate: '추가기능', devProportion: '성능향상' },
        { type: 'other', content: '무시' },
        { content: 'type 없음' },
    ];

    it('type 으로 갈라 서로 다른 두 표를 만든다', () => {
        const { improvementNeeds, improvementFeatures } = splitImprovementItems(items);
        expect(improvementNeeds).toEqual([{ content: '니즈', improvementRate: '1.5', devProportion: '30%' }]);
        expect(improvementFeatures).toEqual([{ content: '우선순위', improvementRate: '추가기능', devProportion: '성능향상' }]);
    });

    it('두 배열이 서로의 행을 담지 않는다', () => {
        const { improvementNeeds, improvementFeatures } = splitImprovementItems(items);
        expect(improvementNeeds.map((row) => row.content)).not.toContain('우선순위');
        expect(improvementFeatures.map((row) => row.content)).not.toContain('니즈');
    });

    it('빠진 칸은 null 로 채운다', () => {
        const { improvementNeeds } = splitImprovementItems([{ type: 'need' }]);
        expect(improvementNeeds).toEqual([{ content: null, improvementRate: null, devProportion: null }]);
    });

    it('행이 없으면 두 배열 모두 비어 있다', () => {
        expect(splitImprovementItems([])).toEqual({ improvementNeeds: [], improvementFeatures: [] });
    });
});

describe('pickCoachName', () => {
    it('첫 번째 코치의 이름만 꺼낸다', () => {
        const payload = { mentors: [{ user: { name: '김코치', email: 'coach@example.com' } }] };
        expect(pickCoachName(payload)).toBe('김코치');
    });

    it('이메일을 절대 돌려주지 않는다', () => {
        const payload = { mentors: [{ user: { name: '', email: 'coach@example.com' } }] };
        expect(pickCoachName(payload)).toBeNull();
    });

    it('앞뒤 공백을 없앤다', () => {
        expect(pickCoachName({ mentors: [{ user: { name: '  김코치  ' } }] })).toBe('김코치');
    });

    it('이름이 빈 코치는 건너뛰고 다음 코치를 쓴다', () => {
        const payload = { mentors: [{ user: { name: '   ' } }, { user: { name: '이코치' } }] };
        expect(pickCoachName(payload)).toBe('이코치');
    });

    const noCoachCases: Array<[unknown]> = [
        [null],
        [{}],
        [{ mentors: [] }],
        [{ mentors: [{}] }],
        [{ mentors: [null] }],
        [{ mentors: [{ user: null }] }],
        [{ mentors: [{ user: { name: null } }] }],
        [{ mentors: [{ user: { name: 42 } }] }],
    ];
    it.each(noCoachCases)('배정이 없거나 403 이면 null 이다 (%s)', (payload) => {
        expect(pickCoachName(payload)).toBeNull();
    });
});

describe('toKanoChartPoints', () => {
    const kano = [{ requirementId: 'r1', better: 0.8, worse: -0.3, timkoCategory: 'A', quadrant: 'ATTRACTIVE' }];

    it('requirementId 로 요구사항 문구를 이어 붙인다', () => {
        expect(toKanoChartPoints(kano, [{ id: 'r1', requirement: '빠른 배송' }])).toEqual([
            { requirementId: 'r1', requirementName: '빠른 배송', better: 0.8, worse: -0.3, timkoCategory: 'A', quadrant: 'ATTRACTIVE' },
        ]);
    });

    const unmatchedCases: Array<[Array<{ id: string; requirement: string | null }>]> = [
        [[{ id: 'other', requirement: '다른 것' }]],
        [[{ id: 'r1', requirement: '' }]],
        [[{ id: 'r1', requirement: null }]],
        [[]],
    ];
    it.each(unmatchedCases)('짝을 못 찾으면 이름을 비운다 (%s)', (requirements) => {
        expect(toKanoChartPoints(kano, requirements)[0].requirementName).toBeUndefined();
    });

    it('분류와 사분면이 없으면 각각 null 과 빈 문자열이다', () => {
        const point = toKanoChartPoints([{ requirementId: 'r1', better: 0, worse: 0 }], [])[0];
        expect(point.timkoCategory).toBeNull();
        expect(point.quadrant).toBe('');
    });

    it('행이 없으면 빈 배열이다', () => {
        expect(toKanoChartPoints([], [{ id: 'r1', requirement: '가' }])).toEqual([]);
    });
});

describe('buildWorksheetData', () => {
    // 절마다 다른 값을 넣어, 어느 한 칸이라도 엉뚱한 출처에서 오면 드러나게 한다.
    const payloads = {
        exportData: {
            specFunctions: [{ name: '스펙' }],
            productAttributes: [{ productName: '속성' }],
            customerRequirements: [{ id: 'r1', requirement: '요구' }],
        },
        sales: { rows: [{ period: 'Y', customer: '매출처' }] },
        kanoAnalysis: { requirements: [{ requirementId: 'r1', better: 1, worse: -1 }] },
        qfdAnalysis: { requirements: [{ requirementId: 'r1', selfScore: 3 }] },
        improvements: { items: [{ type: 'need', content: '니즈' }, { type: 'feature', content: '기능' }] },
        techTree: { entries: [{ customerVoice: '고객의소리' }] },
        targetSpec: { rows: [{ specItem: '목표스펙' }] },
        techRoadmap: { rows: [{ category: '개선방향' }] },
        assets: { assets: [{ type: 'CORE', content: '핵심자산' }] },
        funding: { plans: [{ item: '생산비용' }], sources: [{ category: '정부자금' }] },
    };

    it('절마다 올바른 응답과 키에서 값을 가져온다', () => {
        const data = buildWorksheetData(payloads);
        expect(data.salesEstimates[0].customer).toBe('매출처');
        expect(data.specFunctions[0].name).toBe('스펙');
        expect(data.productAttributes[0].productName).toBe('속성');
        expect(data.requirements[0].requirement).toBe('요구');
        expect(data.kanoAggregation[0].better).toBe(1);
        expect(data.competitiveAssessment[0].selfScore).toBe(3);
        expect(data.improvementNeeds[0].content).toBe('니즈');
        expect(data.improvementFeatures[0].content).toBe('기능');
        expect(data.techTree[0].customerVoice).toBe('고객의소리');
        expect(data.targetSpecs[0].specItem).toBe('목표스펙');
        expect(data.improvementDirections[0].category).toBe('개선방향');
        expect(data.assets[0].content).toBe('핵심자산');
        expect(data.fundingPlans[0].item).toBe('생산비용');
        expect(data.fundingSources[0].category).toBe('정부자금');
    });

    it('기능기술체계는 rows 가 아니라 entries 에서 온다', () => {
        const data = buildWorksheetData({ ...payloads, techTree: { rows: [{ customerVoice: '틀린키' }] } });
        expect(data.techTree).toEqual([]);
    });

    it('자금 두 표는 한 응답의 서로 다른 키에서 온다', () => {
        const data = buildWorksheetData(payloads);
        expect(data.fundingPlans).not.toEqual(data.fundingSources);
    });

    it('응답이 모두 비어도 14개 절이 빈 배열로 채워진다', () => {
        const empty = Object.fromEntries(Object.keys(payloads).map((key) => [key, null])) as unknown as WorksheetPayloads;
        const data = buildWorksheetData(empty);
        expect(Object.values(data).every((value) => Array.isArray(value) && value.length === 0)).toBe(true);
        expect(Object.keys(data)).toHaveLength(14);
    });
});
