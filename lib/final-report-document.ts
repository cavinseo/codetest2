// 원본 워크시트의 열 의미를 보존하여 렌더러가 저장소 구조를 몰라도 문서를 만들게 한다.
import { kanoSurveyFileNameStem } from './kano-survey-document';
import { buildTargetSpecsFromAsIs } from './worksheet-links';
import { formatMoney } from './money';
import { parseSourceYear } from './funding-ai-agent';
import { A4_PORTRAIT_BODY, A4_LANDSCAPE_BODY, fitImageToBody, shouldUseLandscape } from './report-image-fit';
import type { ProductOverview } from './product-overview';
import type { WorksheetAnalysis } from './mentor-worksheet-analysis';

export interface FinalReportFreeInput {
    productImageDataUrl: string | null;
    productImageWidthPx: number | null;
    productImageHeightPx: number | null;
    marketDefinition: string;
    targetCustomer: string;
    finalSpecExplanation: string;
    improvedProductName: string;
    improvedProductDescription: string;
}

export interface FinalReportOverviewInput extends ProductOverview {
    projectName: string;
    description: string | null;
    coachName: string | null;
    generatedAt: string;
}

export interface FinalReportWorksheetData {
    salesEstimates: Array<{ period: string; customer: string | null; amount: number; futureAmount: number; competitor: string | null }>;
    specFunctions: Array<{ id: string; level: string; parentId: string | null; name: string; technology: string | null }>;
    productAttributes: Array<{ productName: string | null; customerName: string | null; marketSegment: string | null; customerNeed: string | null; benefit: string | null; attribute: string | null; techCapability: string | null }>;
    requirements: Array<{ id: string; category: string; subcategory: string | null; requirement: string }>;
    kanoAggregation: Array<{ requirementId: string; responseCount: number; better: number; worse: number; kanoWeight: number; autoKanoWeight: number; timkoCategory: string; quadrant: string }>;
    competitiveAssessment: Array<{ requirementId: string; requirement: string; weight: number; weightPercent: number; selfScore: number; competitorScore: number; planQuality: number; improvementRate: number; absoluteImportance: number; qualityImportancePercent: number; rank: number | null }>;
    improvementNeeds: Array<{
        content: string | null;
        improvementRate: string | null;
        devProportion: string | null;
    }>;
    improvementFeatures: Array<{
        content: string | null;
        improvementRate: string | null;
        devProportion: string | null;
    }>;
    techTree: Array<{ customerVoice: string | null; coreSpec: string | null; subSpec: string | null; techCharacteristic: string | null }>;
    targetSpecs: Array<{ category: string | null; subCategory: string | null; specItem: string | null; unit: string | null; targetValue: string | null; note: string | null }>;
    improvementDirections: Array<{
        category: string | null;
        techItem: string | null;
        currentLevel: string | null;
        targetLevel: string | null;
    }>;
    assets: Array<{ type: string; category: string | null; content: string | null }>;
    fundingPlans: Array<{ category: string | null; item: string | null; year1: number; year2: number | null; year3: number | null }>;
    fundingSources: Array<{ category: string | null; year1: string | null; year2: string | null; year3: string | null }>;
}

export interface CapturedWorksheetImage {
    worksheetId: 'fitness' | 'kano-aggregation' | 'qfd';
    title: string;
    pngDataUrl: string;
    widthPx: number;
    heightPx: number;
}

export type FinalReportBlock =
    | { kind: 'heading'; text: string; level: 1 | 2 }
    | { kind: 'paragraph'; text: string }
    | { kind: 'keyValueTable'; rows: Array<{ label: string; value: string }> }
    | { kind: 'dataTable'; headers: string[]; rows: string[][] }
    | { kind: 'image'; title: string; pngDataUrl: string; widthMm: number; heightMm: number; landscape: boolean };

export interface FinalReportModel {
    title: string;
    fileName: string;
    blocks: FinalReportBlock[];
}


export function finalReportFileName(projectName: string): string {
    return `결과보고서_${kanoSurveyFileNameStem(projectName)}.docx`;
}

// 빈 문자열·삭제된 이미지는 유지하고, 신규 필드가 모두 null 또는 미지정인 이전 프로젝트만 자유 입력을 사용한다.
export function hasProductOverviewSource(overview: ProductOverview): boolean {
    return [overview.productName, overview.productImageDataUrl, overview.productImageWidthPx,
        overview.productImageHeightPx, overview.marketDefinition, overview.targetCustomer]
        .some(value => value !== null && value !== undefined);
}

