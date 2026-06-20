// 프로젝트 맥락을 바탕으로 WS-2 FAST 기술 구조 초안을 생성하는 규칙 기반 에이전트
export type SpecAiMode = 'draft' | 'refine' | 'technology';

export interface SpecAiStructuredInput {
    productService?: string;
    customerSegments?: string;
    currentFunctions?: string;
    operations?: string;
    technologies?: string;
    competitors?: string;
}

export interface SpecAiSpecFunction {
    id: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string | null;
    name: string;
    technology?: string | null;
    order: number;
}

export interface SpecAiContext {
    project: {
        name: string;
        description?: string | null;
        detailedDescription?: string | null;
    };
    additionalDescription?: string;
    structuredInput?: SpecAiStructuredInput;
    existingSpecs?: SpecAiSpecFunction[];
    productAttributes?: Array<{
        customerName?: string | null;
        marketSegment?: string | null;
        customerNeed?: string | null;
        benefit?: string | null;
        attribute?: string | null;
        techCapability?: string | null;
    }>;
    customerRequirements?: Array<{
        category?: string | null;
        subcategory?: string | null;
        requirement: string;
    }>;
    qfdTechnicals?: Array<{
        name: string;
        unit?: string | null;
        targetValue?: string | null;
    }>;
    targetSpecs?: Array<{
        category?: string | null;
        subCategory?: string | null;
        specItem?: string | null;
        unit?: string | null;
        targetValue?: string | null;
    }>;
}

export interface SpecAiIssue {
    severity: 'info' | 'warning' | 'error';
    message: string;
    specId?: string;
}

export interface SpecAiRecommendation {
    type: 'qfd' | 'targetSpec';
    label: string;
    reason: string;
}

interface Detail {
    name: string;
    technology: string;
}

interface Sub {
    name: string;
    details: Detail[];
}

interface Core {
    name: string;
    subs: Sub[];
}

const GENERIC_WORDS = new Set([
    '프로젝트',
    '서비스',
    '제품',
    '시스템',
    '기능',
    '관리',
    '제공',
    '지원',
    '개선',
    '고객',
    '사용자',
    '아이템',
]);

const DEFAULT_APPLIED_TECH = [
    '요구사항 분석',
    '데이터 모델링',
    '업무 규칙 엔진',
    'API/UI 설계',
    '품질 지표 모니터링',
    '운영 로그 분석',
];

export function generateSpecAiDraft(mode: SpecAiMode, context: SpecAiContext) {
    const normalizedContext = normalizeContext(context);
    const generated = generateByMode(mode, normalizedContext);
    const specFunctions = flattenCores(generated);
    const issues = validateSpecDraft(specFunctions);
    const recommendations = buildRecommendations(specFunctions, normalizedContext);

    return {
        specFunctions,
        issues,
        recommendations,
        contextSummary: buildContextSummary(normalizedContext),
    };
}

function normalizeContext(context: SpecAiContext) {
    const text = compact([
        context.project.name,
        context.project.description,
        context.project.detailedDescription,
        context.additionalDescription,
        context.structuredInput?.productService,
        context.structuredInput?.customerSegments,
        context.structuredInput?.currentFunctions,
        context.structuredInput?.operations,
        context.structuredInput?.technologies,
        context.structuredInput?.competitors,
        ...(context.productAttributes ?? []).flatMap((row) => [
            row.marketSegment,
            row.customerName,
            row.customerNeed,
            row.benefit,
            row.attribute,
            row.techCapability,
        ]),
        ...(context.customerRequirements ?? []).map((row) => row.requirement),
        ...(context.qfdTechnicals ?? []).map((row) => row.name),
        ...(context.targetSpecs ?? []).flatMap((row) => [row.category, row.subCategory, row.specItem]),
    ]);

    const technologyNames = unique([
        ...(context.productAttributes ?? []).map((row) => row.techCapability),
        ...(context.qfdTechnicals ?? []).map((row) => row.name),
        ...(context.targetSpecs ?? []).map((row) => row.specItem),
        ...splitTerms(context.structuredInput?.technologies ?? ''),
        ...extractTechnologyCandidates(text),
    ]);

    return {
        ...context,
        text,
        subject: pickSubject(context),
        keywords: extractKeywords(text),
        desiredFunctions: splitTerms(context.structuredInput?.currentFunctions ?? ''),
        customerNeeds: unique([
            ...(context.productAttributes ?? []).map((row) => row.customerNeed),
            ...(context.customerRequirements ?? []).map((row) => row.requirement),
        ]),
        attributeNames: unique((context.productAttributes ?? []).map((row) => row.attribute)),
        technologyNames: technologyNames.length > 0 ? technologyNames : DEFAULT_APPLIED_TECH,
    };
}

