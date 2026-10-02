// report.pdf와 승인된 샘플 순서로 실제 저장 내용과 멘토 분석을 배치한다.
import type { CapturedWorksheetImage, FinalReportBlock, FinalReportFreeInput, FinalReportOverviewInput, FinalReportWorksheetData } from './final-report-document';
import type { ProductOverview } from './product-overview';
import type { WorksheetAnalysis } from './mentor-worksheet-analysis';
import { formatMoney } from './money';
import { parseSourceYear } from './funding-ai-agent';
import { fitImageToBody, A4_PORTRAIT_BODY } from './report-image-fit';

type ReportCell = string | number | null | undefined;
const displayValue = (text: ReportCell) => text == null || String(text).trim() === '' ? '미입력' : String(text);
const displayAmount = (number: number | null) => number === null ? '미입력' : formatMoney(number);
const KANO_CATEGORY_NAMES: Record<string, string> = { A: '매력적', O: '일원적', M: '당연적', I: '무관심', R: '역품질', Q: '회의적', ATTRACTIVE: '매력적', ONE_DIMENSIONAL: '일원적', MUST_BE: '당연적', INDIFFERENT: '무관심' };

// 삭제한 입력은 보존하고 신규 개요 필드가 없는 이전 프로젝트만 자유 입력을 사용한다.
export function hasProductOverviewSource(overview: ProductOverview): boolean {
    return ['productName', 'relatedImages', 'productImageDataUrl', 'productImageWidthPx', 'productImageHeightPx', 'marketDefinition', 'targetCustomer']
        .some(key => Object.hasOwn(overview, key));
}

function createReportWriter(blocks: FinalReportBlock[], images: CapturedWorksheetImage[]) {
    const addHeading = (text: string, level: 1 | 2 = 2) => blocks.push({ kind: 'heading', text, level });
    const addParagraph = (text: string, tone?: 'analysis' | 'notice' | 'caption') => blocks.push({ kind: 'paragraph', text, ...(tone ? { tone } : {}) });
    const addPageBreak = () => blocks.push({ kind: 'pageBreak' });
    const addTable = (title: string, headers: string[], rows: ReportCell[][], columnWidths?: number[], mergeColumns?: number[]) => {
        if (!rows.length) { addParagraph(`${title}의 저장 내용이 없습니다. 미작성 상태입니다.`, 'notice'); return; }
        blocks.push({ kind: 'dataTable', title, headers, rows: rows.map(row => row.map(cell => String(cell ?? ''))), ...(columnWidths ? { columnWidths } : {}), ...(mergeColumns ? { mergeColumns } : {}) });
    };
    const addMentorAnalysis = (ws: string, text?: string, hasInput = true) => {
        addParagraph(`${ws} 멘토 분석(보고)`, 'analysis');
        addParagraph(text?.trim() ? text : hasInput ? '저장된 멘토 분석(보고)이 없습니다.' : '현재 멘토 분석(보고) 입력란이 없어 저장된 분석이 없습니다.', text?.trim() ? undefined : 'notice');
    };
    const startWorksheetPage = (title: string, ws: string, text?: string, hasInput = true) => { addPageBreak(); addHeading(title); addMentorAnalysis(ws, text, hasInput); };
    const addWorksheetImage = (id: CapturedWorksheetImage['worksheetId'], title: string, emptyText: string) => {
        const image = images.find(item => item.worksheetId === id);
        if (!image) { addParagraph(emptyText, 'notice'); return; }
        blocks.push({ kind: 'image', title, pngDataUrl: image.pngDataUrl,
            ...fitImageToBody(image.widthPx, image.heightPx, A4_PORTRAIT_BODY), landscape: false });
    };

    return { blocks, addHeading, addParagraph, addPageBreak, addTable, addMentorAnalysis, startWorksheetPage, addWorksheetImage };
}

type ReportWriter = ReturnType<typeof createReportWriter>;

function buildSpecRows(specFunctions: FinalReportWorksheetData['specFunctions']): ReportCell[][] {
    const specs: ReportCell[][] = [];
    for (const core of specFunctions.filter(row => row.level === 'CORE')) {
        const subs = specFunctions.filter(row => row.level === 'SUB' && row.parentId === core.id);
        if (!subs.length || core.technology) specs.push([specs.length + 1, core.name, '', '', core.technology]);
        for (const sub of subs) {
            const details = specFunctions.filter(row => row.level === 'DETAIL' && row.parentId === sub.id);
            if (!details.length || sub.technology) specs.push([specs.length + 1, core.name, sub.name, '', sub.technology]);
            for (const detail of details) specs.push([specs.length + 1, core.name, sub.name, detail.name, detail.technology]);
        }
    }
    return specs;
}

