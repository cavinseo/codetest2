// 상세 제품개요를 구성하는 세 구획(고객 정의 / 고객 문제 정의 / 핵심 기능)의
// 조합과 분해를 담당한다.
//
// Prisma 스키마를 바꾸지 않기 위해 세 구획을 기존 detailedDescription 한 칸에
// 라벨 붙은 텍스트로 담는다. WS-2 처럼 구획별로 다시 쓰려는 쪽은 여기의
// parseBusinessPlanSections 로 되돌려 읽는다.

export interface BusinessPlanSections {
    customer: string;
    problem: string;
    coreFunctions: string;
}

export const SECTION_LABELS = {
    customer: '고객 정의',
    problem: '고객 문제 정의',
    coreFunctions: '핵심 기능',
} as const;

const SECTION_ORDER: Array<keyof BusinessPlanSections> = ['customer', 'problem', 'coreFunctions'];

export function isBusinessPlanSectionsEmpty(sections: BusinessPlanSections) {
    return SECTION_ORDER.every((key) => !sections[key].trim());
}

// 값이 있는 구획만 이어 붙인다. 전부 비면 빈 문자열을 돌려줘서
// detailedDescription 이 라벨만 남는 껍데기가 되지 않게 한다.
export function formatBusinessPlanSections(sections: BusinessPlanSections): string {
    return SECTION_ORDER
        .filter((key) => sections[key].trim())
        .map((key) => `[${SECTION_LABELS[key]}]\n${sections[key].trim()}`)
        .join('\n\n');
}

// 라벨이 하나도 없으면 사용자가 자유 서술로 바꾼 것으로 보고 전부 빈 값을 준다.
// 호출부는 그때 원문을 그대로 쓰면 된다.
export function parseBusinessPlanSections(text: string | null | undefined): BusinessPlanSections {
    const empty: BusinessPlanSections = { customer: '', problem: '', coreFunctions: '' };
    if (!text || !text.trim()) return empty;

    const labelToKey = new Map<string, keyof BusinessPlanSections>(
        SECTION_ORDER.map((key) => [SECTION_LABELS[key], key])
    );

    const result = { ...empty };
    let currentKey: keyof BusinessPlanSections | null = null;
    const buffer: string[] = [];

    const flush = () => {
        if (currentKey) result[currentKey] = buffer.join('\n').trim();
        buffer.length = 0;
    };

    for (const line of text.split(/\r?\n/)) {
        const heading = line.trim().match(/^\[(.+)\]$/);
        const key = heading ? labelToKey.get(heading[1].trim()) : undefined;
        if (key) {
            flush();
            currentKey = key;
            continue;
        }
        if (currentKey) buffer.push(line);
    }
    flush();

    return result;
}

// 자유 서술로 저장된 경우까지 감안해, WS-2 가 바로 쓸 수 있는 형태로 돌려준다.
export function readBusinessPlanForSpec(detailedDescription: string | null | undefined) {
    const sections = parseBusinessPlanSections(detailedDescription);
    const hasSections = !isBusinessPlanSectionsEmpty(sections);
    return {
        sections,
        hasSections,
        // 세부설명에는 전체 맥락을 그대로 넘긴다.
        detailText: (detailedDescription ?? '').trim(),
        // 원하는 기능 칸은 핵심 기능 구획이 있을 때만 자동으로 채운다.
        desiredFunctions: hasSections ? sections.coreFunctions.trim() : '',
    };
}
