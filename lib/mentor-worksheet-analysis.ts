// 워크시트별 비공개 멘토 분석의 입력 형식과 스펙 설명 항목을 정의한다.
import { z } from 'zod';

const text = z.string().max(20_000);
const prose = z.object({ analysis: text }).strict();
const targetSpec = z.object({ items: z.array(z.object({
    label: z.string().max(2000), explanation: text,
}).strict()).max(500) }).strict();
const roadmap = z.object({ productName: z.string().max(300), description: text }).strict();
const assets = z.object({ core: text, complementary: text }).strict();

export const worksheetAnalysisSchema = z.object({
    spec: prose.optional(), attributes: prose.optional(), fitness: prose.optional(),
    'target-spec': targetSpec.optional(), 'tech-roadmap': roadmap.optional(),
    assets: assets.optional(), 'funding-plan': prose.optional(), 'funding-source': prose.optional(),
}).strict();
export type WorksheetAnalysis = z.infer<typeof worksheetAnalysisSchema>;
export type AnalysisWorksheetId = keyof WorksheetAnalysis;
export const ANALYSIS_WORKSHEETS: Record<AnalysisWorksheetId, string> = {
    spec: 'WS-2 AS-IS 스펙표', attributes: 'WS-3 제품속성서', fitness: 'WS-4 제품속성적합도',
    'target-spec': 'WS-12 최종목표스펙', 'tech-roadmap': 'WS-13 개선 제품(서비스)',
    assets: 'WS-15 핵심자산 및 보완자산', 'funding-plan': 'WS-16 자금소요계획', 'funding-source': 'WS-17 자금조달계획',
};
export function isAnalysisWorksheetId(value: string): value is AnalysisWorksheetId {
    return Object.hasOwn(ANALYSIS_WORKSHEETS, value);
}

export const saveWorksheetAnalysisSchema = z.discriminatedUnion('worksheetId', [
    z.object({ version: z.number().int().nonnegative(), worksheetId: z.literal('spec'), analysis: prose }).strict(),
    z.object({ version: z.number().int().nonnegative(), worksheetId: z.literal('attributes'), analysis: prose }).strict(),
    z.object({ version: z.number().int().nonnegative(), worksheetId: z.literal('fitness'), analysis: prose }).strict(),
    z.object({ version: z.number().int().nonnegative(), worksheetId: z.literal('target-spec'), analysis: targetSpec }).strict(),
    z.object({ version: z.number().int().nonnegative(), worksheetId: z.literal('tech-roadmap'), analysis: roadmap }).strict(),
    z.object({ version: z.number().int().nonnegative(), worksheetId: z.literal('assets'), analysis: assets }).strict(),
    z.object({ version: z.number().int().nonnegative(), worksheetId: z.literal('funding-plan'), analysis: prose }).strict(),
    z.object({ version: z.number().int().nonnegative(), worksheetId: z.literal('funding-source'), analysis: prose }).strict(),
]);

export function emptyWorksheetAnalysis(id: AnalysisWorksheetId): NonNullable<WorksheetAnalysis[AnalysisWorksheetId]> {
    if (id === 'target-spec') return { items: [] };
    if (id === 'tech-roadmap') return { productName: '', description: '' };
    if (id === 'assets') return { core: '', complementary: '' };
    return { analysis: '' };
}

// WS-12 저장은 행 ID를 재발급하므로 설명은 항목명과 함께 보존한다. 원본이 바뀌어도 기존 설명을 지우지 않는다.
export function appendTargetSpecItems(
    saved: NonNullable<WorksheetAnalysis['target-spec']>['items'],
    rows: Array<{ category?: string | null; subCategory?: string | null; specItem?: string | null }>,
) {
    const labels = new Set(saved.map(item => item.label));
    const additions: typeof saved = [];
    for (const row of rows) {
        const label = [row.category, row.subCategory, row.specItem].filter(value => value?.trim()).join(' / ').slice(0, 2000);
        if (label && !labels.has(label)) { additions.push({ label, explanation: '' }); labels.add(label); }
    }
    return [...saved, ...additions];
}