function generateByMode(mode: SpecAiMode, context: ReturnType<typeof normalizeContext>): Core[] {
    if (mode === 'technology') return generateTechnologyMode(context);

    const base = generateDraftCores(context);
    if (mode === 'draft') return base;

    return mergeExistingWithGenerated(context.existingSpecs ?? [], base);
}

function generateDraftCores(context: ReturnType<typeof normalizeContext>): Core[] {
    const seeds = pickCoreSeeds(context);
    const cores = seeds.map((seed, index) => buildFastCore(seed, context, index));

    if (cores.length < 3) {
        cores.push(buildSupportCore('데이터 운영', context, cores.length));
        cores.push(buildSupportCore('성과 검증', context, cores.length));
    }

    return dedupeCores(cores).slice(0, 6);
}

function pickCoreSeeds(context: ReturnType<typeof normalizeContext>) {
    const fromDesired = context.desiredFunctions;
    if (fromDesired.length > 0) return fromDesired.slice(0, 5);

    const fromAttributes = unique([...context.attributeNames, ...context.customerNeeds]);
    if (fromAttributes.length > 0) return fromAttributes.slice(0, 5);

    const fromKeywords = context.keywords.filter((word) => word.length >= 3);
    if (fromKeywords.length > 0) return fromKeywords.slice(0, 4);

    return [context.subject];
}

function buildFastCore(seed: string, context: ReturnType<typeof normalizeContext>, index: number): Core {
    const base = toBaseName(seed, context.subject);
    const applied = pickAppliedTechnologies(context, index);

    return {
        name: toTechnologyLabel(base),
        subs: [
            {
                name: `${base} 요구 정의 기술`,
                details: [
                    detail(`${base} 사용 목적 구조화`, applied[0]),
                    detail(`${base} 입력 조건 정의`, applied[1]),
                ],
            },
            {
                name: `${base} 처리 구현 기술`,
                details: [
                    detail(`${base} 판단 규칙 설계`, applied[2]),
                    detail(`${base} 처리 흐름 자동화`, applied[3]),
                ],
            },
            {
                name: `${base} 검증 운영 기술`,
                details: [
                    detail(`${base} 결과 품질 검증`, applied[4]),
                    detail(`${base} 이력 추적 및 개선`, applied[5]),
                ],
            },
        ],
    };
}

function buildSupportCore(seed: string, context: ReturnType<typeof normalizeContext>, index: number): Core {
    const base = `${context.subject} ${seed}`;
    const applied = pickAppliedTechnologies(context, index);

    return {
        name: toTechnologyLabel(base),
        subs: [
            {
                name: `${base} 체계화 기술`,
                details: [
                    detail(`${base} 기준 정보 관리`, applied[1]),
                    detail(`${base} 처리 상태 관리`, applied[2]),
                ],
            },
            {
                name: `${base} 고도화 기술`,
                details: [
                    detail(`${base} 성과 지표 수집`, applied[4]),
                    detail(`${base} 개선 항목 도출`, applied[5]),
                ],
            },
        ],
    };
}

function generateTechnologyMode(context: ReturnType<typeof normalizeContext>): Core[] {
    const existing = context.existingSpecs ?? [];
    if (existing.length === 0) return generateDraftCores(context);

    const byParent = groupByParent(existing);
    const cores = existing
        .filter((spec) => spec.level === 'CORE')
        .map((core, coreIndex) => ({
            name: toTechnologyLabel(core.name),
            subs: (byParent.get(core.id) ?? [])
                .filter((spec) => spec.level === 'SUB')
                .map((sub, subIndex) => {
                    const children = (byParent.get(sub.id) ?? []).filter((spec) => spec.level === 'DETAIL');
                    const details = children.length > 0 ? children : [sub];
                    return {
                        name: toTechnologyLabel(sub.name).replace(/ 기술$/, ' 세부기술'),
                        details: details.map((item, detailIndex) =>
                            detail(item.name, item.technology || inferTechnology(item.name, context, coreIndex + subIndex + detailIndex))
                        ),
                    };
                }),
        }));

    return dedupeCores(cores);
}