export function buildFinalReportModel(
    overview: FinalReportOverviewInput,
    worksheets: FinalReportWorksheetData,
    freeInput: FinalReportFreeInput,
    images: CapturedWorksheetImage[],
    analysis: WorksheetAnalysis = {},
): FinalReportModel {
    const blocks: FinalReportBlock[] = [];
    const heading = (text: string, level: 1 | 2 = 2) => {
        blocks.push({ kind: 'heading', text, level });
    };
    const table = (title: string, headers: string[], rows: Array<Array<string | number | null>>) => {
        heading(title);
        blocks.push(rows.length === 0
            ? { kind: 'paragraph', text: '입력된 데이터가 없습니다' }
            : { kind: 'dataTable', headers, rows: rows.map(row => row.map(value => String(value ?? ''))) });
    };
    const prose = (title: string, text: string) => {
        if (text.trim()) {
            heading(title);
            blocks.push({ kind: 'paragraph', text });
        }
    };
    const capture = (worksheetId: CapturedWorksheetImage['worksheetId'], title: string) => {
        heading(title);
        const image = images.find(item => item.worksheetId === worksheetId);
        if (!image) {
            blocks.push({ kind: 'paragraph', text: '그림을 캡처하지 못했습니다' });
            return;
        }
        const landscape = shouldUseLandscape(image.widthPx, image.heightPx);
        blocks.push({
            kind: 'image',
            title: image.title,
            pngDataUrl: image.pngDataUrl,
            ...fitImageToBody(image.widthPx, image.heightPx, landscape ? A4_LANDSCAPE_BODY : A4_PORTRAIT_BODY),
            landscape,
        });
    };

    const productOverview = hasProductOverviewSource(overview) ? overview : freeInput;

    heading('KS-QFD 결과보고서', 1);
    blocks.push({ kind: 'keyValueTable', rows: [
        { label: '기업명', value: overview.projectName },
        { label: '작성일', value: overview.generatedAt },
        { label: '코치명', value: overview.coachName ?? '미배정' },
    ] });
    heading('Ⅰ. 제품/서비스 개요', 1);
    blocks.push({ kind: 'keyValueTable', rows: [
        { label: '제품명', value: overview.productName ?? overview.projectName },
        { label: '제품설명', value: overview.description ?? '' },
    ] });
    if (productOverview.productImageDataUrl) {
        heading('제품/서비스 이미지');
        // 사진 치수를 얻지 못한 경우에도 기존 입력으로 보고서를 만들 수 있게 한다.
        const size = productOverview.productImageWidthPx != null && productOverview.productImageHeightPx != null
            ? fitImageToBody(productOverview.productImageWidthPx, productOverview.productImageHeightPx, A4_PORTRAIT_BODY)
            : { widthMm: 120, heightMm: 80 };
        blocks.push({ kind: 'image', title: '제품/서비스 이미지', pngDataUrl: productOverview.productImageDataUrl, ...size, landscape: false });
    }
    prose('시장정의', productOverview.marketDefinition ?? '');
    prose('목표고객', productOverview.targetCustomer ?? '');
    table('매출처별 매출 현황', ['매출처', '매출액', '경쟁사명'],
        worksheets.salesEstimates.filter(row => row.period === 'Y').map(row => [row.customer, formatMoney(row.amount), row.competitor]));
    table('향후 1년 목표매출액', ['매출처', '매출액', '경쟁사명'],
        worksheets.salesEstimates.filter(row => row.period === 'Y_PLUS_1').map(row => [row.customer, formatMoney(row.amount), row.competitor]));

    heading('Ⅱ. 제품/서비스 속성 분석', 1);
    table('(AS-IS) 스펙표', ['핵심스펙', '세부스펙', '기술적특성'],
        buildTargetSpecsFromAsIs(worksheets.specFunctions).map(row => [row.category, row.subCategory, row.specItem]));
    prose('WS-2 멘토 분석', analysis.spec?.analysis ?? '');
    table('제품속성서', ['제품명', '고객명', '세분시장', '니즈', '혜택', '속성', '기술역량'],
        worksheets.productAttributes.map(row => [row.productName, row.customerName, row.marketSegment, row.customerNeed, row.benefit, row.attribute, row.techCapability]));
    prose('WS-3 멘토 분석', analysis.attributes?.analysis ?? '');
    capture('fitness', '제품/서비스 속성 적합도');
    prose('WS-4 멘토 분석', analysis.fitness?.analysis ?? '');

    heading('Ⅲ. 고객수요 및 기술 분석', 1);
    table('고객요구사항 도출표', ['번호', '1차 그룹', '2차 그룹', '항목'],
        worksheets.requirements.map((row, index) => [index + 1, row.category, row.subcategory, row.requirement]));
    table('Kano 집계표', ['항목', '만족계수', '불만족계수', '품질', '가중치'],
        worksheets.kanoAggregation.map(row => [
            worksheets.requirements.find(requirement => requirement.id === row.requirementId)?.requirement ?? '요구사항 미확인',
            row.better, row.worse, row.timkoCategory, row.kanoWeight,
        ]));
    capture('kano-aggregation', 'Kano 2D 산점도');
    table('Competitive Assessment', ['항목', '가중치', '가중치 백분율', '자사', '경쟁사', '기획품질', '수준향상율', '절대중요도', '요구품질중요도%', 'RANK'],
        worksheets.competitiveAssessment.map(row => [row.requirement, row.weight, row.weightPercent, row.selfScore, row.competitorScore, row.planQuality, row.improvementRate, row.absoluteImportance, row.qualityImportancePercent, row.rank]));
    table('개선포인트점수 기반 고객니즈 우선순위', ['고객니즈', '경쟁사대비 수준향상율', '개발향상비중'],
        worksheets.improvementNeeds.map(row => [row.content, row.improvementRate, row.devProportion]));
    table('Engineering Metrics: 기술요구사항 도출', ['고객의소리', '핵심스펙', '세부스펙', '기술적특성'],
        worksheets.techTree.map(row => [row.customerVoice, row.coreSpec, row.subSpec, row.techCharacteristic]));
    capture('qfd', '고객수요기반 기술스펙 관계도');
    table('개선포인트기반 개선 기능/성능 List', ['개선포인트 우선순위(고객니즈)', '추가 기능', '성능향상'],
        worksheets.improvementFeatures.map(row => [row.content, row.improvementRate, row.devProportion]));

    heading('Ⅳ. 최종 개선 방향', 1);
    if (analysis['target-spec'] === undefined) prose('최종 목표 스펙 항목별 설명', freeInput.finalSpecExplanation);
    table('최종 제품/서비스 제공 스펙 List', ['스펙분류', '세부항목', '기술적특성', '개선여부'],
        worksheets.targetSpecs.map(row => [row.category, row.subCategory, row.specItem, row.note]));
    if (analysis['target-spec']?.items.length) {
        table('WS-12 멘토 분석 · 최종 목표 스펙 항목별 설명', ['항목', '설명'],
            analysis['target-spec'].items.map(item => [item.label, item.explanation]));
    }
    table('핵심자산 도출표', ['핵심자산'],
        worksheets.assets.filter(row => row.type === 'CORE').map(row => [row.content]));
    prose('WS-15 멘토 분석 · 핵심자산', analysis.assets?.core ?? '');
    table('보완자산 도출표', ['필요항목', '해결방안'],
        worksheets.assets.filter(row => row.type === 'COMPLEMENTARY').map(row => [row.category, row.content]));
    prose('WS-15 멘토 분석 · 보완자산', analysis.assets?.complementary ?? '');
    prose('개선 제품명', analysis['tech-roadmap']?.productName ?? freeInput.improvedProductName);
    prose('개선 제품설명', analysis['tech-roadmap']?.description ?? freeInput.improvedProductDescription);
    table('KS-QFD 개선 방향성', ['순위', '개선 방향(차별화)', '개선기능 및 성능향상', '구현가능성', '목표 고객'],
        worksheets.improvementDirections.map((row, index) => [index + 1, row.category, row.techItem, row.currentLevel, row.targetLevel]));

    heading('Ⅴ. 자금 계획', 1);
    table('자금소요계획표', ['구분', '항목', '1차년도', '2차년도', '3차년도'],
        worksheets.fundingPlans.map(row => [row.category, row.item, formatMoney(row.year1), formatMoney(row.year2), formatMoney(row.year3)]));
    prose('WS-16 멘토 분석', analysis['funding-plan']?.analysis ?? '');
    table('자금조달계획표', ['구분', '1차년도 출처', '1차년도 금액', '2차년도 출처', '2차년도 금액', '3차년도 출처', '3차년도 금액'],
        worksheets.fundingSources.map(row => [row.category, ...[row.year1, row.year2, row.year3].flatMap(value => {
            const parsed = parseSourceYear(value);
            return [parsed.source, formatMoney(parsed.amount)];
        })]));
    prose('WS-17 멘토 분석', analysis['funding-source']?.analysis ?? '');
    return { title: 'KS-QFD 결과보고서', fileName: finalReportFileName(overview.projectName), blocks };
}
