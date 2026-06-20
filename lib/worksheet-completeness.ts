export type WorksheetStatus = 'EMPTY' | 'IN_PROGRESS' | 'COMPLETE';
export type ServiceReadinessStatus = 'IN_PROGRESS' | 'REPORT_READY';

export interface WorksheetCompletenessCounts {
    salesEstimates: number;
    specFunctions: number;
    productAttributes: number;
    attributeFitnesses: number;
    requirements: number;
    kanoResponses: number;
    technicalCharacteristics: number;
    qfdRelationships: number;
    techTreeEntries: number;
    improvementItems: number;
    targetSpecs: number;
    techRoadmaps: number;
    devPlans: number;
    assetItems: number;
    fundingPlans: number;
    fundingSources: number;
}

export interface WorksheetCompletenessInput {
    project: {
        name?: string | null;
        description?: string | null;
        detailedDescription?: string | null;
    };
    counts: WorksheetCompletenessCounts;
    hasFitnessMatrix: boolean;
}

export interface WorksheetCompletenessItem {
    key: string;
    title: string;
    required: boolean;
    status: WorksheetStatus;
    completedUnits: number;
    expectedUnits: number;
    percent: number;
    worksheetKey: string;
    nextStep: string;
}

export interface WorksheetCompletenessResult {
    status: ServiceReadinessStatus;
    percent: number;
    requiredComplete: boolean;
    completedRequired: number;
    totalRequired: number;
    items: WorksheetCompletenessItem[];
    blockers: WorksheetCompletenessItem[];
    nextAction: WorksheetCompletenessItem | null;
}

interface WorksheetRule {
    key: string;
    title: string;
    required: boolean;
    worksheetKey: string;
    expectedUnits: number;
    getCompletedUnits(input: WorksheetCompletenessInput): number;
    nextStep: string;
}

function textPresent(value?: string | null): boolean {
    return Boolean(value?.trim());
}

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
}