function mergeExistingWithGenerated(existingSpecs: SpecAiSpecFunction[], generated: Core[]): Core[] {
    if (existingSpecs.length === 0) return generated;

    const existingNames = new Set(existingSpecs.map((spec) => normalizeKey(spec.name)));
    const additions = generated.map((core) => ({
        ...core,
        subs: core.subs.map((sub) => ({
            ...sub,
            details: sub.details.filter((item) => !existingNames.has(normalizeKey(item.name))),
        })).filter((sub) => !existingNames.has(normalizeKey(sub.name)) || sub.details.length > 0),
    })).filter((core) => !existingNames.has(normalizeKey(core.name)) || core.subs.length > 0);

    return [...existingToCores(existingSpecs), ...additions].slice(0, 8);
}

function existingToCores(existing: SpecAiSpecFunction[]): Core[] {
    const byParent = groupByParent(existing);

    return existing
        .filter((spec) => spec.level === 'CORE')
        .map((core) => ({
            name: toTechnologyLabel(core.name),
            subs: (byParent.get(core.id) ?? [])
                .filter((spec) => spec.level === 'SUB')
                .map((sub) => ({
                    name: toTechnologyLabel(sub.name).replace(/ 기술$/, ' 세부기술'),
                    details: (byParent.get(sub.id) ?? [])
                        .filter((spec) => spec.level === 'DETAIL')
                        .map((item) => detail(item.name, item.technology || '')),
                }))
                .filter((sub) => sub.details.length > 0),
        }))
        .filter((core) => core.subs.length > 0);
}

function groupByParent(specs: SpecAiSpecFunction[]) {
    const byParent = new Map<string, SpecAiSpecFunction[]>();
    for (const spec of specs) {
        if (!spec.parentId) continue;
        byParent.set(spec.parentId, [...(byParent.get(spec.parentId) ?? []), spec]);
    }
    return byParent;
}

function flattenCores(cores: Core[]): SpecAiSpecFunction[] {
    const specs: SpecAiSpecFunction[] = [];
    let order = 0;

    cores.forEach((core, coreIndex) => {
        const coreId = `ai_core_${coreIndex}_${order}`;
        specs.push({ id: coreId, level: 'CORE', name: core.name, order: order++ });

        core.subs.forEach((sub, subIndex) => {
            const subId = `ai_sub_${coreIndex}_${subIndex}_${order}`;
            specs.push({ id: subId, level: 'SUB', parentId: coreId, name: sub.name, order: order++ });

            sub.details.forEach((item, detailIndex) => {
                specs.push({
                    id: `ai_detail_${coreIndex}_${subIndex}_${detailIndex}_${order}`,
                    level: 'DETAIL',
                    parentId: subId,
                    name: item.name,
                    technology: item.technology,
                    order: order++,
                });
            });
        });
    });

    return specs;
}

export function validateSpecDraft(specs: SpecAiSpecFunction[]): SpecAiIssue[] {
    const issues: SpecAiIssue[] = [];
    const names = new Map<string, SpecAiSpecFunction[]>();

    for (const spec of specs) {
        const key = normalizeKey(spec.name);
        names.set(key, [...(names.get(key) ?? []), spec]);

        if (spec.level === 'DETAIL' && !spec.technology?.trim()) {
            issues.push({ severity: 'warning', specId: spec.id, message: `"${spec.name}"의 적용기술이 비어 있습니다.` });
        }
    }

    for (const duplicated of names.values()) {
        if (duplicated.length > 1 && duplicated[0].name.trim()) {
            issues.push({ severity: 'warning', specId: duplicated[0].id, message: `"${duplicated[0].name}" 항목이 중복될 수 있습니다.` });
        }
    }

    const coreCount = specs.filter((spec) => spec.level === 'CORE').length;
    if (coreCount < 2) {
        issues.push({ severity: 'info', message: '핵심기술이 2개 미만입니다. 원하는 기능을 더 구체적으로 입력하면 결과가 좋아집니다.' });
    }

    return issues;
}

function buildRecommendations(
    specs: SpecAiSpecFunction[],
    context: ReturnType<typeof normalizeContext>
): SpecAiRecommendation[] {
    const detailTechs = unique(specs.map((spec) => spec.technology).filter(Boolean));
    const qfdNames = new Set((context.qfdTechnicals ?? []).map((item) => normalizeKey(item.name)));
    const targetNames = new Set((context.targetSpecs ?? []).map((item) => normalizeKey(item.specItem ?? '')));
    const recommendations: SpecAiRecommendation[] = [];

    for (const tech of detailTechs.slice(0, 8)) {
        const key = normalizeKey(tech);
        if (!qfdNames.has(key)) {
            recommendations.push({ type: 'qfd', label: tech, reason: 'QFD 기술특성 후보로 추가 검토할 수 있습니다.' });
        }
        if (!targetNames.has(key)) {
            recommendations.push({ type: 'targetSpec', label: tech, reason: '최종목표스펙의 기술적 특성 후보로 활용할 수 있습니다.' });
        }
    }

    return recommendations.slice(0, 10);
}

