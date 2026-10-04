// 작성용 워크시트와 같은 열·집계·그룹으로 편집 가능한 보고서 표를 구성한다.
import type { FinalReportWorksheetData } from './final-report-document';
import type { ReportDataTable } from './final-report-table-structure';
import { formatMoney } from './money';
import { parseSourceYear } from './funding-ai-agent';
import { buildTechnicalGroups } from './qfd-technical-groups';
import { buildQfdSpecFooterRows } from './qfd-footer-rows';
import { dedupeByAttributeName } from './product-attributes-utils';

type Cell = string | number | null | undefined;
type TableOptions = Pick<ReportDataTable, 'columnWidths' | 'mergeColumns' | 'headerGroups' | 'columnSpans' | 'highlightRows'>;
export function worksheetReportTable(title: string, headers: string[], rows: Cell[][], options: TableOptions = {}): ReportDataTable {
    return { kind: 'dataTable', title, headers, rows: rows.map(row => row.map(value => String(value ?? ''))), ...options };
}

export function buildFitnessReportTables(data: FinalReportWorksheetData): ReportDataTable[] {
    if (!data.fitnessMatrix) return [];
    const markets = JSON.parse(data.fitnessMatrix.marketsJson) as Array<{ id: string; name: string; subSegments: Array<{ id: string; name: string }> }>;
    const matrix = JSON.parse(data.fitnessMatrix.matrixJson) as Record<string, Record<string, Record<string, string>>>;
    const attributes = dedupeByAttributeName(data.productAttributes);
    const columns = markets.flatMap(market => market.subSegments.map(customer => {
        const values = attributes.map(row => matrix[row.id ?? '']?.[market.id]?.[customer.id] ?? '');
        const count = (priority: string) => values.filter(value => value === priority).length;
        return { market, customer, values, h: count('H'), m: count('M'), l: count('L'), lStar: count('L*') };
    }));
    const eligible = columns.filter(column => !column.lStar).sort((a, b) => b.h - a.h || b.m - a.m);
    const tables: ReportDataTable[] = [];
    for (let start = 0; start < columns.length; start += 6) {
        const selected = columns.slice(start, start + 6);
        tables.push(worksheetReportTable('WS-4 제품속성적합도', ['속성', ...selected.map(column => column.customer.name)], [
            ...attributes.map((attribute, index) => [attribute.attribute, ...selected.map(column => column.values[index])]),
            ['우선순위', ...selected.map(() => '개수')],
            ...(['H', 'M', 'L', 'L*'] as const).map((priority, index) => [priority, ...selected.map(column => [column.h, column.m, column.l, column.lStar][index])]),
            ['세분시장 순위', ...selected.map(column => {
                if (column.lStar) return '부적합';
                const rank = eligible.findIndex(other => other.h === column.h && other.m === column.m) + 1;
                const tie = eligible.filter(other => other.h === column.h && other.m === column.m).length > 1;
                return `${rank}순위${tie ? ' (동률)' : ''}`;
            })],
        ], { headerGroups: [null, ...selected.map(column => column.market.name)], columnWidths: [160, ...selected.map(() => 70)] }));
    }
    return tables;
}

export function buildKanoReportTable(data: FinalReportWorksheetData): ReportDataTable {
    const names: Record<string, string> = { A: '매력적', O: '일원적', M: '당연적', R: '역품질', I: '무관심', Q: '회의적' };
    return worksheetReportTable('WS-7 Kano 집계', ['No', '설문항목(요구사항)', '매력적\n(A)', '일원적\n(O)', '당연적\n(M)', '역품질\n(R)', '무관심\n(I)', '회의적\n(Q)', '합계', '만족계수', '불만족계수', '가중치', 'KANO 분석결과', 'TIMKO 분석결과'],
        data.kanoAggregation.map((row, index) => [index + 1, row.requirementName ?? data.requirements.find(req => req.id === row.requirementId)?.requirement ?? '요구사항 미확인',
            ...(['A', 'O', 'M', 'R', 'I', 'Q'] as const).map(key => row.aggregated?.[key] || '-'), row.aggregated?.total ?? row.responseCount,
            row.better.toFixed(2), row.worse.toFixed(2), row.kanoWeight, names[row.aggregated?.dominantCategory ?? ''] ?? '', row.timkoCategory ?? '가중치 입력']),
        { headerGroups: [null, null, ...Array(7).fill('KANO 응답 집계'), ...Array(5).fill(null)], columnWidths: [24, 130, ...Array(7).fill(25), 35, 35, 30, 45, 45] });
}

