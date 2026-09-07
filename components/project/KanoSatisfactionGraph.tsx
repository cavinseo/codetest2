'use client';

import { useMemo } from 'react';
import TimkoWorksheetGrid from '@/components/TimkoWorksheetGrid';

interface AnalysisResult {
    requirementId: string;
    requirementName?: string;
    better: number;
    worse: number;
    timkoCategory?: string | null;
    quadrant: string;
}

interface KanoSatisfactionGraphProps {
    analysis: AnalysisResult[];
    selectedRequirementId?: string | null;
    onSelectRequirement?: (requirementId: string) => void;
}

const KOREAN_CHART_FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", "Segoe UI", sans-serif';
const quadrantLabels: Record<string, string> = {
    ATTRACTIVE: '매력적 품질',
    ONE_DIMENSIONAL: '일원적 품질',
    MUST_BE: '당연적 품질',
    INDIFFERENT: '무관심 품질',
};

export default function KanoSatisfactionGraph({ analysis, selectedRequirementId, onSelectRequirement }: KanoSatisfactionGraphProps) {
    const width = 1020;
    const height = 800;
    const margin = { top: 70, right: 110, bottom: 80, left: 10 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const yAxisX = margin.left;
    const quadrantColors = {
        attractive: '#10b981',
        oneDimensional: '#3b82f6',
        mustBe: '#ef4444',
        indifferent: '#6b7280',
    };
    const points = useMemo(() => {
        return analysis.map((req) => {
            const normalizedWorse = Math.min(1, Math.max(0, req.worse + 1));
            const x = yAxisX + (normalizedWorse * plotWidth);
            const y = margin.top + ((1 - req.better) * plotHeight);

            return {
                ...req,
                x,
                y,
            };
        });
    }, [analysis, margin.top, plotHeight, plotWidth, yAxisX]);

    return (
        <div className="space-y-8">
            <div className="card items-center justify-center flex flex-col p-8 pb-12">
                <h3 className="text-xl font-bold text-white mb-6">만족/불만족 계수 (Better-Worse) 그래프</h3>
                <div className="relative w-full overflow-x-auto pb-4">
                    <svg
                        width={width}
                        height={height}
                        fontFamily={KOREAN_CHART_FONT}
                        viewBox={`0 0 ${width} ${height}`}
                        className="mx-auto block bg-white"
                    >
                        <TimkoWorksheetGrid x={yAxisX} y={margin.top} width={plotWidth} height={plotHeight} />

                        {/* 데이터 포인트 */}
                        {points.map((p, idx) => {
                            return (
                            <g
                                key={p.requirementId}
                                className="cursor-pointer"
                                onClick={() => onSelectRequirement?.(p.requirementId)}
                            >
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r="12"
                                    fill="transparent"
                                />
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r="6"
                                    fill={p.quadrant === 'ATTRACTIVE' ? quadrantColors.attractive : p.quadrant === 'ONE_DIMENSIONAL' ? quadrantColors.oneDimensional : p.quadrant === 'MUST_BE' ? quadrantColors.mustBe : quadrantColors.indifferent}
                                    stroke="#ffffff"
                                    strokeWidth="2"
                                    className="filter drop-shadow-sm"
                                />
                                <text
                                    x={p.x}
                                    y={p.y + 3}
                                    textAnchor="middle"
                                    fill="#fff"
                                    fontSize="8"
                                    fontWeight="bold"
                                    className="pointer-events-none"
                                >
                                    {idx + 1}
                                </text>
                                <title>{p.requirementName}</title>
                            </g>
                            );
                        })}
                    </svg>
                </div>
                <p className="text-xs text-gray-300 leading-6">
                    좌상단: 일원적 품질 · 우상단: 매력적 품질 · 좌하단: 당연적 품질 · 우하단: 무관심 품질
                </p>
            </div>

            {/* 상세 테이블 */}
            <div className="card overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-white/[0.04]">
                        <tr className="text-gray-400">
                            <th className="px-4 py-3 text-left w-12">No</th>
                            <th className="px-4 py-3 text-left">요구사항</th>
                            <th className="px-4 py-3 text-center">Better (만족)</th>
                            <th className="px-4 py-3 text-center">Worse (불만족)</th>
                            <th className="px-4 py-3 text-center">품질 유형</th>
                        </tr>
                    </thead>
                    <tbody>
                        {analysis.map((item, idx) => {
                            const isSelected = item.requirementId === selectedRequirementId;
                            return (
                                <tr key={item.requirementId} className={`border-t transition-colors ${isSelected ? 'border-amber-400/40 bg-amber-400/[0.12] ring-1 ring-inset ring-amber-400/30' : 'border-white/[0.04] hover:bg-white/[0.02]'}`}>
                                    <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                                    <td className="px-4 py-3 text-white font-medium">{item.requirementName || `요구사항 ${idx + 1}`}</td>
                                    <td className="px-4 py-3 text-center text-emerald-400 font-mono font-bold">{item.better.toFixed(3)}</td>
                                    <td className="px-4 py-3 text-center text-rose-400 font-mono font-bold">{item.worse.toFixed(3)}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.quadrant === 'ATTRACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                                item.quadrant === 'ONE_DIMENSIONAL' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                                                    item.quadrant === 'MUST_BE' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                                                        'bg-gray-500/10 text-gray-400 border-gray-500/30'
                                            }`}>
                                            {quadrantLabels[item.quadrant] || item.quadrant}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
