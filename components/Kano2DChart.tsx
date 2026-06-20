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

const quadrantColors = {
    attractive: '#10b981',
    oneDimensional: '#3b82f6',
    mustBe: '#ef4444',
    indifferent: '#6b7280',
};

const quadrantLabels = [
    ['1사분면: 매력적 품질', quadrantColors.attractive],
    ['2사분면: 일원적 품질', quadrantColors.oneDimensional],
    ['3사분면: 당연적 품질', quadrantColors.mustBe],
    ['4사분면: 무관심 품질', quadrantColors.indifferent],
] as const;

const chartFont = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", "Segoe UI", sans-serif';
const width = 600;
const height = 680;
const padding = 60;
const plotWidth = width - 2 * padding;
const plotHeight = height - 2 * padding;

export default function Kano2DChart({ requirements }: Kano2DChartProps) {
    // SVG 축 레이블.
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

    // Better-Worse 값을 사분면 위치와 색상으로 변환.
    const points = useMemo(() => {
        return requirements.map((req) => {
            const normalizedWorse = Math.min(1, Math.max(0, req.worse + 1));
            const x = padding + (normalizedWorse * plotWidth);
            const y = height - padding - (req.better * plotHeight);
            const absWorse = Math.abs(req.worse);
            const color = req.better >= 0.5 && absWorse < 0.5
                ? quadrantColors.attractive
                : req.better >= 0.5 && absWorse >= 0.5
                    ? quadrantColors.oneDimensional
                    : req.better < 0.5 && absWorse >= 0.5
                        ? quadrantColors.mustBe
                        : quadrantColors.indifferent;

            return {
                ...req,
                x,
                y,
                color,
            };
        });
    }, [requirements]);

    return (
        <div className="relative">
            <svg
                width={width}
                height={height}
                fontFamily={chartFont}
                className="bg-gray-800/30 rounded-lg border border-white/10"
            >
                {/* 사분면 배경 */}
                <g opacity="0.1">
                    {/* 당연적 품질 */}
                    <rect
                        x={padding}
                        y={height / 2}
                        width={plotWidth / 2}
                        height={plotHeight / 2}
                        fill={quadrantColors.mustBe}
                    />
                    {/* 무관심 품질 */}
                    <rect
                        x={width / 2}
                        y={height / 2}
                        width={plotWidth / 2}
                        height={plotHeight / 2}
                        fill={quadrantColors.indifferent}
                    />
                    {/* 일원적 품질 */}
                    <rect
                        x={padding}
                        y={padding}
                        width={plotWidth / 2}
                        height={plotHeight / 2}
                        fill={quadrantColors.oneDimensional}
                    />
                    {/* 매력적 품질 */}
                    <rect
                        x={width / 2}
                        y={padding}
                        width={plotWidth / 2}
                        height={plotHeight / 2}
                        fill={quadrantColors.attractive}
                    />
                </g>

                {/* 축 */}
                <g stroke="#4b5563" strokeWidth="2">
                    {/* X축 */}
                    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
                    {/* Y축 */}
                    <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
                </g>

                {/* 중앙 기준선 (0.5 기준) */}
                <g stroke="#6b7280" strokeWidth="1" strokeDasharray="4">
                    <line x1={width / 2} y1={padding} x2={width / 2} y2={height - padding} />
                    <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} />
                </g>

                <g stroke="#334155" strokeWidth="1" opacity="0.55">
                    {xAxisTicks.map((_, idx) => {
                        const x = padding + ((idx + 1) * plotWidth) / 10;
                        return <line key={`x-grid-${idx}`} x1={x} y1={padding} x2={x} y2={height - padding} />;
                    })}
                    {yAxisTicks.map((_, idx) => {
                        const y = padding + ((idx + 1) * plotHeight) / 10;
                        return <line key={`y-grid-${idx}`} x1={padding} y1={y} x2={width - padding} y2={y} />;
                    })}
                </g>

                <g fill="#9ca3af" fontSize="10">
                    {xAxisTicks.map((label, idx) => {
                        const x = padding + ((idx + 0.5) * plotWidth) / 10;
                        const [top, bottom] = label.split('\n');
                        return (
                            <text key={label} x={x} y={height - padding + 14} textAnchor="middle">
                                <tspan x={x}>{top}</tspan>
                                <tspan x={x} dy="11">{bottom}</tspan>
                            </text>
                        );
                    })}
                    {yAxisTicks.map((label, idx) => {
                        const y = padding + ((idx + 0.5) * plotHeight) / 10;
                        const [top, bottom] = label.split('\n');
                        return (
                            <text key={label} x={padding - 10} y={y - 5} textAnchor="end">
                                <tspan x={padding - 10}>{top}</tspan>
                                <tspan x={padding - 10} dy="12">{bottom}</tspan>
                            </text>
                        );
                    })}
                </g>

                {/* 축 라벨 */}
                <text x={width / 2} y={height - 16} textAnchor="middle" fill="#9ca3af" fontSize="12" fontWeight="bold">
                    불만족 계수
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
                    만족 계수
                </text>

                {/* 사분면 라벨 */}
                <text x={width - padding - 110} y={padding + 20} fill={quadrantColors.attractive} fontSize="12" fontWeight="bold" opacity="0.9">
                    1사분면: 매력적 품질
                </text>
                <text x={padding + 20} y={padding + 20} fill={quadrantColors.oneDimensional} fontSize="12" fontWeight="bold" opacity="0.9">
                    2사분면: 일원적 품질
                </text>
                <text x={padding + 20} y={height - padding - 15} fill={quadrantColors.mustBe} fontSize="12" fontWeight="bold" opacity="0.9">
                    3사분면: 당연적 품질
                </text>
                <text x={width - padding - 110} y={height - padding - 15} fill={quadrantColors.indifferent} fontSize="12" fontWeight="bold" opacity="0.9">
                    4사분면: 무관심 품질
                </text>

                {/* 데이터 포인트 */}
                {points.map((p, idx) => (
                    <g key={p.id}>
                        <circle cx={p.x} cy={p.y} r="8" fill={p.color} stroke="#fff" strokeWidth="2" className="cursor-pointer hover:r-10 transition-all">
                            <title>{p.name} (만족 계수: {p.better.toFixed(2)}, 불만족 계수: {p.worse.toFixed(2)})</title>
                        </circle>
                        <text x={p.x} y={p.y + 3} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold" className="pointer-events-none">
                            {idx + 1}
                        </text>
                    </g>
                ))}
            </svg>

            {/* 범례 */}
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
                {quadrantLabels.map(([label, color]) => (
                    <div key={label} className="flex items-center gap-1.5">
                        <div
                            className="w-3 h-3 rounded-full border-2 border-white"
                            style={{ backgroundColor: color }}
                        />
                        <span className="text-gray-300">{label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
