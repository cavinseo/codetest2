'use client';
// Timko 계수의 방향과 크기를 요구사항별 막대와 계산식으로 표시한다.

interface CoefficientResult {
    requirementId: string;
    requirementName?: string;
    better: number;
    worse: number;
    aggregated?: { A: number; O: number; M: number; I: number };
}

const AXIS_TICKS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
const ZERO_X = 300;
const HALF_WIDTH = 240;
const WORSE_COLOR = '#facc15';
const BETTER_COLOR = '#f97316';

function CoefficientBars({ result, name }: { result: CoefficientResult; name: string }) {
    const worseX = ZERO_X + result.worse * HALF_WIDTH;
    const betterX = ZERO_X + result.better * HALF_WIDTH;
    return (
        <svg viewBox="0 0 600 56" className="block w-full" role="img"
            aria-label={`${name}: 불만족계수 ${result.worse.toFixed(2)}, 만족계수 ${result.better.toFixed(2)}`}>
            {AXIS_TICKS.map(value => (
                <line key={value} x1={ZERO_X + value * HALF_WIDTH} x2={ZERO_X + value * HALF_WIDTH}
                    y1="0" y2="56" stroke={value === 0 ? '#64748b' : '#e2e8f0'} strokeWidth={value === 0 ? 2 : 1} />
            ))}
            <rect data-coefficient="worse" x={worseX} y="8" width={-result.worse * HALF_WIDTH} height="12" fill={WORSE_COLOR} />
            <rect data-coefficient="better" x={ZERO_X} y="30" width={result.better * HALF_WIDTH} height="12" fill={BETTER_COLOR} />
            <text data-capture-chart-label x={worseX - 6} y="18" textAnchor="end" fill="#334155" fontSize="16">{result.worse.toFixed(2)}</text>
            <text data-capture-chart-label x={betterX + 6} y="40" fill="#334155" fontSize="16">{result.better.toFixed(2)}</text>
        </svg>
    );
}

function CoefficientGuide() {
    return (
        <div className="space-y-4 text-sm leading-relaxed">
            <table className="w-full border-collapse text-left">
                <caption className="pb-3 text-base font-semibold text-white">Timko의 고객만족계수</caption>
                <thead>
                    <tr className="border-b border-white/10 text-gray-400">
                        <th scope="col" className="p-2">구분</th>
                        <th scope="col" className="p-2">계산식·범위</th>
                    </tr>
                </thead>
                <tbody className="text-gray-300">
                    <tr className="border-b border-white/10">
                        <th scope="row" className="whitespace-nowrap p-2">만족계수</th>
                        <td className="p-2"><p>(A + O) / (A + O + M + I)</p><p className="mt-1 text-xs text-gray-500">0 ~ +1</p></td>
                    </tr>
                    <tr className="border-b border-white/10">
                        <th scope="row" className="whitespace-nowrap p-2">불만족계수</th>
                        <td className="p-2"><p>−(O + M) / (A + O + M + I)</p><p className="mt-1 text-xs text-gray-500">−1 ~ 0</p></td>
                    </tr>
                </tbody>
            </table>
            <p className="text-gray-400">A 매력적 · O 일원적 · M 당연적 · I 무관심 품질입니다. R(역품질)·Q(회의적) 응답은 계산에서 제외합니다.</p>
            <ul className="list-disc space-y-2 pl-5 text-gray-300">
                <li>모든 유효 응답이 매력적 품질이면 만족 +1, 불만족 0입니다.</li>
                <li>모든 유효 응답이 당연적 품질이면 만족 0, 불만족 −1입니다.</li>
                <li>모든 유효 응답이 일원적 품질이면 만족 +1, 불만족 −1입니다.</li>
                <li>무관심 품질이 많을수록 두 계수 모두 0에 가까워집니다.</li>
            </ul>
            <p className="text-xs text-gray-500">만족계수가 +1에 가까울수록 충족 시 만족 증가가 크고, 불만족계수가 −1에 가까울수록 미충족 시 불만 증가가 큽니다. 계산 대상 응답이 없을 때의 계수 0은 무관심 품질을 뜻하지 않습니다.</p>
        </div>
    );
}

export default function TimkoCoefficientChart({ analysis }: { analysis: CoefficientResult[] }) {
    return (
        <section className="card space-y-5" data-timko-coefficients>
            <h3 className="text-xl font-bold text-white">Timko 만족·불만족 계수</h3>
            <p className="text-sm text-gray-400">고객요구사항 순서대로 만족 증가와 불만 증가의 크기를 비교합니다.</p>
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-300">
                        <span className="inline-flex items-center gap-2"><span className="h-3 w-3" style={{ backgroundColor: WORSE_COLOR }} />불만족계수 (Worse) ←</span>
                        <span className="inline-flex items-center gap-2"><span className="h-3 w-3" style={{ backgroundColor: BETTER_COLOR }} />→ 만족계수 (Better)</span>
                    </div>
                    {analysis.length === 0 ? <p className="py-10 text-center text-gray-500">분석 결과가 없습니다.</p> : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="w-full min-w-[680px] table-fixed text-sm" style={{ color: '#334155' }}>
                                <colgroup><col className="w-[32%]" /><col className="w-[68%]" /></colgroup>
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th scope="col" className="px-4 py-3 text-left">고객요구사항</th>
                                        <th scope="col" className="py-3">
                                            <span className="sr-only">계수 (−1 ~ +1)</span>
                                            <svg viewBox="0 0 600 28" className="block w-full" aria-hidden="true">
                                                {AXIS_TICKS.map(value => <text key={value} data-capture-chart-label x={ZERO_X + value * HALF_WIDTH}
                                                    y="18" textAnchor="middle" fill="#334155" fontSize="16">{value.toFixed(2)}</text>)}
                                            </svg>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analysis.map((result, index) => {
                                        const name = result.requirementName || `요구사항 ${index + 1}`;
                                        const counts = result.aggregated;
                                        const noValidResponses = counts && counts.A + counts.O + counts.M + counts.I === 0;
                                        return (
                                            <tr key={result.requirementId} data-requirement-id={result.requirementId} className="border-b border-slate-200 last:border-0">
                                                <th scope="row" className="break-words px-4 py-3 text-left font-normal leading-relaxed">
                                                    <span className="mr-2 font-semibold">{index + 1}.</span>{name}
                                                </th>
                                                <td>{noValidResponses
                                                    ? <p className="px-4 py-3 text-center text-slate-500">계산 대상 응답 없음</p>
                                                    : <CoefficientBars result={result} name={name} />}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <CoefficientGuide />
            </div>
        </section>
    );
}
