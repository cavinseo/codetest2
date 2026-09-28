// report.pdf와 승인된 샘플 순서로 실제 저장 내용과 멘토 분석을 배치한다.
import type { CapturedWorksheetImage, FinalReportBlock, FinalReportFreeInput, FinalReportOverviewInput, FinalReportWorksheetData } from './final-report-document';
import { hasProductOverviewSource } from './final-report-document';
import type { WorksheetAnalysis } from './mentor-worksheet-analysis';
import { formatMoney } from './money';
import { parseSourceYear } from './funding-ai-agent';
import { fitImageToBody, A4_PORTRAIT_BODY } from './report-image-fit';

type Cell = string | number | null | undefined;
const value = (text: Cell) => text == null || String(text).trim() === '' ? '미입력' : String(text);
const amount = (number: number | null) => number === null ? '미입력' : formatMoney(number);
const categoryNames: Record<string, string> = { A: '매력적', O: '일원적', M: '당연적', I: '무관심', R: '역품질', Q: '회의적', ATTRACTIVE: '매력적', ONE_DIMENSIONAL: '일원적', MUST_BE: '당연적', INDIFFERENT: '무관심' };

export function buildReportTemplate(overview: FinalReportOverviewInput, w: FinalReportWorksheetData, free: FinalReportFreeInput, images: CapturedWorksheetImage[], analysis: WorksheetAnalysis): FinalReportBlock[] {
    const blocks: FinalReportBlock[] = [{ kind: 'cover', title: 'KS-QFD 활용 제품개선보고서', projectName: overview.projectName,
        companyName: value(overview.companyName), coachName: overview.coachName?.trim() || '미배정', outputDate: overview.generatedAt }];
    const heading = (text: string, level: 1 | 2 = 2) => blocks.push({ kind: 'heading', text, level });
    const prose = (text: string, tone?: 'analysis' | 'notice' | 'caption') => blocks.push({ kind: 'paragraph', text, ...(tone ? { tone } : {}) });
    const page = () => blocks.push({ kind: 'pageBreak' });
    const table = (title: string, headers: string[], rows: Cell[][], columnWidths?: number[]) => {
        if (!rows.length) { prose(`${title}의 저장 내용이 없습니다. 미작성 상태입니다.`, 'notice'); return; }
        blocks.push({ kind: 'dataTable', title, headers, rows: rows.map(row => row.map(cell => String(cell ?? ''))), ...(columnWidths ? { columnWidths } : {}) });
    };
    const mentor = (ws: string, text?: string, hasInput = true) => {
        prose(`${ws} 멘토 분석(보고)`, 'analysis');
        prose(text?.trim() ? text : hasInput ? '저장된 멘토 분석(보고)이 없습니다.' : '현재 멘토 분석(보고) 입력란이 없어 저장된 분석이 없습니다.', text?.trim() ? undefined : 'notice');
    };
    const sheet = (title: string, ws: string, text?: string, hasInput = true) => { page(); heading(title); mentor(ws, text, hasInput); };
    const picture = (id: CapturedWorksheetImage['worksheetId'], title: string, emptyText: string) => {
        const image = images.find(item => item.worksheetId === id);
        if (!image) { prose(emptyText, 'notice'); return; }
        blocks.push({ kind: 'image', title, pngDataUrl: image.pngDataUrl,
            ...fitImageToBody(image.widthPx, image.heightPx, A4_PORTRAIT_BODY), landscape: false });
    };

    heading('Ⅰ. (As-Is) 제품/서비스 정의', 1);
    heading('제품(서비스)명 및 제품설명');
    prose(`프로젝트명 · ${overview.projectName}`);
    prose(`제품명 · ${value(overview.productName)}\n개요의 간단 설명 · ${value(overview.description)}\n상세 제품설명 · ${value(overview.detailedDescription)}`);
    // 구형 개요 응답에 필드 자체가 없을 때만 기존 보고서의 자유입력을 사용한다.
    const source = hasProductOverviewSource(overview) ? overview : free;
    if (source.productImageDataUrl) {
        blocks.push({ kind: 'image', title: '제품/서비스 이미지', pngDataUrl: source.productImageDataUrl, landscape: false,
            ...(source.productImageWidthPx && source.productImageHeightPx
                ? fitImageToBody(source.productImageWidthPx, source.productImageHeightPx, A4_PORTRAIT_BODY)
                : { widthMm: 120, heightMm: 80 }) });
    }
    heading('시장 정의 및 목표고객');
    prose(`시장정의 · ${value(source.marketDefinition)}\n목표고객 · ${value(source.targetCustomer)}`);
    heading('매출처별 매출현황 및 목표매출액 (WS-1)');
    for (const [period, title] of [['Y', '현재 매출현황'], ['Y_PLUS_1', '향후 1년 목표매출액']]) {
        prose(title, 'analysis');
        table(`WS-1 ${title}`, ['No', '매출처', period === 'Y' ? '매출액(원)' : '목표매출액(원)', '경쟁사명'],
            w.salesEstimates.filter(row => row.period === period).map((row, index) => [index + 1, row.customer, formatMoney(row.amount), row.competitor]), [25, 140, 130, 216]);
    }

    page(); heading('Ⅱ. 고객과 경쟁자를 고려한 제품/서비스 진단', 1);
    heading('(AS-IS) 제품/서비스 스펙표 (WS-2)'); mentor('WS-2', analysis.spec?.analysis);
    const specs: Cell[][] = [];
    for (const core of w.specFunctions.filter(row => row.level === 'CORE')) {
        const subs = w.specFunctions.filter(row => row.level === 'SUB' && row.parentId === core.id);
        if (!subs.length || core.technology) specs.push([specs.length + 1, core.name, '', '', core.technology]);
        for (const sub of subs) {
            const details = w.specFunctions.filter(row => row.level === 'DETAIL' && row.parentId === sub.id);
            if (!details.length || sub.technology) specs.push([specs.length + 1, core.name, sub.name, '', sub.technology]);
            for (const detail of details) specs.push([specs.length + 1, core.name, sub.name, detail.name, detail.technology]);
        }
    }
    table('WS-2 AS-IS 스펙표', ['No', '핵심기술', '세부기술', '세세부기술', '적용기술'], specs, [24, 73, 136, 57, 221]);
    sheet('제품속성표 (WS-3)', 'WS-3', analysis.attributes?.analysis);
    prose(`워크시트 제품명 · ${value(w.productAttributes.find(row => row.productName?.trim())?.productName)}`);
    table('WS-3 제품속성서', ['No', '세분시장', '고객명', '고객 니즈', '제공혜택', '제품속성'],
        w.productAttributes.map((row, index) => [index + 1, row.marketSegment, row.customerName, row.customerNeed, row.benefit, row.attribute]), [24, 53, 46, 139, 131, 118]);
    const capabilities = Array.from(new Set(w.productAttributes.map(row => row.techCapability).filter((text): text is string => Boolean(text?.trim()))));
    if (capabilities.length) { heading('공통 기술 역량 (WS-3)'); table('WS-3 기술 역량', ['기술 역량'], capabilities.map(text => [text])); }

    sheet('제품/서비스 속성 적합도 (WS-4)', 'WS-4', analysis.fitness?.analysis);
    picture('fitness', '제품/서비스 속성 적합도', '속성 적합도 행렬이 저장되어 있지 않습니다. 평가 결과 그림은 미작성 상태입니다.');
    heading('제품/서비스 진단표');
    prose('원본 양식의 진단표와 연결된 입력란이 없어 아래 항목은 미응답입니다.', 'notice');
    table('제품/서비스 진단표', ['No', '진단항목', '진단 내용', '응답'], [
        [1, '인식정도 진단', '5배 매출 경쟁자를 인식하고 있는가?', '미응답'],
        [2, '진입정도 진단', '해당 경쟁사의 고객에게 진입할 수 있는가?', '미응답'],
        [3, '경쟁자 진단', '경쟁사를 이길 스펙이 있다고 생각하는가?', '미응답'],
        [4, '경쟁우위요인 진단', '경쟁사를 딛고 5배 매출을 올릴 수 있는가?', '미응답'],
    ], [25, 115, 310, 61]);
    heading('제품/서비스 개선 방향');
    prose('5배 매출 경쟁자의 이름·전년도 매출액 · 미입력\n경쟁자 보유 주요 고객 5개 · 미입력\n경쟁 우위를 위한 제품개선항목·도출 의견 · 미입력', 'notice');

    page(); heading('Ⅲ. QFD를 통한 제품(서비스)스펙 도출', 1);
    heading('고객요구사항(요구품질) (WS-5)'); mentor('WS-5', undefined, false);
    table('WS-5 고객요구사항', ['No', '항목', '1차 그룹', '2차 그룹'], w.requirements.map((row, index) => [index + 1, row.requirement, row.category, row.subcategory]), [24, 279, 108, 100]);
    sheet('Kano 분석을 통한 고객요구품질 집계 (WS-7)', 'WS-7', undefined, false);
    picture('kano-aggregation', 'Kano 2D 산점도', 'Kano 응답이 없어 분석 결과 그림은 미작성 상태입니다.');
    sheet('Kano 분석 집계표 (WS-7)', 'WS-7', undefined, false);
    const hasCounts = w.kanoAggregation.some(row => row.aggregated);
    table('WS-7 Kano 집계', ['No', '설문항목(요구사항)', ...(hasCounts ? ['A', 'O', 'M', 'I', 'R', 'Q'] : []), '만족계수', '불만족계수', '가중치', 'KANO', 'TIMKO'],
        w.kanoAggregation.map((row, index) => [index + 1, w.requirements.find(req => req.id === row.requirementId)?.requirement ?? '요구사항 미확인',
            ...(hasCounts ? (['A', 'O', 'M', 'I', 'R', 'Q'] as const).map(key => row.aggregated?.[key] ?? '') : []),
            row.better, row.worse, row.kanoWeight, categoryNames[row.aggregated?.dominantCategory ?? ''] ?? '', categoryNames[row.timkoCategory] ?? row.timkoCategory]),
        hasCounts ? [22, 127, 18, 18, 18, 18, 18, 18, 28, 28, 30, 34, 34] : [22, 233, 45, 45, 45, 60, 61]);
    prose('A 매력적 · O 일원적 · M 당연적 · I 무관심 · R 역품질 · Q 회의적. TIMKO는 가중치별 분류이며 그래프의 사분면 분류와 다를 수 있습니다.', 'caption');

    sheet('Competitive Assessment · 경쟁적 우위요인 평가 (WS-9)', 'WS-9', undefined, false);
    table('WS-9 경쟁적 우위요인 평가', ['No', '고객요구사항', '가중치', '자사', '경쟁사', '목표', '향상율', '절대중요도', '개발향상비중(%)', '순위'],
        w.competitiveAssessment.map((r, i) => [i + 1, r.requirement, r.weight, r.selfScore, r.competitorScore, r.planQuality, r.improvementRate, r.absoluteImportance, r.qualityImportancePercent, r.rank]), [22, 189, ...Array(8).fill(37.5)]);
    sheet('개선포인트점수 기반 고객니즈 우선순위 (WS-11)', 'WS-11', undefined, false);
    table('WS-11 고객니즈 우선순위', ['No', '고객니즈', '수준향상율', '개발향상비중'], w.improvementNeeds.map((row, i) => [i + 1, row.content, row.improvementRate, row.devProportion]), [24, 313, 82, 92]);
    sheet('Engineering Metrics · 기술요구사항 도출 (WS-10)', 'WS-10', undefined, false);
    table('WS-10 기능기술체계도', ['No', '고객의 소리', '핵심기능', '세부기능', '기술적 특성'], w.techTree.map((row, i) => [i + 1, row.customerVoice, row.coreSpec, row.subSpec, row.techCharacteristic]), [24, 128, 70, 108, 181]);
    sheet('고객수요기반 기술스펙 관계도 (WS-9)', 'WS-9', undefined, false);
    const technicals = [...(w.technicalCharacteristics ?? [])].sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0) || (a.columnOrder ?? 0) - (b.columnOrder ?? 0));
    if (technicals.length && w.requirements.length) {
        // 많은 기술 열도 읽을 수 있도록 10열씩 나누되 고객요구사항을 반복한다.
        for (let offset = 0; offset < technicals.length; offset += 10) {
            if (offset) page();
            const columns = technicals.slice(offset, offset + 10);
            const strengths: Record<string, string> = { STRONG: '9', MEDIUM: '3', WEAK: '1', NONE: '' };
            table('WS-9 QFD 관계 행렬', ['No', '고객요구사항', '가중치', ...columns.map((_, i) => `T${offset + i + 1}`)],
                w.requirements.map((req, i) => [i + 1, req.requirement, w.competitiveAssessment.find(r => r.requirementId === req.id)?.weight ?? '',
                    ...columns.map(tech => strengths[w.qfdRelationships?.find(r => r.requirementId === req.id && r.technicalCharId === tech.id)?.strength ?? 'NONE'] ?? '')]),
                [22, 170, 29, ...columns.map(() => 29)]);
        }
        prose('강한 관계 9 · 보통 관계 3 · 약한 관계 1 · 공란은 관계값 미저장. 기술 코드는 다음 목록과 대응합니다.', 'caption');
        heading('QFD 기술특성 목록 (WS-9)');
        table('WS-9 기술특성 목록', ['코드', '기술특성', '가중점수', '중요도(%)', '순위'], technicals.map((tech, i) => {
            const score = w.qfdTechnicals?.find(row => row.technicalCharId === tech.id);
            return [`T${i + 1}`, tech.name, score?.totalScore, score?.importancePercent, score?.rank];
        }), [35, 287, 63, 63, 63]);
    } else picture('qfd', '고객수요기반 기술스펙 관계도', 'QFD 관계도에 필요한 기술특성 또는 고객요구사항이 없습니다.');
    sheet('개선포인트 기반 개선 기능/성능 List (WS-11)', 'WS-11', undefined, false);
    table('WS-11 개선 기능/성능', ['No', '고객니즈', '추가 기능', '성능향상'], w.improvementFeatures.map((row, i) => [i + 1, row.content, row.improvementRate, row.devProportion]), [24, 263, 112, 112]);

    page(); heading('Ⅳ. (To-Be) 최종 고객요구사항기반 제품정의서', 1);
    heading('최종 목표 스펙 (WS-12)');
    const specAnalysis = analysis['target-spec'];
    mentor('WS-12', specAnalysis ? specAnalysis.items.map(item => `${item.label}\n${value(item.explanation)}`).join('\n\n') : free.finalSpecExplanation);
    table('WS-12 최종 제품/서비스 제공 스펙', ['스펙분류', '세부항목', '기술적 특성', '단위', '목표값', '개선여부'], w.targetSpecs.map(row => [row.category, row.subCategory, row.specItem, row.unit, row.targetValue, row.note]), [85, 105, 151, 45, 65, 60]);
    heading('개선 제품(서비스)명 및 개선 제품설명 (WS-13)');
    const roadmap = analysis['tech-roadmap'];
    mentor('WS-13', [roadmap?.productName ?? free.improvedProductName, roadmap?.description ?? free.improvedProductDescription].filter(Boolean).join('\n'));
    heading('KS-QFD를 활용한 제품/서비스 개선 방향성 (WS-13)');
    table('WS-13 향후 목표고객', ['No', '개선 고객니즈', '기능 및 성능향상', '구현가능성', '목표 고객'], w.improvementDirections.map((row, i) => [i + 1, row.category, row.techItem, row.currentLevel, row.targetLevel]), [24, 164, 95, 145, 83]);

    page(); heading('Ⅴ. 자산 및 자금계획', 1);
    heading('핵심자산 및 보완자산 (WS-15)'); mentor('WS-15', [analysis.assets?.core, analysis.assets?.complementary].filter(Boolean).join('\n\n'));
    table('WS-15 핵심자산 및 보완자산', ['구분', '필요 항목', '핵심자산·해결방안'], w.assets.filter(row => row.type === 'CORE' || row.type === 'COMPLEMENTARY').map(row => [row.type === 'CORE' ? '핵심자산' : '보완자산', row.category, row.content]), [75, 170, 266]);
    heading('자금소요계획 (WS-16)'); mentor('WS-16', analysis['funding-plan']?.analysis);
    table('WS-16 자금소요계획', ['구분', '항목', '1차년도(원)', '2차년도(원)', '3차년도(원)'], w.fundingPlans.map(row => [row.category, row.item, amount(row.year1), amount(row.year2), amount(row.year3)]), [59, 140, 112, 100, 100]);
    prose('1차년도 매출액은 WS-1의 향후 1년 목표매출 합계와 연동됩니다. 저장된 0과 미입력을 구분하여 표시합니다.', 'caption');
    sheet('자금조달계획 (WS-17)', 'WS-17', analysis['funding-source']?.analysis);
    table('WS-17 자금조달계획', ['구분', '1차년도 출처·금액(원)', '2차년도 출처·금액(원)', '3차년도 출처·금액(원)'], w.fundingSources.map(row => [row.category, ...[row.year1, row.year2, row.year3].map(raw => {
        if (!raw?.trim()) return '미입력';
        const parsed = parseSourceYear(raw);
        return `${value(parsed.source)}\n${parsed.amount === '' ? '미입력' : formatMoney(parsed.amount)}`;
    })]), [151, 120, 120, 120]);
    return blocks;
}
