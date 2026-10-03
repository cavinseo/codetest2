// 매출액과 소요자금의 연차별 선 그래프와 성장·손익분기 정보를 표시한다.
import { useId } from 'react';
import { buildFundingTrend, type FundingTrendInput } from '@/lib/funding-trend';

const BLUE = '#477fc1';
const RED = '#c84949';
const amountLabel = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

export default function FundingPlanChart({ values }: { values: FundingTrendInput[] }) {
    const titleId = useId();
    const { years, breakEvenPoints } = buildFundingTrend(values);
    const amounts = values.flatMap(({ revenue, required }) => revenue === null ? [required] : [revenue, required]);
    const minimum = Math.min(0, ...amounts);
    const maximum = Math.max(0, ...amounts);
    const span = maximum - minimum || 1;
    const roughStep = span / 5;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const step = ([1, 2, 5, 10].find(value => value * magnitude >= roughStep) ?? 10) * magnitude;
    const lower = Math.floor(minimum / step) * step;
    const upper = Math.ceil((maximum + span * 0.15) / step) * step;
    const ticks = Array.from({ length: Math.round((upper - lower) / step) + 1 }, (_, index) => lower + step * index);
    const plot = { left: 110, right: 770, top: 70, bottom: 370 };
    const x = (year: number) => plot.left + (year - 0.5) * (plot.right - plot.left) / years.length;
    const y = (amount: number) => plot.bottom - (amount - lower) / (upper - lower) * (plot.bottom - plot.top);
    const path = (field: 'revenue' | 'required') => years.map((point, index) => point[field] === null ? ''
        : `${index === 0 || years[index - 1][field] === null ? 'M' : 'L'}${x(point.year)},${y(point[field])}`).join(' ');
    const hasMissingRevenue = years.some(point => point.revenue === null);
    const hasAmounts = amounts.some(amount => amount !== 0);
    const first = years[0];
    const breakEvenMessage = !hasAmounts
        ? '매출액과 소요자금을 입력하면 손익분기점을 확인할 수 있습니다.'
        : breakEvenPoints.length > 0
            ? '매출액과 소요자금이 같아지는 지점을 그래프에 표시했습니다.'
            : first?.balance != null && first.balance > 0
                ? 'Y+1년차부터 매출액이 소요자금을 초과합니다. 표시 기간에 손익분기 교차점은 없습니다.'
                : hasMissingRevenue
                    ? '입력된 연도에서 손익분기 교차점이 확인되지 않았습니다.'
                    : years.some(point => point.balance !== null && point.balance < 0)
                        ? '3개년 계획 내 손익분기점에 도달하지 못했습니다.'
                        : '표시 기간에 손익분기 교차점은 없습니다.';

    return (
        <section className="card min-w-0" aria-label="매출 성장 및 손익분기 분석">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-white">매출액·소요자금 추이 및 손익분기점</h3>
                <span className="text-xs text-gray-500">단위: 백만원</span>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <svg viewBox="0 0 840 430" className="mx-auto block w-full min-w-[600px] max-w-[1000px]" role="img" aria-labelledby={titleId}
                    fontFamily={'"Noto Sans KR", "Malgun Gothic", sans-serif'}>
                    <title id={titleId}>연차별 매출액과 소요자금 합계 비교 선 그래프</title>
                    <rect width="840" height="430" fill="white" />
                    <g fontSize="14" fill="#1e293b">
                        <line x1="250" y1="28" x2="285" y2="28" stroke={BLUE} strokeWidth="3" />
                        <path d="M267,23 L272,28 L267,33 L262,28 Z" fill={BLUE} />
                        <text x="293" y="33">매출액</text>
                        <line x1="385" y1="28" x2="420" y2="28" stroke={RED} strokeWidth="3" />
                        <rect x="399" y="24" width="8" height="8" fill={RED} />
                        <text x="428" y="33">소요자금 합계</text>
                        <circle cx="597" cy="28" r="6" fill="white" stroke="#0f766e" strokeWidth="2" />
                        <text x="611" y="33">손익분기점</text>
                    </g>
                    {ticks.map(tick => (
                        <g key={tick}>
                            <line x1={plot.left} y1={y(tick)} x2={plot.right} y2={y(tick)} stroke="#cbd5e1" />
                            <text x={plot.left - 12} y={y(tick) + 5} textAnchor="end" fill="#334155" fontSize="13">{amountLabel(tick)}</text>
                        </g>
                    ))}
                    <line x1={plot.left} y1={plot.top} x2={plot.left} y2={plot.bottom} stroke="#64748b" />
                    <line x1={plot.left} y1={y(0)} x2={plot.right} y2={y(0)} stroke="#64748b" />
                    {years.map(point => <text key={point.year} x={x(point.year)} y="405" textAnchor="middle" fill="#334155" fontSize="14">{point.label}</text>)}
                    <path data-series="revenue" d={path('revenue')} fill="none" stroke={BLUE} strokeWidth="3" />
                    <path data-series="required" d={path('required')} fill="none" stroke={RED} strokeWidth="3" />
                    {years.map(point => {
                        const revenueAbove = point.revenue === null || point.revenue >= point.required;
                        return <g key={point.year} fontSize="13" fontWeight="600" textAnchor="middle">
                            {point.revenue !== null && <g data-revenue-point={point.year}>
                                <path d={`M${x(point.year)},${y(point.revenue) - 5} l5,5 l-5,5 l-5,-5 Z`} fill={BLUE} />
                                <text x={x(point.year)} y={y(point.revenue) + (revenueAbove ? -14 : 23)} fill={BLUE}>{amountLabel(point.revenue)}</text>
                                <title>{point.label} 매출액 {amountLabel(point.revenue)}백만원</title>
                            </g>}
                            <rect x={x(point.year) - 4} y={y(point.required) - 4} width="8" height="8" fill={RED} />
                            <text x={x(point.year)} y={y(point.required) + (revenueAbove ? 23 : -14)} fill={RED}>{amountLabel(point.required)}</text>
                            <title>{point.label} 소요자금 합계 {amountLabel(point.required)}백만원</title>
                        </g>;
                    })}
                    {breakEvenPoints.map((point, index) => <g key={point.year} data-break-even={point.year}>
                        <line x1={x(point.year)} y1={y(point.amount)} x2={x(point.year)} y2={plot.bottom} stroke="#0f766e" strokeDasharray="5 4" />
                        <circle cx={x(point.year)} cy={y(point.amount)} r="8" fill="white" stroke="#0f766e" strokeWidth="2" />
                        <text x={x(point.year)} y={y(point.amount) + 4} textAnchor="middle" fontSize="11" fill="#0f766e">{index + 1}</text>
                        <title>손익분기점 {index + 1}{point.estimated ? ' (추정)' : ''}, Y+{amountLabel(point.year)}년차, {amountLabel(point.amount)}백만원</title>
                    </g>)}
                </svg>
            </div>
            <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm text-right" aria-label="연차별 매출 성장과 자금 차액">
                    <thead><tr className="border-b border-white/10 text-gray-400"><th className="px-3 py-2 text-left">구분 (백만원)</th>{years.map(point => <th key={point.year} className="px-3 py-2">{point.label}</th>)}</tr></thead>
                    <tbody className="text-white">
                        <tr><th className="px-3 py-2 text-left font-medium">매출액</th>{years.map(point => <td key={point.year} className="px-3 py-2">{point.revenue === null ? '미입력' : amountLabel(point.revenue)}</td>)}</tr>
                        <tr><th className="px-3 py-2 text-left font-medium">소요자금 합계</th>{years.map(point => <td key={point.year} className="px-3 py-2">{amountLabel(point.required)}</td>)}</tr>
                        <tr><th className="px-3 py-2 text-left font-medium">매출 증가율 (전년 대비)</th>{years.map(point => <td key={point.year} className="px-3 py-2">{point.year === 1 ? '기준 연도' : point.growthPercent === null ? '산출 불가' : `${point.growthPercent > 0 ? '+' : ''}${amountLabel(point.growthPercent)}%`}</td>)}</tr>
                        <tr className="border-t border-white/10"><th className="px-3 py-2 text-left font-medium">매출액 − 소요자금</th>{years.map(point => <td key={point.year} className={`px-3 py-2 font-semibold ${point.balance !== null && point.balance < 0 ? 'text-rose-300' : 'text-cyan-200'}`}>{point.balance === null ? '미입력' : `${point.balance > 0 ? '+' : ''}${amountLabel(point.balance)}`}</td>)}</tr>
                    </tbody>
                </table>
            </div>
            <div className="mt-4 space-y-1 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100" aria-live="polite">
                <p>{breakEvenMessage}</p>
                {breakEvenPoints.map((point, index) => <p key={point.year}>손익분기점 {index + 1}{point.estimated ? ' (추정)' : ''} · Y+{amountLabel(point.year)}년차 · {amountLabel(point.amount)}백만원</p>)}
                {hasMissingRevenue && <p>미입력 매출은 그래프에서 제외합니다. 전체 추이는 3개년 매출 입력 후 확인할 수 있습니다.</p>}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-500">자금계획 기준 손익분기점은 해당 연도 매출액과 소요자금 합계가 같아지는 지점입니다. 연도 사이 교차점은 직선으로 연결한 추정치이며, 누적 투자금 회수 시점과는 다릅니다. 전년 매출이 0 이하이거나 미입력이면 증가율을 산출하지 않습니다.</p>
        </section>
    );
}
