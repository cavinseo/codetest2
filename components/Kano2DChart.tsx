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

    // 요구사항의 위치 계산 (표준 TIMKO 엑셀 파일 형식 기준)
    const points = useMemo(() => {
        return requirements.map((req) => {
            // X축: 불만족계수 (Worse의 절대값, 0 -> 1)
            const x = padding + (Math.abs(req.worse) * (width - 2 * padding));
            // Y축: 만족계수 (Better, 아래에서 위로 0 -> 1)
            const y = height - padding - (req.better * (height - 2 * padding));

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
                    {/* 무관심 (좌하) */}
                    <rect
                        x={padding}
                        y={height / 2}
                        width={(width - 2 * padding) / 2}
                        height={(height - 2 * padding) / 2}
                        fill="#6b7280"
                    />
                    {/* 당연적 (우하) */}
                    <rect
                        x={width / 2}
                        y={height / 2}
                        width={(width - 2 * padding) / 2}
                        height={(height - 2 * padding) / 2}
                        fill="#ef4444"
                    />
                    {/* 매력적 (좌상) */}
                    <rect
                        x={padding}
                        y={padding}
                        width={(width - 2 * padding) / 2}
                        height={(height - 2 * padding) / 2}
                        fill="#10b981"
                    />
                    {/* 일원적 (우상) */}
                    <rect
                        x={width / 2}
                        y={padding}
                        width={(width - 2 * padding) / 2}
                        height={(height - 2 * padding) / 2}
                        fill="#3b82f6"
                    />
                </g>

                {/* 축 */}
                <g stroke="#4b5563" strokeWidth="2">
                    {/* X축 */}
                    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
                    {/* Y축 */}
                    <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
                </g>

                {/* 중심 축 (0.5 기준) */}
                <g stroke="#6b7280" strokeWidth="1" strokeDasharray="4">
                    <line x1={width / 2} y1={padding} x2={width / 2} y2={height - padding} />
                    <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} />
                </g>

                {/* 축 레이블 */}
                <text x={width / 2} y={height - 20} textAnchor="middle" fill="#9ca3af" fontSize="12" fontWeight="bold">
                    불만족 계수 (Worse) →
                </text>
                <text
                    x={20}
                    y={height / 2}
                    textAnchor="middle"
                    fill="#9ca3af"
                    fontSize="12"
                    fontWeight="bold"
                    transform={`rotate(-90, 20, ${height / 2})`}
                >
                    만족 계수 (Better) →
                </text>

                {/* 사분면 라벨 */}
                <text x={padding + 20} y={padding + 20} fill="#9ca3af" fontSize="12" fontWeight="bold" opacity="0.8">
                    매력적
                </text>
                <text x={width - padding - 50} y={padding + 20} fill="#9ca3af" fontSize="12" fontWeight="bold" opacity="0.8">
                    일원적
                </text>
                <text x={padding + 20} y={height - padding - 15} fill="#9ca3af" fontSize="12" fontWeight="bold" opacity="0.8">
                    무관심
                </text>
                <text x={width - padding - 50} y={height - padding - 15} fill="#9ca3af" fontSize="12" fontWeight="bold" opacity="0.8">
                    당연적
                </text>

                {/* 데이터 점 찍기 및 교차선(Crosshairs) */}
                {points.map((p, idx) => (
                    <g key={p.id}>
                        {/* 교차선 (가로세로 축으로 안내선) */}
                        <line x1={p.x} y1={p.y} x2={p.x} y2={height - padding} stroke="#2563eb" strokeWidth="1" strokeDasharray="4" opacity="0.5" />
                        <line x1={p.x} y1={p.y} x2={padding} y2={p.y} stroke="#2563eb" strokeWidth="1" strokeDasharray="4" opacity="0.5" />

                        {/* 데이터 포인트 원 */}
                        <circle cx={p.x} cy={p.y} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2" className="cursor-pointer hover:r-10 transition-all">
                            <title>{p.name} (만족계수: {p.better.toFixed(2)}, 불만족계수: {p.worse.toFixed(2)})</title>
                        </circle>
                        
                        {/* 원 안의 숫자 표기 */}
                        <circle cx={p.x} cy={p.y} r="8" fill="#1e3a8a" opacity="0.8" />
                        <text x={p.x} y={p.y + 3} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold" className="pointer-events-none">
                            {idx + 1}
                        </text>
                        
                        {/* 점 옆에 실제 계수 텍스트 표시 */}
                        <rect x={p.x + 12} y={p.y - 12} width="115" height="24" fill="#ffffff" stroke="#94a3b8" rx="4" opacity="0.9" />
                        <text x={p.x + 16} y={p.y + 4} fontSize="11" fill="#1e293b" fontWeight="bold">
                            Q{idx + 1} (W: {p.worse.toFixed(2)}, B: {p.better.toFixed(2)})
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
