// 원본 워크시트의 열 의미를 보존하여 렌더러가 저장소 구조를 몰라도 문서를 만들게 한다.
import { kanoSurveyFileNameStem } from './kano-survey-document';
import { buildReportTemplate } from './final-report-template';
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
    companyName?: string | null;
    detailedDescription?: string | null;
}

export interface FinalReportWorksheetData {
    fitnessMatrix?: { marketsJson: string; matrixJson: string } | null;
    technicalCharacteristics?: Array<{ id: string; name: string; groupIndex?: number; columnOrder?: number; unit?: string | null; targetValue?: string | null }>;
    benchmarks?: Array<{ requirementId: string; company: string; score: number }>;
    technicalBenchmarks?: Array<{ technicalCharId: string; company: string; value: string }>;
    qfdRelationships?: Array<{ requirementId: string; technicalCharId: string; strength: string }>;
    qfdTechnicals?: Array<{ technicalCharId: string; totalScore: number; importancePercent: number; rank: number | null }>;
    salesEstimates: Array<{ period: string; customer: string | null; amount: number; futureAmount: number; competitor: string | null }>;
    specFunctions: Array<{ id: string; level: string; parentId: string | null; name: string; technology: string | null }>;
    specDetailCollapsed?: boolean;
    productAttributes: Array<{ id?: string; productName: string | null; customerName: string | null; marketSegment: string | null; customerNeed: string | null; benefit: string | null; attribute: string | null; techCapability: string | null }>;
    requirements: Array<{ id: string; category: string; subcategory: string | null; requirement: string }>;
    kanoAggregation: Array<{ requirementId: string; requirementName?: string; responseCount: number; better: number; worse: number; kanoWeight: number; autoKanoWeight: number; timkoCategory: string; quadrant: string; aggregated?: { A: number; O: number; M: number; I: number; R: number; Q: number; total?: number; dominantCategory: string } }>;
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
    | { kind: 'cover'; title: string; projectName: string; companyName: string; coachName: string; outputDate: string }
    | { kind: 'pageBreak' }
    | { kind: 'heading'; text: string; level: 1 | 2 }
    | { kind: 'paragraph'; text: string; tone?: 'analysis' | 'notice' | 'caption' }
    | { kind: 'keyValueTable'; rows: Array<{ label: string; value: string }> }
    | { kind: 'dataTable'; headers: string[]; rows: string[][]; columnWidths?: number[]; mergeColumns?: number[]; title?: string;
        headerGroups?: Array<string | null>; columnSpans?: Array<{ row: number; column: number; span: number }>; highlightRows?: number[] }
    | { kind: 'image'; title: string; pngDataUrl: string; widthMm: number; heightMm: number; landscape: boolean };

export interface FinalReportModel {
    title: string;
    fileName: string;
    blocks: FinalReportBlock[];
}

/** 표지 제목이자 문서 제목이다. 두 자리에 같은 값이 들어가야 해서 한 곳에 둔다. */
const REPORT_TITLE = 'KS-QFD 활용 제품개선보고서';

/**
 * 표로 재현하기 어려워 화면을 그림으로 붙이는 세 절의 제목이다.
 * 캡처하는 화면(결과보고서 페이지)과 문서의 절 제목이 어긋나면 안 되므로
 * 양쪽이 이 표를 같이 본다.
 */
export const CAPTURED_WORKSHEET_TITLES: Record<CapturedWorksheetImage['worksheetId'], string> = {
    fitness: '제품/서비스 속성 적합도',
    'kano-aggregation': 'Kano 2D 산점도',
    qfd: '고객수요기반 기술스펙 관계도',
};

function worksheetImageBlock(image: CapturedWorksheetImage, portraitOnly: boolean): Extract<FinalReportBlock, { kind: 'image' }> {
    const landscape = !portraitOnly && shouldUseLandscape(image.widthPx, image.heightPx);
    return {
        kind: 'image', title: image.title, pngDataUrl: image.pngDataUrl,
        ...fitImageToBody(image.widthPx, image.heightPx, landscape ? A4_LANDSCAPE_BODY : A4_PORTRAIT_BODY),
        landscape,
    };
}

function worksheetImageSlot(blocks: FinalReportBlock[], worksheetId: CapturedWorksheetImage['worksheetId']) {
    if (worksheetId === 'fitness' && blocks.some(block => block.kind === 'dataTable' && block.title === 'WS-4 제품속성적합도')) return null;
    const title = CAPTURED_WORKSHEET_TITLES[worksheetId];
    const imageIndex = blocks.findIndex(block => block.kind === 'image' && block.title === title);
    if (imageIndex >= 0) return { index: imageIndex, replaceCount: 1 };
    const heading = blocks.findIndex(block => block.kind === 'heading' && block.text === title);
    const placeholder = blocks[heading + 1];
    if (heading >= 0 && (placeholder?.kind === 'image' || (placeholder?.kind === 'paragraph' && placeholder.text === '그림을 캡처하지 못했습니다'))) {
        return { index: heading + 1, replaceCount: 1 };
    }
    if (worksheetId !== 'fitness') return null;
    const fitnessHeading = blocks.findIndex(block => block.kind === 'heading' && block.text === '제품/서비스 속성 적합도 (WS-4)');
    if (fitnessHeading < 0) return null;
    let sectionEnd = fitnessHeading + 1;
    while (sectionEnd < blocks.length && blocks[sectionEnd].kind !== 'heading' && blocks[sectionEnd].kind !== 'pageBreak') {
        const block = blocks[sectionEnd];
        if (block.kind === 'paragraph' && block.text === '속성 적합도 행렬이 저장되어 있지 않습니다. 평가 결과 그림은 미작성 상태입니다.') {
            return { index: sectionEnd, replaceCount: 1 };
        }
        sectionEnd++;
    }
    // 누락 안내를 교정한 경우 해당 문단을 보존하고 WS-4 절 끝에 그림을 넣는다.
    return { index: sectionEnd, replaceCount: 0 };
}

export function hasWorksheetImageSlot(model: FinalReportModel, worksheetId: CapturedWorksheetImage['worksheetId']): boolean {
    return worksheetImageSlot(model.blocks, worksheetId) !== null;
}

// 보고서의 교정 문구와 표를 유지하면서 지정된 그림 자리만 교체한다.
export function replaceWorksheetImages(model: FinalReportModel, images: CapturedWorksheetImage[]): FinalReportModel {
    const blocks = [...model.blocks];
    const portraitOnly = blocks.some(block => block.kind === 'cover');
    for (const image of images) {
        const title = CAPTURED_WORKSHEET_TITLES[image.worksheetId];
        const slot = worksheetImageSlot(blocks, image.worksheetId);
        if (!slot) throw new Error(`${title} 그림 위치를 찾지 못했습니다. 미리보기를 다시 만들어 주세요.`);
        blocks.splice(slot.index, slot.replaceCount, worksheetImageBlock(image, portraitOnly));
    }
    return { ...model, blocks };
}

export function finalReportFileName(projectName: string): string {
    return `결과보고서_${kanoSurveyFileNameStem(projectName)}.docx`;
}

export { hasProductOverviewSource } from './final-report-template';

export function buildFinalReportModel(
    overview: FinalReportOverviewInput,
    worksheets: FinalReportWorksheetData,
    freeInput: FinalReportFreeInput,
    images: CapturedWorksheetImage[],
    analysis: WorksheetAnalysis = {},
): FinalReportModel {
    return { title: REPORT_TITLE, fileName: finalReportFileName(overview.projectName),
        blocks: buildReportTemplate(overview, worksheets, freeInput, images, analysis) };
}
