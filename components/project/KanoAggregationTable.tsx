'use client';

import { KanoCategory } from '@/lib/kano-algorithm';

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
        total: number;
        dominantCategory: KanoCategory;
    };
    better: number;
    worse: number;
    timkoCategory: string;
}

interface KanoAggregationTableProps {
    analysis: AnalysisResult[];
}

export function translateKanoCategory(cat: KanoCategory): string {
    switch (cat) {
        case 'M': return '당연적';
        case 'O': return '일원적';
        case 'A': return '매력적';
        case 'I': return '무관심';
        case 'R': return '역';
        case 'Q': return '회의적';
        default: return '알 수 없음';
    }
}

export default function KanoAggregationTable({ analysis }: KanoAggregationTableProps) {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">KANO분석 집계표</h3>
                <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span><span className="text-gray-400">매력적(A)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span><span className="text-gray-400">일원적(O)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500"></span><span className="text-gray-400">당연적(M)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full text-purple-400 font-bold">R</span><span className="text-gray-400">역(R)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-500"></span><span className="text-gray-400">무관심(I)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full text-amber-500 font-bold">Q</span><span className="text-gray-400">회의적(Q)</span></div>
                </div>
            </div>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center">
                        <thead className="bg-white/[0.04] text-gray-400 border-b border-white/[0.08]">
                            <tr>
                                <th rowSpan={2} className="px-4 py-4 text-left w-64 border-r border-white/5 font-bold">설문항목(요구사항)</th>
                                <th colSpan={7} className="px-4 py-2 border-b border-white/5 font-bold text-primary-400">KANO 응답 집계</th>
                                <th rowSpan={2} className="px-4 py-4 border-l border-white/5 text-emerald-400 font-bold">만족<br />계수</th>
                                <th rowSpan={2} className="px-4 py-4 text-rose-400 font-bold">불만족<br />계수</th>
                                <th rowSpan={2} className="px-4 py-4 text-amber-400 font-bold">KANO<br />분석결과</th>
                            </tr>
                            <tr className="text-[11px] text-gray-500 tracking-wider bg-white/[0.02]">
                                <th className="px-2 py-2">매력적<br/>(A)</th>
                                <th className="px-2 py-2">일원적<br/>(O)</th>
                                <th className="px-2 py-2">당연적<br/>(M)</th>
                                <th className="px-2 py-2">역<br/>(R)</th>
                                <th className="px-2 py-2">무관심<br/>(I)</th>
                                <th className="px-2 py-2">회의적<br/>(Q)</th>
                                <th className="px-2 py-2 bg-white/[0.04] font-bold text-white">합계</th>
                            </tr>
                        </thead>
                        <tbody>
                            {analysis.map((item, idx) => {
                                const total = item.aggregated.A + item.aggregated.O + item.aggregated.M + item.aggregated.R + item.aggregated.I + item.aggregated.Q;
                                return (
                                    <tr key={item.requirementId} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                        <td className="px-4 py-3 text-left text-white font-medium border-r border-white/5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px]">
                                            {item.requirementName || `요구사항 ${idx + 1}`}
                                        </td>
                                        <td className="px-2 py-3 text-emerald-300 font-medium">{item.aggregated.A || ''}</td>
                                        <td className="px-2 py-3 text-blue-300 font-medium">{item.aggregated.O || ''}</td>
                                        <td className="px-2 py-3 text-rose-300 font-medium">{item.aggregated.M || ''}</td>
                                        <td className="px-2 py-3 text-purple-300">{item.aggregated.R || ''}</td>
                                        <td className="px-2 py-3 text-gray-400">{item.aggregated.I || ''}</td>
                                        <td className="px-2 py-3 text-amber-600/70">{item.aggregated.Q || ''}</td>
                                        <td className="px-2 py-3 bg-white/[0.02] text-white font-mono">{total}</td>
                                        
                                        <td className="px-4 py-3 border-l border-white/5 text-emerald-400 font-mono font-bold">{(item.better).toFixed(2)}</td>
                                        <td className="px-4 py-3 text-rose-400 font-mono font-bold">{(item.worse).toFixed(2)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${item.aggregated.dominantCategory === 'A' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                                item.aggregated.dominantCategory === 'O' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                                                    item.aggregated.dominantCategory === 'M' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                                                        item.aggregated.dominantCategory === 'R' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                                                            item.aggregated.dominantCategory === 'I' ? 'bg-gray-500/10 text-gray-400 border-gray-500/30' :
                                                                'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                                }`}>
                                                {translateKanoCategory(item.aggregated.dominantCategory)}
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
