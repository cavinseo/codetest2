'use client';

import { useMemo } from 'react';

interface AnalysisResult {
    requirementId: string;
    requirementName?: string;
    better: number;
    worse: number;
    timkoCategory: string;
    quadrant: string;
}

interface KanoSatisfactionGraphProps {
    analysis: AnalysisResult[];
}

export default function KanoSatisfactionGraph({ analysis }: KanoSatisfactionGraphProps) {
    // SVG 크기
    const width = 600;
    const height = 600;
    const padding = 60;

    const points = useMemo(() => {
        return analysis.map((req) => {
            // Better: 0 to 1 -> x축 (가로)
            // Worse: -1 to 0 -> y축 (세로, 위가 0, 아래가 -1이므로 절대값 사용하거나 반대로 매핑)
            const x = padding + (req.better * (width - 2 * padding));
            const y = height - padding - (Math.abs(req.worse) * (height - 2 * padding));

            return {
                ...req,
                x,
                y,
            };
        });
    }, [analysis]);

    return (
        <div className="space-y-8">
            <div className="card items-center justify-center flex flex-col p-8">
                <h3 className="text-xl font-bold text-white mb-6">만족/불만족 계수 (Better-Worse) 그래프</h3>
                <div className="relative">
                    <svg
                        width={width}
                        height={height}
                        className="bg-surface-800/50 rounded-2xl border border-white/10"
                    >
                        {/* 배경 격자 및 사분면 컬러 */}
                        <g opacity="0.05">
                            {/* 매력적 (좌상) - 실제로는 Better 높음/Worse 낮음이므로 오른쪽 위 영역이지만 Kano 2D와 다름에 주의 */}
                            {/* 여기서는 일반적인 4분면 논리: 중앙 0.5선 기준 */}
                            <rect x={padding} y={padding} width={(width - 2 * padding) / 2} height={(height - 2 * padding) / 2} fill="#10b981" />
                            <rect x={width / 2} y={padding} width={(width - 2 * padding) / 2} height={(height - 2 * padding) / 2} fill="#ef4444" />
                            <rect x={padding} y={height / 2} width={(width - 2 * padding) / 2} height={(height - 2 * padding) / 2} fill="#6b7280" />
                            <rect x={width / 2} y={height / 2} width={(width - 2 * padding) / 2} height={(height - 2 * padding) / 2} fill="#3b82f6" />
                        </g>

                        {/* 메인 축 */}
                        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#64748b" strokeWidth="2" />
                        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#64748b" strokeWidth="2" />

                        {/* 중앙 임계선 (0.5) */}
                        <line x1={width / 2} y1={padding} x2={width / 2} y2={height - padding} stroke="#475569" strokeDasharray="4" />
                        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#475569" strokeDasharray="4" />

                        {/* 축 레이블 */}
                        <text x={width - padding + 10} y={height - padding} dominantBaseline="middle" fill="#94a3b8" fontSize="12">Better</text>
                        <text x={padding} y={padding - 15} textAnchor="middle" fill="#94a3b8" fontSize="12">|Worse|</text>

                        {/* 수치 눈금 */}
                        {[0, 0.25, 0.5, 0.75, 1.0].map(val => (
                            <g key={val}>
                                <text x={padding + (val * (width - 2 * padding))} y={height - padding + 20} textAnchor="middle" fill="#475569" fontSize="10">{val}</text>
                                <text x={padding - 20} y={height - padding - (val * (height - 2 * padding))} dominantBaseline="middle" textAnchor="end" fill="#475569" fontSize="10">{val}</text>
                            </g>
                        ))}

                        {/* 사분면 이름 */}
                        <text x={padding + 30} y={padding + 30} fill="#10b981" fontSize="11" opacity="0.8">흥분형(Attractive)</text>
                        <text x={width - padding - 80} y={padding + 30} fill="#ef4444" fontSize="11" opacity="0.8">일원적(One-dimensional)</text>
                        <text x={padding + 30} y={height - padding - 20} fill="#94a3b8" fontSize="11" opacity="0.8">무관심(Indifferent)</text>
                        <text x={width - padding - 80} y={height - padding - 20} fill="#3b82f6" fontSize="11" opacity="0.8">당연적(Must-be)</text>

                        {/* 데이터 포인트 */}
                        {points.map((p, idx) => (
                            <g key={p.requirementId} className="group cursor-pointer">
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r="6"
                                    fill={p.quadrant === 'ATTRACTIVE' ? '#10b981' : p.quadrant === 'ONE_DIMENSIONAL' ? '#ef4444' : p.quadrant === 'MUST_BE' ? '#3b82f6' : '#64748b'}
                                    stroke="#ffffff"
                                    strokeWidth="2"
                                    className="filter drop-shadow-sm transition-transform hover:scale-150"
                                />
                                <text
                                    x={p.x}
                                    y={p.y - 12}
                                    textAnchor="middle"
                                    fill="#0f172a"
                                    stroke="#ffffff"
                                    strokeWidth="3"
                                    paintOrder="stroke"
                                    fontSize="10"
                                    fontWeight="bold"
                                >
                                    {idx + 1}
                                </text>
                                <title>{p.requirementName || `요구사항 ${idx + 1}`}</title>
                            </g>
                        ))}
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
                            <th className="px-4 py-3 text-center">Worse (불만)</th>
                            <th className="px-4 py-3 text-center">품질 유형</th>
                        </tr>
                    </thead>
                    <tbody>
                        {analysis.map((item, idx) => (
                            <tr key={item.requirementId} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                                <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                                <td className="px-4 py-3 text-white font-medium">{item.requirementName || `요구사항 ${idx + 1}`}</td>
                                <td className="px-4 py-3 text-center text-emerald-400 font-mono font-bold">{item.better.toFixed(3)}</td>
                                <td className="px-4 py-3 text-center text-rose-400 font-mono font-bold">{item.worse.toFixed(3)}</td>
                                <td className="px-4 py-3 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.quadrant === 'ATTRACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                            item.quadrant === 'ONE_DIMENSIONAL' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                                                item.quadrant === 'MUST_BE' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                                                    'bg-gray-500/10 text-gray-400 border-gray-500/30'
                                        }`}>
                                        {item.quadrant}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
