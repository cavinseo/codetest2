'use client';

import { useMemo } from 'react';

interface Kano2DChartProps {
    requirements: Array<{
        id: string;
        name: string;
        better: number; // 0 to 1
        worse: number; // -1 to 0
        category: string;
    }>;
}

export default function Kano2DChart({ requirements }: Kano2DChartProps) {
    const categoryColors: Record<string, string> = {
        M: '#ef4444', // red
        O: '#3b82f6', // blue
        A: '#10b981', // green
        I: '#6b7280', // gray
        R: '#a855f7', // purple
        Q: '#eab308', // yellow
    };

    // SVG 크기
    const width = 600;
    const height = 600;
    const padding = 60;

    // 요구사항의 위치 계산
    const points = useMemo(() => {
        return requirements.map((req) => {
            // Better: 0 to 1 -> x축 (왼쪽에서 오른쪽)
            // Worse: -1 to 0 -> y축 (아래에서 위로, 음수이므로 절대값 사용)
            const x = padding + (req.better * (width - 2 * padding));
            const y = height - padding - (Math.abs(req.worse) * (height - 2 * padding));

            return {
                ...req,
                x,
                y,
                color: categoryColors[req.category] || categoryColors.I,
            };
        });
    }, [requirements]);

    return (
        <div className="relative">
            <svg
                width={width}
                height={height}
                className="bg-gray-800/30 rounded-lg border border-white/10"
            >
                {/* 사분면 배경 */}
                <g opacity="0.1">
                    {/* LOW_IMPACT (좌하) */}
                    <rect
                        x={padding}
                        y={height / 2}
                        width={(width - 2 * padding) / 2}
                        height={(height - 2 * padding) / 2}
                        fill="#6b7280"
                    />
                    {/* PERFORMANCE (우하) */}
                    <rect
                        x={width / 2}
                        y={height / 2}
                        width={(width - 2 * padding) / 2}
                        height={(height - 2 * padding) / 2}
                        fill="#3b82f6"
                    />
                    {/* EXCITEMENT (좌상) */}
                    <rect
                        x={padding}
                        y={padding}
                        width={(width - 2 * padding) / 2}
                        height={(height - 2 * padding) / 2}
                        fill="#10b981"
                    />
                    {/* HIGH_IMPACT (우상) */}
                    <rect
                        x={width / 2}
                        y={padding}
                        width={(width - 2 * padding) / 2}
                        height={(height - 2 * padding) / 2}
                        fill="#ef4444"
                    />
                </g>

                {/* 축 */}
                <g stroke="#4b5563" strokeWidth="2">
                    {/* X축 */}
                    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
                    {/* Y축 */}
                    <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
                </g>

                {/* 중심선 */}
                <g stroke="#6b7280" strokeWidth="1" strokeDasharray="4">
                    <line x1={width / 2} y1={padding} x2={width / 2} y2={height - padding} />
                    <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} />
                </g>

                {/* 축 레이블 */}
                <text x={width / 2} y={height - 20} textAnchor="middle" fill="#9ca3af" fontSize="12">
                    Better (만족도 증가) →
                </text>
                <text
                    x={20}
                    y={height / 2}
                    textAnchor="middle"
                    fill="#9ca3af"
                    fontSize="12"
                    transform={`rotate(-90, 20, ${height / 2})`}
                >
                    ← Worse (불만 증가)
                </text>

                {/* 사분면 라벨 */}
                <text x={padding + 20} y={padding + 20} fill="#9ca3af" fontSize="11" opacity="0.6">
                    흥분형
                </text>
                <text x={width - padding - 60} y={padding + 20} fill="#9ca3af" fontSize="11" opacity="0.6">
                    높은 영향력
                </text>
                <text x={padding + 20} y={height - padding - 10} fill="#9ca3af" fontSize="11" opacity="0.6">
                    낮은 영향력
                </text>
                <text x={width - padding - 50} y={height - padding - 10} fill="#9ca3af" fontSize="11" opacity="0.6">
                    성능형
                </text>

                {/* 데이터 포인트 */}
                {points.map((point, idx) => (
                    <g key={point.id}>
                        <circle
                            cx={point.x}
                            cy={point.y}
                            r="8"
                            fill={point.color}
                            opacity="0.8"
                            stroke="white"
                            strokeWidth="2"
                            className="cursor-pointer hover:opacity-100"
                        >
                            <title>{point.name}</title>
                        </circle>
                        <text
                            x={point.x}
                            y={point.y - 12}
                            textAnchor="middle"
                            fill="#e5e7eb"
                            fontSize="10"
                        >
                            {idx + 1}
                        </text>
                    </g>
                ))}
            </svg>

            {/* 범례 */}
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
                {Object.entries(categoryColors).map(([cat, color]) => (
                    <div key={cat} className="flex items-center gap-1.5">
                        <div
                            className="w-3 h-3 rounded-full border-2 border-white"
                            style={{ backgroundColor: color }}
                        />
                        <span className="text-gray-300">{cat}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