function appendProductOverview(writer: ReportWriter, overview: FinalReportOverviewInput, worksheets: FinalReportWorksheetData, freeInput: FinalReportFreeInput) {
    writer.addHeading('Ⅰ. (As-Is) 제품/서비스 정의', 1);
    writer.addHeading('제품(서비스)명 및 제품설명');
    writer.addParagraph(`프로젝트명 · ${overview.projectName}`);
    writer.addParagraph(`제품명 · ${displayValue(overview.productName)}\n개요의 간단 설명 · ${displayValue(overview.description)}`);
    writer.addParagraph('상세 제품설명', 'analysis');
    writer.addParagraph(displayValue(overview.detailedDescription));
    // 구형 개요 응답에 필드 자체가 없을 때만 기존 보고서의 자유입력을 사용한다.
    const source = hasProductOverviewSource(overview) ? overview : freeInput;
    if ('relatedImages' in source && source.relatedImages) {
        source.relatedImages.forEach((image, index) => writer.blocks.push({ kind: 'image', title: `관련이미지 ${index + 1}`, pngDataUrl: image.dataUrl,
            landscape: false, ...fitImageToBody(image.widthPx, image.heightPx, A4_PORTRAIT_BODY) }));
    } else if (source.productImageDataUrl) {
        writer.blocks.push({ kind: 'image', title: '제품/서비스 이미지', pngDataUrl: source.productImageDataUrl, landscape: false,
            ...(source.productImageWidthPx && source.productImageHeightPx
                ? fitImageToBody(source.productImageWidthPx, source.productImageHeightPx, A4_PORTRAIT_BODY)
                : { widthMm: 120, heightMm: 80 }) });
    }
    writer.addHeading('시장 정의 및 목표고객');
    writer.addParagraph('시장정의', 'analysis');
    writer.addParagraph(displayValue(source.marketDefinition));
    writer.addParagraph(`목표고객 · ${displayValue(source.targetCustomer)}`);
    writer.addHeading('매출처별 매출현황 및 목표매출액 (WS-1)');
    for (const [period, title] of [['Y', '현재 매출현황'], ['Y_PLUS_1', '향후 1년 목표매출액']]) {
        writer.addParagraph(title, 'analysis');
        writer.addTable(`WS-1 ${title}`, ['No', '매출처', period === 'Y' ? '매출액(원)' : '목표매출액(원)', '경쟁사명'],
            worksheets.salesEstimates.filter(row => row.period === period).map((row, index) => [index + 1, row.customer, formatMoney(row.amount), row.competitor]), [25, 140, 130, 216]);
    }
}

function appendProductDiagnosis(writer: ReportWriter, worksheets: FinalReportWorksheetData, analysis: WorksheetAnalysis) {
    writer.addPageBreak(); writer.addHeading('Ⅱ. 고객과 경쟁자를 고려한 제품/서비스 진단', 1);
    writer.addHeading('(AS-IS) 제품/서비스 스펙표 (WS-2)'); writer.addMentorAnalysis('WS-2', analysis.spec?.analysis);
    const specs = buildSpecRows(worksheets.specFunctions);
    const showDetailColumn = specs.some(row => String(row[3] ?? '').trim() !== '') || !worksheets.specDetailCollapsed;
    writer.addTable('WS-2 AS-IS 스펙표', ['No', '핵심기술', '세부기술', ...(showDetailColumn ? ['세세부기술'] : []), '적용기술'],
        showDetailColumn ? specs : specs.map(row => row.filter((_, column) => column !== 3)),
        [24, 73, 136, ...(showDetailColumn ? [57] : []), 221], [1, 2]);
    writer.startWorksheetPage('제품속성표 (WS-3)', 'WS-3', analysis.attributes?.analysis);
    writer.addParagraph(`워크시트 제품명 · ${displayValue(worksheets.productAttributes.find(row => row.productName?.trim())?.productName)}`);
    writer.addTable('WS-3 제품속성서', ['No', '세분시장', '고객명', '고객 니즈', '제공혜택', '제품속성'],
        worksheets.productAttributes.map((row, index) => [index + 1, row.marketSegment, row.customerName, row.customerNeed, row.benefit, row.attribute]), [24, 53, 46, 139, 131, 118], [1, 2, 3, 4]);
    const capabilities = Array.from(new Set(worksheets.productAttributes.map(row => row.techCapability).filter((text): text is string => Boolean(text?.trim()))));
    if (capabilities.length) { writer.addHeading('공통 기술 역량 (WS-3)'); writer.addTable('WS-3 기술 역량', ['기술 역량'], capabilities.map(text => [text])); }

    writer.startWorksheetPage('제품/서비스 속성 적합도 (WS-4)', 'WS-4', analysis.fitness?.analysis);
    writer.addWorksheetImage('fitness', '제품/서비스 속성 적합도', '속성 적합도 행렬이 저장되어 있지 않습니다. 평가 결과 그림은 미작성 상태입니다.');
    writer.addHeading('제품/서비스 진단표');
    writer.addParagraph('원본 양식의 진단표와 연결된 입력란이 없어 아래 항목은 미응답입니다.', 'notice');
    writer.addTable('제품/서비스 진단표', ['No', '진단항목', '진단 내용', '응답'], [
        [1, '인식정도 진단', '5배 매출 경쟁자를 인식하고 있는가?', '미응답'],
        [2, '진입정도 진단', '해당 경쟁사의 고객에게 진입할 수 있는가?', '미응답'],
        [3, '경쟁자 진단', '경쟁사를 이길 스펙이 있다고 생각하는가?', '미응답'],
        [4, '경쟁우위요인 진단', '경쟁사를 딛고 5배 매출을 올릴 수 있는가?', '미응답'],
    ], [25, 115, 310, 61]);
    writer.addHeading('제품/서비스 개선 방향');
    writer.addParagraph('5배 매출 경쟁자의 이름·전년도 매출액 · 미입력\n경쟁자 보유 주요 고객 5개 · 미입력\n경쟁 우위를 위한 제품개선항목·도출 의견 · 미입력', 'notice');
}