export function buildAssetReportTables(data: FinalReportWorksheetData): ReportDataTable[] {
    return [
        worksheetReportTable('WS-14 핵심자산 도출표', ['No', '핵심자산'], data.assets.filter(row => row.type === 'CORE').map((row, index) => [index + 1, row.content]), { columnWidths: [30, 470] }),
        worksheetReportTable('WS-14 보완자산 도출표', ['필요 항목', '해결방안'], data.assets.filter(row => row.type === 'COMPLEMENTARY').map(row => [row.category, row.content]), { columnWidths: [180, 320] }),
    ];
}

const YEARS = ['year1', 'year2', 'year3'] as const;
export const REPORT_YEAR_LABELS = ['1차년도(Y+1)', '2차년도(Y+2)', '3차년도(Y+3)'];
const FUNDING_LABELS: Record<string, string> = { 'R&D 지원금': '연구개발 지원금(R&D)', TIPS: '민간투자주도형 기술창업지원(TIPS)', VC: '벤처캐피털(VC)' };
const fundingLabel = (text: string | null) => FUNDING_LABELS[text ?? ''] ?? text ?? '';

export function buildFundingPlanReportTable(data: FinalReportWorksheetData): ReportDataTable {
    const revenue = data.fundingPlans.find(row => row.category === '매출액' || row.item === '매출액');
    const costs = data.fundingPlans.filter(row => row.category !== '매출액' && row.item !== '매출액' && !`${row.category ?? ''}${row.item ?? ''}`.replace(/\s/g, '').includes('합계'));
    const rows = [...(revenue ? [revenue] : []), ...costs];
    return worksheetReportTable('WS-15 자금소요계획', ['구분', '항목', ...REPORT_YEAR_LABELS], rows.map((row, index) => [
        index > 0 && rows[index - 1].category === row.category ? '' : fundingLabel(row.category), fundingLabel(row.item),
        ...YEARS.map(year => row[year] == null ? '' : formatMoney(row[year])),
    ]), { columnWidths: [80, 155, 90, 90, 90] });
}

export function buildFundingSourceReportTable(data: FinalReportWorksheetData): ReportDataTable {
    const groups = new Map<string, FinalReportWorksheetData['fundingSources']>(['정부자금', '엔젤투자금', '연구개발 지원금(R&D)', '민간투자주도형 기술창업지원(TIPS)', '벤처캐피털(VC)', '기타'].map(category => [category, []]));
    for (const source of data.fundingSources) { const category = fundingLabel(source.category); if (!groups.has(category)) groups.set(category, []); groups.get(category)!.push(source); }
    const rows: Cell[][] = [];
    for (const [category, sources] of groups) {
        if (!sources.length) rows.push([category, '', '', '', '', '', '', '']);
        sources.forEach((source, index) => rows.push([category, index + 1, ...YEARS.flatMap(year => { const value = parseSourceYear(source[year]); return [value.source, value.amount === '' ? '' : formatMoney(value.amount)]; })]));
    }
    const totalIndex = rows.length;
    rows.push(['자금조달 합계', '', ...YEARS.flatMap(year => ['', formatMoney(data.fundingSources.reduce((sum, row) => sum + parseSourceYear(row[year]).amountNumber, 0))])]);
    return worksheetReportTable('WS-16 자금조달계획', ['구분', '세부항목', '출처', '금액', '출처', '금액', '출처', '금액'], rows,
        { headerGroups: [null, null, ...REPORT_YEAR_LABELS.flatMap(label => [label, label])], mergeColumns: [0], columnWidths: [100, 35, 75, 40, 75, 40, 75, 40], columnSpans: [{ row: totalIndex, column: 0, span: 2 }] });
}

