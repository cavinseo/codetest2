'use client';

interface AnalysisResult {
    requirementId: string;
    requirementName?: string;
    aggregated: {
        M: number;
        O: number;
        A: number;
        I: number;
        R: number;
        Q: number;
    };
    better: number;
    worse: number;
    timkoCategory: string;
}

interface KanoTimkoTableProps {
    analysis: AnalysisResult[];
}

export default function KanoTimkoTable({ analysis }: KanoTimkoTableProps) {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">TIMKO 분석 집계표</h3>
                <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500"></span><span className="text-gray-400">당연(M)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span><span className="text-gray-400">일원(O)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span><span className="text-gray-400">매력(A)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-500"></span><span className="text-gray-400">무관심(I)</span></div>
                </div>
            </div>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center">
                        <thead className="bg-white/[0.04]">
                            <tr className="text-gray-400 border-b border-white/[0.08]">
                                <th rowSpan={2} className="px-4 py-4 text-left w-12 border-r border-white/5">No</th>
                                <th rowSpan={2} className="px-4 py-4 text-left border-r border-white/5">설문항목(요구사항)</th>
                                <th colSpan={6} className="px-4 py-2 border-b border-white/5 font-semibold text-primary-400">KANO 분석 집계</th>
                                <th rowSpan={2} className="px-4 py-4 border-l border-white/5 text-emerald-400 font-bold">만족<br />계수</th>
                                <th rowSpan={2} className="px-4 py-4 text-rose-400 font-bold">불만족<br />계수</th>
                                <th rowSpan={2} className="px-4 py-4 text-amber-400 font-bold">품질<br />유형</th>
                            </tr>
                            <tr className="text-[10px] text-gray-500 uppercase tracking-tighter">
                                <th className="px-2 py-2">매력(A)</th>
                                <th className="px-2 py-2">일원(O)</th>
                                <th className="px-2 py-2">당연(M)</th>
                                <th className="px-2 py-2">역(R)</th>
                                <th className="px-2 py-2">무관심(I)</th>
                                <th className="px-2 py-2 bg-white/[0.02]">합계</th>
                            </tr>
                        </thead>
                        <tbody>
                            {analysis.map((item, idx) => {
                                const total = item.aggregated.A + item.aggregated.O + item.aggregated.M + item.aggregated.R + item.aggregated.I + item.aggregated.Q;
                                return (
                                    <tr key={item.requirementId} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                        <td className="px-4 py-3 text-left text-gray-500 border-r border-white/5">{idx + 1}</td>
                                        <td className="px-4 py-3 text-left text-white font-medium border-r border-white/5">{item.requirementName || `요구사항 ${idx + 1}`}</td>
                                        <td className="px-2 py-3 text-emerald-300 font-medium">{item.aggregated.A}</td>
                                        <td className="px-2 py-3 text-blue-300 font-medium">{item.aggregated.O}</td>
                                        <td className="px-2 py-3 text-rose-300 font-medium">{item.aggregated.M}</td>
                                        <td className="px-2 py-3 text-purple-300">{item.aggregated.R}</td>
                                        <td className="px-2 py-3 text-gray-400">{item.aggregated.I}</td>
                                        <td className="px-2 py-3 bg-white/[0.01] text-gray-200 font-mono">{total}</td>
                                        <td className="px-4 py-3 border-l border-white/5 text-emerald-400 font-mono font-bold">{(item.better).toFixed(2)}</td>
                                        <td className="px-4 py-3 text-rose-400 font-mono font-bold">{(item.worse).toFixed(2)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${item.timkoCategory === '매력' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                                    item.timkoCategory === '일원' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                                                        item.timkoCategory === '당연' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                                                            'bg-gray-500/10 text-gray-400 border-gray-500/30'
                                                }`}>
                                                {item.timkoCategory}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 개선 방향 가이드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card bg-blue-500/[0.03] border-blue-500/20">
                    <h4 className="text-sm font-bold text-blue-300 mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        TIMKO 분석법이란?
                    </h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                        Kano 모델을 정량화한 방법으로, 만족계수(Better)와 불만족계수(Worse)를 산출합니다.
                        만족계수가 1에 가까울수록 충족 시 만족도가 급격히 상승하며, 불만족계수가 -1에 가까울수록 미충족 시 불만이 매우 큼을 의미합니다.
                    </p>
                </div>
                <div className="card bg-emerald-500/[0.03] border-emerald-500/20">
                    <h4 className="text-sm font-bold text-emerald-300 mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        품질 개선 전략
                    </h4>
                    <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                        <li><strong className="text-rose-400">당연적(M)</strong>: 최우선적으로 확보해야 하는 최소 요건</li>
                        <li><strong className="text-blue-400">일원적(O)</strong>: 경쟁사와의 성능 차별화가 발생하는 핵심 영역</li>
                        <li><strong className="text-emerald-400">매력적(A)</strong>: 고객에게 Surprise를 제공하는 신규 기회 영역</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