function appendKanoResults(writer: ReportWriter, worksheets: FinalReportWorksheetData) {
    writer.startWorksheetPage('Kano 분석을 통한 고객요구품질 집계 (WS-7)', 'WS-7', undefined, false);
    writer.addWorksheetImage('kano-aggregation', 'Kano 2D 산점도', 'Kano 응답이 없어 분석 결과 그림은 미작성 상태입니다.');
    writer.startWorksheetPage('Kano 분석 집계표 (WS-7)', 'WS-7', undefined, false);
    const hasCounts = worksheets.kanoAggregation.some(row => row.aggregated);
    writer.addTable('WS-7 Kano 집계', ['No', '설문항목(요구사항)', ...(hasCounts ? ['A', 'O', 'M', 'I', 'R', 'Q'] : []), '만족계수', '불만족계수', '가중치', 'KANO', 'TIMKO'],
        worksheets.kanoAggregation.map((row, index) => [index + 1, worksheets.requirements.find(req => req.id === row.requirementId)?.requirement ?? '요구사항 미확인',
            ...(hasCounts ? (['A', 'O', 'M', 'I', 'R', 'Q'] as const).map(key => row.aggregated?.[key] ?? '') : []),
            row.better, row.worse, row.kanoWeight, KANO_CATEGORY_NAMES[row.aggregated?.dominantCategory ?? ''] ?? '', KANO_CATEGORY_NAMES[row.timkoCategory] ?? row.timkoCategory]),
        hasCounts ? [22, 127, 18, 18, 18, 18, 18, 18, 28, 28, 30, 34, 34] : [22, 233, 45, 45, 45, 60, 61]);
    writer.addParagraph('A 매력적 · O 일원적 · M 당연적 · I 무관심 · R 역품질 · Q 회의적. TIMKO는 가중치별 분류이며 그래프의 사분면 분류와 다를 수 있습니다.', 'caption');

}

