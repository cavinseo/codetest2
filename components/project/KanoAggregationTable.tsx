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
    kanoWeight?: number | null;
    timkoCategory?: string | null;
}

interface KanoAggregationTableProps {
    analysis: AnalysisResult[];
    projectId?: string;
    onWeightsSaved?: () => void | Promise<void>;
}

export function translateKanoCategory(cat: KanoCategory): string {
    switch (cat) {
        case 'M': return '당연적';
        case 'O': return '일원적';
        case 'A': return '매력적';
        case 'I': return '무관심';
        case 'R': return '역품질';
        case 'Q': return '회의적';
        default: return '알 수 없음';
    }
}

function kanoBadgeClass(cat: KanoCategory): string {
    switch (cat) {
        case 'A': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
        case 'O': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
        case 'M': return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
        case 'R': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
        case 'Q': return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30';
        default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
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

function countCell(value: number) {
    return value || '';
}

export default function KanoAggregationTable({ analysis, projectId, onWeightsSaved }: KanoAggregationTableProps) {
    const saveWeight = async (requirementId: string, rawValue: string) => {
        if (!projectId) return;
        const trimmed = rawValue.trim();
        const kanoWeight = trimmed === '' ? null : Number(trimmed);

        if (kanoWeight !== null && (!Number.isFinite(kanoWeight) || kanoWeight < 0 || kanoWeight > 5)) {
            window.alert('가중치는 0부터 5 사이의 숫자로 입력해주세요.');
            return;
        }

        const res = await fetch(`/api/projects/${projectId}/kano/analysis`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weights: [{ requirementId, kanoWeight }] }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => null);
            window.alert(data?.error || '가중치 저장에 실패했습니다.');
            return;
        }

        await onWeightsSaved?.();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-center lg:justify-between">
                <h3 className="text-xl font-bold text-white">KANO분석 집계표</h3>
                <div className="flex flex-wrap gap-4 text-xs">
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-gray-400">매력적(A)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-gray-400">일원적(O)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /><span className="text-gray-400">당연적(M)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full text-purple-400 font-bold">R</span><span className="text-gray-400">역품질(R)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-500" /><span className="text-gray-400">무관심(I)</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" /><span className="text-gray-400">회의적(Q)</span></div>
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
                                <th rowSpan={2} className="px-4 py-4 text-cyan-400 font-bold">가중치</th>
                                <th rowSpan={2} className="px-4 py-4 text-primary-300 font-bold">KANO<br />분석결과</th>
                                <th rowSpan={2} className="px-4 py-4 text-amber-400 font-bold">TIMKO<br />분석결과</th>
                            </tr>
                            <tr className="text-[11px] text-gray-500 tracking-wider bg-white/[0.02]">
                                <th className="px-2 py-2">매력적<br />(A)</th>
                                <th className="px-2 py-2">일원적<br />(O)</th>
                                <th className="px-2 py-2">당연적<br />(M)</th>
                                <th className="px-2 py-2">역품질<br />(R)</th>
                                <th className="px-2 py-2">무관심<br />(I)</th>
                                <th className="px-2 py-2">회의적<br />(Q)</th>
                                <th className="px-2 py-2 bg-white/[0.04] font-bold text-white">합계</th>
                            </tr>
                        </thead>
                        <tbody>
                            {analysis.map((item, idx) => {
                                const kanoCategory = item.aggregated.dominantCategory;
                                const timkoLabel = item.timkoCategory ?? '가중치 입력';

                                return (
                                    <tr key={item.requirementId} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                        <td className="px-4 py-3 text-left text-white font-medium border-r border-white/5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px]">
                                            {item.requirementName || `요구사항 ${idx + 1}`}
                                        </td>
                                        <td className="px-2 py-3 text-emerald-300 font-medium">{countCell(item.aggregated.A)}</td>
                                        <td className="px-2 py-3 text-blue-300 font-medium">{countCell(item.aggregated.O)}</td>
                                        <td className="px-2 py-3 text-rose-300 font-medium">{countCell(item.aggregated.M)}</td>
                                        <td className="px-2 py-3 text-purple-300">{countCell(item.aggregated.R)}</td>
                                        <td className="px-2 py-3 text-gray-400">{countCell(item.aggregated.I)}</td>
                                        <td className="px-2 py-3 text-yellow-300">{countCell(item.aggregated.Q)}</td>
                                        <td className="px-2 py-3 bg-white/[0.02] text-white font-mono">{item.aggregated.total}</td>
                                        <td className="px-4 py-3 border-l border-white/5 text-emerald-400 font-mono font-bold">{item.better.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-rose-400 font-mono font-bold">{item.worse.toFixed(2)}</td>
                                        <td className="px-3 py-3">
                                            <input
                                                type="number"
                                                min="0"
                                                max="5"
                                                step="0.1"
                                                defaultValue={item.kanoWeight ?? ''}
                                                onBlur={(event) => saveWeight(item.requirementId, event.currentTarget.value)}
                                                disabled={!projectId}
                                                className="w-20 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-center text-cyan-200 outline-none transition-colors focus:border-cyan-400/70 disabled:opacity-60"
                                                placeholder="입력"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${kanoBadgeClass(kanoCategory)}`}>
                                                {translateKanoCategory(kanoCategory)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${timkoBadgeClass(item.timkoCategory)}`}>
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