const WORKSHEET_RULES: WorksheetRule[] = [
    {
        key: 'overview',
        title: '제품개요',
        required: true,
        worksheetKey: 'overview',
        expectedUnits: 3,
        getCompletedUnits: ({ project }) => [
            textPresent(project.name),
            textPresent(project.description),
            textPresent(project.detailedDescription),
        ].filter(Boolean).length,
        nextStep: '제품명, 간단 설명, 상세 제품개요를 입력하세요.',
    },
    {
        key: 'sales',
        title: '매출추정',
        required: true,
        worksheetKey: 'sales',
        expectedUnits: 1,
        getCompletedUnits: ({ counts }) => counts.salesEstimates,
        nextStep: '매출처와 예상 매출을 1개 이상 입력하세요.',
    },
    {
        key: 'spec',
        title: 'AS-IS 스펙',
        required: true,
        worksheetKey: 'spec',
        expectedUnits: 1,
        getCompletedUnits: ({ counts }) => counts.specFunctions,
        nextStep: '현재 제품 또는 서비스의 기능 스펙을 입력하세요.',
    },
    {
        key: 'attributes',
        title: '제품속성',
        required: true,
        worksheetKey: 'attributes',
        expectedUnits: 1,
        getCompletedUnits: ({ counts }) => counts.productAttributes,
        nextStep: '고객 니즈와 연결되는 제품속성을 입력하세요.',
    },
    {
        key: 'fitness',
        title: '제품속성 적합도',
        required: true,
        worksheetKey: 'fitness',
        expectedUnits: 1,
        getCompletedUnits: ({ counts, hasFitnessMatrix }) => Number(hasFitnessMatrix || counts.attributeFitnesses > 0),
        nextStep: '제품속성의 중요도와 현재/목표 수준을 평가하세요.',
    },
    {
        key: 'requirements',
        title: '고객요구사항',
        required: true,
        worksheetKey: 'requirements',
        expectedUnits: 1,
        getCompletedUnits: ({ counts }) => counts.requirements,
        nextStep: '고객 요구사항을 1개 이상 정리하세요.',
    },
    {
        key: 'kano',
        title: 'Kano 분석',
        required: true,
        worksheetKey: 'kano',
        expectedUnits: 1,
        getCompletedUnits: ({ counts }) => counts.kanoResponses,
        nextStep: 'Kano 설문 응답을 수집하거나 업로드하세요.',
    },
    {
        key: 'qfd',
        title: 'QFD',
        required: true,
        worksheetKey: 'qfd',
        expectedUnits: 3,
        getCompletedUnits: ({ counts }) => [
            counts.technicalCharacteristics > 0,
            counts.qfdRelationships > 0,
            counts.requirements > 0,
        ].filter(Boolean).length,
        nextStep: '기술특성을 추가하고 고객요구사항과의 관계를 입력하세요.',
    },
    {
        key: 'improvements',
        title: '개선포인트',
        required: true,
        worksheetKey: 'improvements',
        expectedUnits: 1,
        getCompletedUnits: ({ counts }) => counts.improvementItems,
        nextStep: 'QFD와 Kano 결과를 기반으로 개선포인트를 도출하세요.',
    },
    {
        key: 'targetSpec',
        title: '최종 목표스펙',
        required: true,
        worksheetKey: 'target-spec',
        expectedUnits: 1,
        getCompletedUnits: ({ counts }) => counts.targetSpecs,
        nextStep: '개선포인트를 목표 스펙으로 구체화하세요.',
    },
    {
        key: 'techTree',
        title: '기능기술체계',
        required: false,
        worksheetKey: 'tech-tree',
        expectedUnits: 1,
        getCompletedUnits: ({ counts }) => counts.techTreeEntries,
        nextStep: '고객 목소리와 기능/기술특성을 연결하세요.',
    },
    {
        key: 'roadmap',
        title: '향후 목표고객',
        required: false,
        worksheetKey: 'tech-roadmap',
        expectedUnits: 1,
        getCompletedUnits: ({ counts }) => counts.techRoadmaps,
        nextStep: '향후 목표고객과 기술 로드맵을 정리하세요.',
    },
    {
        key: 'devPlan',
        title: '개발계획',
        required: false,
        worksheetKey: 'dev-plan',
        expectedUnits: 1,
        getCompletedUnits: ({ counts }) => counts.devPlans,
        nextStep: '개발 단계, 담당자, 일정을 입력하세요.',
    },
    {
        key: 'assets',
        title: '핵심/보완자산',
        required: false,
        worksheetKey: 'assets',
        expectedUnits: 1,
        getCompletedUnits: ({ counts }) => counts.assetItems,
        nextStep: '핵심자산과 보완자산을 정리하세요.',
    },
    {
        key: 'funding',
        title: '자금계획',
        required: false,
        worksheetKey: 'funding-source',
        expectedUnits: 2,
        getCompletedUnits: ({ counts }) => [
            counts.fundingPlans > 0,
            counts.fundingSources > 0,
        ].filter(Boolean).length,
        nextStep: '자금 소요와 조달 계획을 입력하세요.',
    },
];

function evaluateRule(rule: WorksheetRule, input: WorksheetCompletenessInput): WorksheetCompletenessItem {
    const completedUnits = Math.min(rule.getCompletedUnits(input), rule.expectedUnits);
    const percent = clampPercent((completedUnits / rule.expectedUnits) * 100);
    const status: WorksheetStatus = completedUnits === 0
        ? 'EMPTY'
        : completedUnits >= rule.expectedUnits
            ? 'COMPLETE'
            : 'IN_PROGRESS';

    return {
        key: rule.key,
        title: rule.title,
        required: rule.required,
        status,
        completedUnits,
        expectedUnits: rule.expectedUnits,
        percent,
        worksheetKey: rule.worksheetKey,
        nextStep: rule.nextStep,
    };
}

export function calculateWorksheetCompleteness(input: WorksheetCompletenessInput): WorksheetCompletenessResult {
    const items = WORKSHEET_RULES.map((rule) => evaluateRule(rule, input));
    const requiredItems = items.filter((item) => item.required);
    const blockers = requiredItems.filter((item) => item.status !== 'COMPLETE');
    const completedRequired = requiredItems.length - blockers.length;
    const requiredComplete = blockers.length === 0;
    const percent = clampPercent(items.reduce((sum, item) => sum + item.percent, 0) / items.length);

    return {
        status: requiredComplete ? 'REPORT_READY' : 'IN_PROGRESS',
        percent,
        requiredComplete,
        completedRequired,
        totalRequired: requiredItems.length,
        items,
        blockers,
        nextAction: blockers[0] ?? items.find((item) => item.status !== 'COMPLETE') ?? null,
    };
}