function appendQfdMatrix(writer: ReportWriter, worksheets: FinalReportWorksheetData) {
    writer.startWorksheetPage('고객수요기반 기술스펙 관계도 (WS-9)', 'WS-9', undefined, false);
    const technicals = [...(worksheets.technicalCharacteristics ?? [])].sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0) || (a.columnOrder ?? 0) - (b.columnOrder ?? 0));
    if (technicals.length && worksheets.requirements.length) {
        // 많은 기술 열도 읽을 수 있도록 10열씩 나누되 고객요구사항을 반복한다.
        for (let offset = 0; offset < technicals.length; offset += 10) {
            if (offset) writer.addPageBreak();
            const columns = technicals.slice(offset, offset + 10);
            const strengths: Record<string, string> = { STRONG: '9', MEDIUM: '3', WEAK: '1', NONE: '' };
            writer.addTable('WS-9 QFD 관계 행렬', ['No', '고객요구사항', '가중치', ...columns.map((_, index) => `T${offset + index + 1}`)],
                worksheets.requirements.map((req, index) => [index + 1, req.requirement, worksheets.competitiveAssessment.find(row => row.requirementId === req.id)?.weight ?? '',
                    ...columns.map(tech => strengths[worksheets.qfdRelationships?.find(row => row.requirementId === req.id && row.technicalCharId === tech.id)?.strength ?? 'NONE'] ?? '')]),
                [22, 170, 29, ...columns.map(() => 29)]);
        }
        writer.addParagraph('강한 관계 9 · 보통 관계 3 · 약한 관계 1 · 공란은 관계값 미저장. 기술 코드는 다음 목록과 대응합니다.', 'caption');
        writer.addHeading('QFD 기술특성 목록 (WS-9)');
        writer.addTable('WS-9 기술특성 목록', ['코드', '기술특성', '가중점수', '중요도(%)', '순위'], technicals.map((tech, index) => {
            const score = worksheets.qfdTechnicals?.find(row => row.technicalCharId === tech.id);
            return [`T${index + 1}`, tech.name, score?.totalScore, score?.importancePercent, score?.rank];
        }), [35, 287, 63, 63, 63]);
    } else writer.addWorksheetImage('qfd', '고객수요기반 기술스펙 관계도', 'QFD 관계도에 필요한 기술특성 또는 고객요구사항이 없습니다.');
}

function appendQfdAnalysis(writer: ReportWriter, worksheets: FinalReportWorksheetData) {
    writer.addPageBreak(); writer.addHeading('Ⅲ. QFD를 통한 제품(서비스)스펙 도출', 1);
    writer.addHeading('고객요구사항(요구품질) (WS-5)'); writer.addMentorAnalysis('WS-5', undefined, false);
    writer.addTable('WS-5 고객요구사항', ['No', '항목', '1차 그룹', '2차 그룹'], worksheets.requirements.map((row, index) => [index + 1, row.requirement, row.category, row.subcategory]), [24, 279, 108, 100], [2, 3]);
    appendKanoResults(writer, worksheets);

    writer.startWorksheetPage('Competitive Assessment · 경쟁적 우위요인 평가 (WS-9)', 'WS-9', undefined, false);
    writer.addTable('WS-9 경쟁적 우위요인 평가', ['No', '고객요구사항', '가중치', '자사', '경쟁사', '목표', '향상율', '절대중요도', '개발향상비중(%)', '순위'],
        worksheets.competitiveAssessment.map((row, index) => [index + 1, row.requirement, row.weight, row.selfScore, row.competitorScore, row.planQuality, row.improvementRate, row.absoluteImportance, row.qualityImportancePercent, row.rank]), [22, 189, ...Array(8).fill(37.5)]);
    writer.startWorksheetPage('개선포인트점수 기반 고객니즈 우선순위 (WS-11)', 'WS-11', undefined, false);
    writer.addTable('WS-11 고객니즈 우선순위', ['No', '고객니즈', '수준향상율', '개발향상비중'], worksheets.improvementNeeds.map((row, index) => [index + 1, row.content, row.improvementRate, row.devProportion]), [24, 313, 82, 92]);
    writer.startWorksheetPage('Engineering Metrics · 기술요구사항 도출 (WS-10)', 'WS-10', undefined, false);
    writer.addTable('WS-10 기능기술체계도', ['No', '고객의 소리', '핵심기능', '세부기능', '기술적 특성'], worksheets.techTree.map((row, index) => [index + 1, row.customerVoice, row.coreSpec, row.subSpec, row.techCharacteristic]), [24, 128, 70, 108, 181], [1, 2, 3]);
    appendQfdMatrix(writer, worksheets);
    writer.startWorksheetPage('개선포인트 기반 개선 기능/성능 List (WS-11)', 'WS-11', undefined, false);
    writer.addTable('WS-11 개선 기능/성능', ['No', '고객니즈', '추가 기능', '성능향상'], worksheets.improvementFeatures.map((row, index) => [index + 1, row.content, row.improvementRate, row.devProportion]), [24, 263, 112, 112]);
}

