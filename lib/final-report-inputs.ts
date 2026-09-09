// 워크시트 API 응답을 결과보고서 모델 입력으로 옮긴다.
//
// 라우트마다 배열이 담긴 키가 다르고(rows·entries·items·assets·plans), 어떤
// 워크시트는 한 테이블을 type 으로 나눠 쓰기 때문에 그 규칙을 화면이 아니라
// 여기에 모은다. 화면은 fetch 만 하고 이 파일이 뜻을 붙인다.
import type { FinalReportWorksheetData } from './final-report-document';

/** 응답에서 배열을 꺼낸다. 한 워크시트가 비어도 보고서 전체는 나와야 하므로 빈 배열로 떨어뜨린다. */
export function pickArray<T = Record<string, unknown>>(payload: unknown, key: string): T[] {
    if (!payload || typeof payload !== 'object') return [];
    const value = (payload as Record<string, unknown>)[key];
    return Array.isArray(value) ? (value as T[]) : [];
}

type ImprovementRow = { type?: string | null; content?: string | null; improvementRate?: string | null; devProportion?: string | null };

/**
 * 개선포인트(WS-11)는 한 테이블의 같은 세 컬럼을 type 에 따라 다른 뜻으로 쓴다.
 *   need    → content=고객니즈,                improvementRate=경쟁사대비 수준향상율, devProportion=개발향상비중
 *   feature → content=개선포인트 우선순위,     improvementRate=추가 기능,             devProportion=성능향상
 * 그래서 열 제목이 다른 두 표가 되고, 여기서 갈라 두지 않으면 보고서에서 뒤바뀐다.
 */
export function splitImprovementItems(items: ImprovementRow[]) {
    const pick = (row: ImprovementRow) => ({
        content: row.content ?? null,
        improvementRate: row.improvementRate ?? null,
        devProportion: row.devProportion ?? null,
    });
    return {
        improvementNeeds: items.filter((row) => row.type === 'need').map(pick),
        improvementFeatures: items.filter((row) => row.type === 'feature').map(pick),
    };
}

/**
 * 표지의 코치명. /mentors 응답에는 이메일도 들어 있지만 이름만 꺼낸다 —
 * 문서와 로그에 이메일을 남기지 않는다는 규칙 때문이다.
 * 권한이 없는 사용자에게는 이 라우트가 403 이라 payload 가 없을 수 있고, 그때는
 * 오류가 아니라 미배정으로 본다(코치명 하나 때문에 보고서를 못 뽑으면 안 된다).
 */
export function pickCoachName(payload: unknown): string | null {
    const mentors = pickArray<{ user?: { name?: string | null } | null }>(payload, 'mentors');
    for (const mentor of mentors) {
        const name = mentor?.user?.name;
        if (typeof name === 'string' && name.trim()) return name.trim();
    }
    return null;
}

type KanoRow = { requirementId: string; better: number; worse: number; timkoCategory?: string | null; quadrant?: string | null };
type RequirementRow = { id: string; requirement?: string | null };

/**
 * WS-7 산점도는 projectId 가 아니라 점 배열을 주입받는다. Kano 분석 응답에는
 * 요구사항 문구가 없고 requirementId 만 있어 여기서 이어 붙인다.
 */
export function toKanoChartPoints(kano: KanoRow[], requirements: RequirementRow[]) {
    const nameById = new Map(requirements.map((row) => [row.id, row.requirement ?? '']));
    return kano.map((row) => ({
        requirementId: row.requirementId,
        requirementName: nameById.get(row.requirementId) || undefined,
        better: row.better,
        worse: row.worse,
        timkoCategory: row.timkoCategory ?? null,
        quadrant: row.quadrant ?? '',
    }));
}

export interface WorksheetPayloads {
    exportData: unknown;   // { specFunctions, productAttributes, customerRequirements, ... }
    sales: unknown;        // { rows }
    kanoAnalysis: unknown; // { requirements }
    qfdAnalysis: unknown;  // { requirements }
    improvements: unknown; // { items }
    techTree: unknown;     // { entries }  ← 이 라우트만 키가 rows 가 아니다
    targetSpec: unknown;   // { rows }
    techRoadmap: unknown;  // { rows }
    assets: unknown;       // { assets }
    funding: unknown;      // { plans, sources }  ← 두 표가 한 라우트에서 온다
}

export function buildWorksheetData(payloads: WorksheetPayloads): FinalReportWorksheetData {
    // 필드마다 기대 행 타입을 지정한다. 통째로 캐스팅해 버리면 절을 하나 빠뜨려도
    // 컴파일이 통과해 버리는데, 그러면 보고서에서 표 하나가 조용히 사라진다.
    type Row<K extends keyof FinalReportWorksheetData> = FinalReportWorksheetData[K][number];
    const { improvementNeeds, improvementFeatures } = splitImprovementItems(
        pickArray<ImprovementRow>(payloads.improvements, 'items'),
    );
    return {
        salesEstimates: pickArray<Row<'salesEstimates'>>(payloads.sales, 'rows'),
        specFunctions: pickArray<Row<'specFunctions'>>(payloads.exportData, 'specFunctions'),
        productAttributes: pickArray<Row<'productAttributes'>>(payloads.exportData, 'productAttributes'),
        requirements: pickArray<Row<'requirements'>>(payloads.exportData, 'customerRequirements'),
        kanoAggregation: pickArray<Row<'kanoAggregation'>>(payloads.kanoAnalysis, 'requirements'),
        competitiveAssessment: pickArray<Row<'competitiveAssessment'>>(payloads.qfdAnalysis, 'requirements'),
        improvementNeeds,
        improvementFeatures,
        techTree: pickArray<Row<'techTree'>>(payloads.techTree, 'entries'),
        targetSpecs: pickArray<Row<'targetSpecs'>>(payloads.targetSpec, 'rows'),
        improvementDirections: pickArray<Row<'improvementDirections'>>(payloads.techRoadmap, 'rows'),
        assets: pickArray<Row<'assets'>>(payloads.assets, 'assets'),
        fundingPlans: pickArray<Row<'fundingPlans'>>(payloads.funding, 'plans'),
        fundingSources: pickArray<Row<'fundingSources'>>(payloads.funding, 'sources'),
    };
}