export function buildQfdReportTables(data: FinalReportWorksheetData, showTechnicals = true): ReportDataTable[] {
    if (!data.requirements.length) return [];
    const groups = buildTechnicalGroups(data.technicalCharacteristics ?? [], data.techTree);
    const technicals = showTechnicals ? groups.flatMap(group => group.technicals.map(technical => ({ ...technical, group: group.coreNames.join(' · ') || `기술특성 그룹 ${group.groupIndex + 1}` }))) : [];
    const companies = [...new Set((data.benchmarks ?? []).map(row => row.company).filter(company => company !== 'self'))];
    if (!companies.length) companies.push('competitor');
    const label = (company: string) => company === 'competitor' ? '경쟁사' : company;
    const score = (value: number | undefined | null, digits = 1) => value ? value.toFixed(digits) : '-';
    const tables: ReportDataTable[] = [];
    for (let start = 0; start < Math.max(technicals.length, 1); start += 3) {
        const selected = technicals.slice(start, start + 3);
        const rightHeaders = ['가중치', '가중치 백분율', '자사', ...companies.map(label), '기획품질', '수준향상률', '절대중요도', '요구품질 중요도', 'RANK'];
        const headers = ['2차 그룹', '1차 그룹', '항목', ...selected.map(row => row.name), ...rightHeaders];
        const rows: Cell[][] = data.requirements.map(requirement => {
            const result = data.competitiveAssessment.find(row => row.requirementId === requirement.id);
            return [requirement.subcategory, requirement.category, requirement.requirement, ...selected.map(technical => ({ STRONG: '9', MEDIUM: '3', WEAK: '1' }[data.qfdRelationships?.find(row => row.requirementId === requirement.id && row.technicalCharId === technical.id)?.strength ?? ''] ?? '-')),
                (result?.weight ?? 0).toFixed(1), `${(result?.weightPercent ?? 0).toFixed(1)}%`, (result?.selfScore ?? 0) || '-',
                ...companies.map(company => data.benchmarks?.find(row => row.requirementId === requirement.id && row.company === company)?.score || (company === 'competitor' ? result?.competitorScore || '-' : '-')),
                score(result?.planQuality, 0), score(result?.improvementRate, 2), score(result?.absoluteImportance, 2), result?.qualityImportancePercent ? `${result.qualityImportancePercent.toFixed(1)}%` : '-', result?.rank || '-'];
        });
        const columnSpans: NonNullable<ReportDataTable['columnSpans']> = [];
        for (const kind of ['품질중요도', 'RANK']) {
            columnSpans.push({ row: rows.length, column: 0, span: 3 });
            columnSpans.push({ row: rows.length, column: 3 + selected.length + (kind === '품질중요도' ? 2 : 0), span: kind === '품질중요도' ? companies.length + 3 : rightHeaders.length });
            rows.push([kind, '', '', ...selected.map(tech => { const value = data.qfdTechnicals?.find(row => row.technicalCharId === tech.id); return kind === 'RANK' ? value?.rank || '-' : (value?.totalScore ?? 0).toFixed(2); }), ...rightHeaders.map((_, index) => kind === '품질중요도' && index === 0 ? data.competitiveAssessment.reduce((sum, row) => sum + row.weight, 0).toFixed(1) : kind === '품질중요도' && index === 1 ? '100%' : kind === '품질중요도' && index === companies.length + 5 ? data.competitiveAssessment.reduce((sum, row) => sum + row.absoluteImportance, 0).toFixed(1) : '')]);
        }
        for (const footer of buildQfdSpecFooterRows(companies, label)) {
            const row = rows.length;
            if (footer.kind === 'target') columnSpans.push({ row, column: 1, span: 2 });
            columnSpans.push({ row, column: 3 + selected.length, span: rightHeaders.length });
            rows.push(['', footer.kind === 'target' ? '설계 목표치' : 'Spec', footer.rowLabel ?? '', ...selected.map(tech => footer.kind === 'unit' ? tech.unit : footer.kind === 'target' ? tech.targetValue : data.technicalBenchmarks?.find(value => value.technicalCharId === tech.id && value.company === (footer.kind === 'self' ? 'self' : footer.kind === 'competitor' ? footer.company : ''))?.value), ...rightHeaders.map(() => '')]);
        }
        tables.push(worksheetReportTable(showTechnicals ? 'WS-9 QFD 관계 행렬' : 'WS-9 경쟁적 우위요인 평가', headers, rows, { headerGroups: [...Array(3).fill('고객요구사항'), ...selected.map(row => row.group), ...Array(3 + companies.length).fill('중요도 및 경쟁 비교'), ...Array(5).fill('기획품질')], columnWidths: [40, 40, 110, ...selected.map(() => 65), ...rightHeaders.map(() => 34)], mergeColumns: [1, 0], columnSpans }));
    }
    return tables;
}