function appendTargetProduct(writer: ReportWriter, worksheets: FinalReportWorksheetData, freeInput: FinalReportFreeInput, analysis: WorksheetAnalysis) {
    writer.addPageBreak(); writer.addHeading('Ⅳ. (To-Be) 최종 고객요구사항기반 제품정의서', 1);
    writer.addHeading('최종 목표 스펙 (WS-12)');
    const specAnalysis = analysis['target-spec'];
    writer.addMentorAnalysis('WS-12', specAnalysis ? specAnalysis.items.map(item => `${item.label}\n${displayValue(item.explanation)}`).join('\n\n') : freeInput.finalSpecExplanation);
    writer.addTable('WS-12 최종 제품/서비스 제공 스펙', ['스펙분류', '세부항목', '기술적 특성', '단위', '목표값', '개선여부'], worksheets.targetSpecs.map(row => [row.category, row.subCategory, row.specItem, row.unit, row.targetValue, row.note]), [85, 105, 151, 45, 65, 60], [0, 1]);
    writer.addHeading('개선 제품(서비스)명 및 개선 제품설명 (WS-13)');
    const roadmap = analysis['tech-roadmap'];
    writer.addMentorAnalysis('WS-13', [roadmap?.productName ?? freeInput.improvedProductName, roadmap?.description ?? freeInput.improvedProductDescription].filter(Boolean).join('\n'));
    writer.addHeading('KS-QFD를 활용한 제품/서비스 개선 방향성 (WS-13)');
    writer.addTable('WS-13 향후 목표고객', ['No', '개선 고객니즈', '기능 및 성능향상', '구현가능성', '목표 고객'], worksheets.improvementDirections.map((row, index) => [index + 1, row.category, row.techItem, row.currentLevel, row.targetLevel]), [24, 164, 95, 145, 83]);
}

function appendAssetAndFundingPlans(writer: ReportWriter, worksheets: FinalReportWorksheetData, analysis: WorksheetAnalysis) {
    writer.addPageBreak(); writer.addHeading('Ⅴ. 자산 및 자금계획', 1);
    writer.addHeading('핵심자산 및 보완자산 (WS-15)'); writer.addMentorAnalysis('WS-15', [analysis.assets?.core, analysis.assets?.complementary].filter(Boolean).join('\n\n'));
    writer.addTable('WS-15 핵심자산 및 보완자산', ['구분', '필요 항목', '핵심자산·해결방안'], worksheets.assets.filter(row => row.type === 'CORE' || row.type === 'COMPLEMENTARY').map(row => [row.type === 'CORE' ? '핵심자산' : '보완자산', row.category, row.content]), [75, 170, 266], [0, 1]);
    writer.addHeading('자금소요계획 (WS-16)'); writer.addMentorAnalysis('WS-16', analysis['funding-plan']?.analysis);
    writer.addTable('WS-16 자금소요계획', ['구분', '항목', '1차년도(원)', '2차년도(원)', '3차년도(원)'], worksheets.fundingPlans.map(row => [row.category, row.item, displayAmount(row.year1), displayAmount(row.year2), displayAmount(row.year3)]), [59, 140, 112, 100, 100], [0]);
    writer.addParagraph('1차년도 매출액은 WS-1의 향후 1년 목표매출 합계와 연동됩니다. 저장된 0과 미입력을 구분하여 표시합니다.', 'caption');
    writer.startWorksheetPage('자금조달계획 (WS-17)', 'WS-17', analysis['funding-source']?.analysis);
    writer.addTable('WS-17 자금조달계획', ['구분', '1차년도 출처·금액(원)', '2차년도 출처·금액(원)', '3차년도 출처·금액(원)'], worksheets.fundingSources.map(row => [row.category, ...[row.year1, row.year2, row.year3].map(raw => {
        if (!raw?.trim()) return '미입력';
        const parsed = parseSourceYear(raw);
        return `${displayValue(parsed.source)}\n${parsed.amount === '' ? '미입력' : formatMoney(parsed.amount)}`;
    })]), [151, 120, 120, 120], [0]);
}

export function buildReportTemplate(overview: FinalReportOverviewInput, worksheets: FinalReportWorksheetData, freeInput: FinalReportFreeInput, images: CapturedWorksheetImage[], analysis: WorksheetAnalysis): FinalReportBlock[] {
    const blocks: FinalReportBlock[] = [{ kind: 'cover', title: 'KS-QFD 활용 제품개선보고서', projectName: overview.projectName,
        companyName: displayValue(overview.companyName), coachName: overview.coachName?.trim() || '미배정', outputDate: overview.generatedAt }];
    const writer = createReportWriter(blocks, images);
    appendProductOverview(writer, overview, worksheets, freeInput);
    appendProductDiagnosis(writer, worksheets, analysis);
    appendQfdAnalysis(writer, worksheets);
    appendTargetProduct(writer, worksheets, freeInput, analysis);
    appendAssetAndFundingPlans(writer, worksheets, analysis);
    return blocks;
}
