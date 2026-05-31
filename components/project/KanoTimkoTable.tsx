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
    timkoCategory?: string | null;
}

interface KanoTimkoTableProps {
    analysis: AnalysisResult[];
}

function timkoBadgeClass(category?: string | null): string {
    switch (category) {
        case '매력': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
        case '일원': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
        case '당연': return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
        case '무관심': return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
        default: return 'bg-white/[0.04] text-gray-400 border-white/10';
    }
}

export default function KanoTimkoTable({ analysis }: KanoTimkoTableProps) {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-center lg:justify-between">
                <h3 className="text-xl font-bold text-white">TIMKO 분석 집계표</h3>
                <div className="flex flex-wrap gap-4 text-xs">
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-gray-400">매력</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-gray-400">일원</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /><span className="text-gray-400">당연</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-500" /><span className="text-gray-400">무관심</span></div>
                </div>
            </div>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center">
                        <thead className="bg-white/[0.04]">
                            <tr className="text-gray-400 border-b border-white/[0.08]">
                                <th rowSpan={2} className="px-4 py-4 text-left w-12 border-r border-white/5">No</th>
                                <th rowSpan={2} className="px-4 py-4 text-left border-r border-white/5">설문항목(요구사항)</th>
                                <th colSpan={7} className="px-4 py-2 border-b border-white/5 font-semibold text-primary-400">KANO 응답 집계</th>
                                <th rowSpan={2} className="px-4 py-4 border-l border-white/5 text-emerald-400 font-bold">만족<br />계수</th>
                                <th rowSpan={2} className="px-4 py-4 text-rose-400 font-bold">불만족<br />계수</th>
                                <th rowSpan={2} className="px-4 py-4 text-amber-400 font-bold">TIMKO<br />분석결과</th>
                            </tr>
                            <tr className="text-[10px] text-gray-500 uppercase tracking-tighter">
                                <th className="px-2 py-2">매력(A)</th>
                                <th className="px-2 py-2">일원(O)</th>
                                <th className="px-2 py-2">당연(M)</th>
                                <th className="px-2 py-2">역(R)</th>
                                <th className="px-2 py-2">무관심(I)</th>
                                <th className="px-2 py-2">회의(Q)</th>
                                <th className="px-2 py-2 bg-white/[0.02]">합계</th>
                            </tr>
                        </thead>
                        <tbody>
                            {analysis.map((item, idx) => {
                                const total = item.aggregated.A + item.aggregated.O + item.aggregated.M + item.aggregated.R + item.aggregated.I + item.aggregated.Q;
                                const timkoLabel = item.timkoCategory ?? '가중치 입력';

                                return (
                                    <tr key={item.requirementId} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                        <td className="px-4 py-3 text-left text-gray-500 border-r border-white/5">{idx + 1}</td>
                                        <td className="px-4 py-3 text-left text-white font-medium border-r border-white/5">{item.requirementName || `요구사항 ${idx + 1}`}</td>
                                        <td className="px-2 py-3 text-emerald-300 font-medium">{item.aggregated.A}</td>
                                        <td className="px-2 py-3 text-blue-300 font-medium">{item.aggregated.O}</td>
                                        <td className="px-2 py-3 text-rose-300 font-medium">{item.aggregated.M}</td>
                                        <td className="px-2 py-3 text-purple-300">{item.aggregated.R}</td>
                                        <td className="px-2 py-3 text-gray-400">{item.aggregated.I}</td>
                                        <td className="px-2 py-3 text-yellow-300">{item.aggregated.Q}</td>
                                        <td className="px-2 py-3 bg-white/[0.01] text-gray-200 font-mono">{total}</td>
                                        <td className="px-4 py-3 border-l border-white/5 text-emerald-400 font-mono font-bold">{item.better.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-rose-400 font-mono font-bold">{item.worse.toFixed(2)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${timkoBadgeClass(item.timkoCategory)}`}>
                                                {timkoLabel}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
