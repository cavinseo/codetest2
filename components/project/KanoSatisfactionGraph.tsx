'use client';

import { useMemo } from 'react';

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
    const width = 720;
    const height = 750;
    const margin = { top: 64, right: 56, bottom: 150, left: 78 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const xAxisY = height - margin.bottom;
    const yAxisX = margin.left;
    const quadrantColors = {
        attractive: '#10b981',
        oneDimensional: '#3b82f6',
        mustBe: '#ef4444',
        indifferent: '#6b7280',
    };
    const xAxisTicks = [
        '-1.0\n~-0.91',
        '-0.9\n~-0.81',
        '-0.8\n~-0.71',
        '-0.7\n~-0.61',
        '-0.6\n~-0.50',
        '-0.49\n~-0.41',
        '-0.4\n~-0.31',
        '-0.3\n~-0.21',
        '-0.2\n~-0.11',
        '-0.1\n~0.0',
    ];
    const yAxisTicks = [
        '1.0\n~0.91',
        '0.9\n~0.81',
        '0.8\n~0.71',
        '0.7\n~0.61',
        '0.6\n~0.50',
        '0.49\n~0.41',
        '0.4\n~0.31',
        '0.3\n~0.21',
        '0.2\n~0.11',
        '0.1\n~0.0',
    ];

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
                        className="mx-auto block bg-surface-800/50 rounded-2xl border border-white/10"
                    >
                        {/* 배경 격자 및 사분면 컬러 */}
                        <g opacity="0.05">
                            <rect x={yAxisX + plotWidth / 2} y={margin.top} width={plotWidth / 2} height={plotHeight / 2} fill={quadrantColors.attractive} />
                            <rect x={yAxisX} y={margin.top} width={plotWidth / 2} height={plotHeight / 2} fill={quadrantColors.oneDimensional} />
                            <rect x={yAxisX} y={margin.top + plotHeight / 2} width={plotWidth / 2} height={plotHeight / 2} fill={quadrantColors.mustBe} />
                            <rect x={yAxisX + plotWidth / 2} y={margin.top + plotHeight / 2} width={plotWidth / 2} height={plotHeight / 2} fill={quadrantColors.indifferent} />
                        </g>

                        {/* 메인 축 */}
                        <line x1={yAxisX} y1={xAxisY} x2={yAxisX + plotWidth} y2={xAxisY} stroke="#64748b" strokeWidth="2" />
                        <line x1={yAxisX} y1={margin.top} x2={yAxisX} y2={xAxisY} stroke="#64748b" strokeWidth="2" />

                        {/* 중앙 기준선 (0.5) */}
                        <line x1={yAxisX + plotWidth / 2} y1={margin.top} x2={yAxisX + plotWidth / 2} y2={xAxisY} stroke="#475569" strokeDasharray="4" />
                        <line x1={yAxisX} y1={margin.top + plotHeight / 2} x2={yAxisX + plotWidth} y2={margin.top + plotHeight / 2} stroke="#475569" strokeDasharray="4" />

                        <g stroke="#334155" strokeWidth="1" opacity="0.55">
                            {xAxisTicks.map((_, idx) => {
                                const x = yAxisX + ((idx + 1) * plotWidth) / 10;
                                return <line key={`x-grid-${idx}`} x1={x} y1={margin.top} x2={x} y2={xAxisY} />;
                            })}
                            {yAxisTicks.map((_, idx) => {
                                const y = margin.top + ((idx + 1) * plotHeight) / 10;
                                return <line key={`y-grid-${idx}`} x1={yAxisX} y1={y} x2={yAxisX + plotWidth} y2={y} />;
                            })}
                        </g>

                        <g fill="#cbd5e1" fontSize="11">
                            {xAxisTicks.map((label, idx) => {
                                const x = yAxisX + ((idx + 0.5) * plotWidth) / 10;
                                const [top, bottom] = label.split('\n');
                                return (
                                    <text key={label} x={x} y={xAxisY + 24} textAnchor="middle">
                                        <tspan x={x}>{top}</tspan>
                                        <tspan x={x} dy="14">{bottom}</tspan>
                                    </text>
                                );
                            })}
                            {yAxisTicks.map((label, idx) => {
                                const y = margin.top + ((idx + 0.5) * plotHeight) / 10;
                                const [top, bottom] = label.split('\n');
                                return (
                                    <text key={label} x={yAxisX - 12} y={y - 5} textAnchor="end">
                                        <tspan x={yAxisX - 12}>{top}</tspan>
                                        <tspan x={yAxisX - 12} dy="14">{bottom}</tspan>
                                    </text>
                                );
                            })}
                        </g>

                        <text x={yAxisX + plotWidth / 2} y={height - 26} textAnchor="middle" fill="#e2e8f0" fontSize="14" fontWeight="700">불만족 계수</text>
                        <text x={28} y={margin.top + plotHeight / 2} textAnchor="middle" fill="#e2e8f0" fontSize="14" fontWeight="700" transform={`rotate(-90, 28, ${margin.top + plotHeight / 2})`}>만족 계수</text>

                        {/* 사분면 이름 */}
                        <text x={yAxisX + plotWidth - 150} y={margin.top + 30} fill={quadrantColors.attractive} fontSize="13" fontWeight="700" opacity="0.95">1사분면: 매력적 품질</text>
                        <text x={yAxisX + 32} y={margin.top + 30} fill={quadrantColors.oneDimensional} fontSize="13" fontWeight="700" opacity="0.95">2사분면: 일원적 품질</text>
                        <text x={yAxisX + 32} y={xAxisY - 28} fill={quadrantColors.mustBe} fontSize="13" fontWeight="700" opacity="0.95">3사분면: 당연적 품질</text>
                        <text x={yAxisX + plotWidth - 165} y={xAxisY - 28} fill={quadrantColors.indifferent} fontSize="13" fontWeight="700" opacity="0.95">4사분면: 무관심 품질</text>

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