function buildContextSummary(context: ReturnType<typeof normalizeContext>) {
    return {
        keywords: context.keywords.slice(0, 8),
        customerNeedCount: context.customerNeeds.length,
        productAttributeCount: context.productAttributes?.length ?? 0,
        existingSpecCount: context.existingSpecs?.length ?? 0,
        qfdTechnicalCount: context.qfdTechnicals?.length ?? 0,
        targetSpecCount: context.targetSpecs?.length ?? 0,
    };
}

function detail(name: string, technology: string): Detail {
    return { name: cleanTerm(name), technology: cleanTerm(technology) };
}

function pickAppliedTechnologies(context: ReturnType<typeof normalizeContext>, offset: number) {
    const pool = unique([...context.technologyNames, ...DEFAULT_APPLIED_TECH]);
    return DEFAULT_APPLIED_TECH.map((fallback, index) => pool[(offset + index) % pool.length] || fallback);
}

function inferTechnology(name: string, context: ReturnType<typeof normalizeContext>, offset = 0) {
    const key = normalizeKey(name);
    const matched = context.technologyNames.find((technology) => key.includes(normalizeKey(technology)));
    if (matched) return matched;
    return pickAppliedTechnologies(context, offset)[0];
}

function toTechnologyLabel(value: string) {
    const cleaned = cleanTerm(value);
    if (!cleaned) return '핵심기술';
    if (/기술$/.test(cleaned)) return cleaned;
    return `${cleaned} 기술`;
}

function toBaseName(value: string, subject: string) {
    const cleaned = cleanTerm(value)
        .replace(/^(원하는|필요한|주요)\s*/, '')
        .replace(/\s*(기능|기술|지원|제공)$/g, '');
    return cleaned || subject || '아이템';
}

function pickSubject(context: SpecAiContext) {
    return cleanTerm(context.structuredInput?.productService || context.project.name || '제품 서비스').slice(0, 24);
}

function extractKeywords(text: string) {
    return unique(
        text
            .split(/[^0-9A-Za-z가-힣]+/)
            .map((word) => cleanTerm(word))
            .filter((word) => word.length >= 2 && !GENERIC_WORDS.has(word))
    ).slice(0, 12);
}

function extractTechnologyCandidates(text: string) {
    return unique(
        text
            .split(/[,\n;/]+/)
            .map((item) => cleanTerm(item))
            .filter((item) => item.length <= 40 && /기술|AI|API|데이터|모델|알고리즘|자동화|분석|모니터링/i.test(item))
    ).slice(0, 8);
}

function splitTerms(value: string) {
    return unique(value.split(/[,\n;/]+/).map((item) => cleanTerm(item)).filter(Boolean));
}

function compact(values: Array<string | null | undefined>) {
    return values.map((value) => value?.trim()).filter(Boolean).join(' ');
}

function unique(values: Array<string | null | undefined>) {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const cleaned = cleanTerm(value ?? '');
        const key = normalizeKey(cleaned);
        if (!cleaned || seen.has(key)) continue;
        seen.add(key);
        result.push(cleaned);
    }
    return result;
}

function cleanTerm(value: string) {
    return value.replace(/\s+/g, ' ').replace(/[|]+/g, ' ').trim().slice(0, 80);
}

function normalizeKey(value: string) {
    return cleanTerm(value).toLowerCase().replace(/[\s_\-()[\]{}]/g, '');
}

function dedupeCores(cores: Core[]) {
    const coreNames = new Set<string>();
    return cores
        .map((core) => ({
            ...core,
            subs: dedupeSubs(core.subs),
        }))
        .filter((core) => {
            const key = normalizeKey(core.name);
            if (!core.name || core.subs.length === 0 || coreNames.has(key)) return false;
            coreNames.add(key);
            return true;
        });
}

function dedupeSubs(subs: Sub[]) {
    const subNames = new Set<string>();
    return subs
        .map((sub) => ({
            ...sub,
            details: dedupeDetails(sub.details),
        }))
        .filter((sub) => {
            const key = normalizeKey(sub.name);
            if (!sub.name || sub.details.length === 0 || subNames.has(key)) return false;
            subNames.add(key);
            return true;
        });
}

function dedupeDetails(details: Detail[]) {
    const detailNames = new Set<string>();
    return details.filter((item) => {
        const key = normalizeKey(item.name);
        if (!item.name || detailNames.has(key)) return false;
        detailNames.add(key);
        return true;
    });
}
