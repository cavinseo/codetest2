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

const width = 600;
const height = 600;
const padding = 60;
const plotWidth = width - 2 * padding;
const plotHeight = height - 2 * padding;

export default function Kano2DChart({ requirements }: Kano2DChartProps) {
    // SVG ?ш린
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

    // ?붽뎄?ы빆???꾩튂 怨꾩궛 (?쒖? TIMKO ?묒? ?뚯씪 ?뺤떇 湲곗?)
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
                className="bg-gray-800/30 rounded-lg border border-white/10"
            >
                {/* ?щ텇硫?諛곌꼍 */}
                <g opacity="0.1">
                    {/* 臾닿???(醫뚰븯) */}
                    <rect
                        x={padding}
                        y={height / 2}
                        width={plotWidth / 2}
                        height={plotHeight / 2}
                        fill={quadrantColors.mustBe}
                    />
                    {/* ?뱀뿰??(?고븯) */}
                    <rect
                        x={width / 2}
                        y={height / 2}
                        width={plotWidth / 2}
                        height={plotHeight / 2}
                        fill={quadrantColors.indifferent}
                    />
                    {/* 留ㅻ젰??(醫뚯긽) */}
                    <rect
                        x={padding}
                        y={padding}
                        width={plotWidth / 2}
                        height={plotHeight / 2}
                        fill={quadrantColors.oneDimensional}
                    />
                    {/* ?쇱썝??(?곗긽) */}
                    <rect
                        x={width / 2}
                        y={padding}
                        width={plotWidth / 2}
                        height={plotHeight / 2}
                        fill={quadrantColors.attractive}
                    />
                </g>

                {/* 異?*/}
                <g stroke="#4b5563" strokeWidth="2">
                    {/* X異?*/}
                    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
                    {/* Y異?*/}
                    <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
                </g>

                {/* 以묒떖 異?(0.5 湲곗?) */}
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
                            <text key={label} x={x} y={height - padding + 18} textAnchor="middle">
                                <tspan x={x}>{top}</tspan>
                                <tspan x={x} dy="12">{bottom}</tspan>
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

                {/* 異??덉씠釉?*/}
                <text x={width / 2} y={height - 20} textAnchor="middle" fill="#9ca3af" fontSize="12" fontWeight="bold">
                    遺덈쭔議깃퀎??                </text>
                <text
                    x={20}
                    y={height / 2}
                    textAnchor="middle"
                    fill="#9ca3af"
                    fontSize="12"
                    fontWeight="bold"
                    transform={`rotate(-90, 20, ${height / 2})`}
                >
                    留뚯”怨꾩닔
                </text>

                {/* ?щ텇硫??쇰꺼 */}
                <text x={width - padding - 110} y={padding + 20} fill={quadrantColors.attractive} fontSize="12" fontWeight="bold" opacity="0.9">
                    1?щ텇硫?留ㅻ젰?덉쭏
                </text>
                <text x={padding + 20} y={padding + 20} fill={quadrantColors.oneDimensional} fontSize="12" fontWeight="bold" opacity="0.9">
                    2?щ텇硫??쇱썝???덉쭏
                </text>
                <text x={padding + 20} y={height - padding - 15} fill={quadrantColors.mustBe} fontSize="12" fontWeight="bold" opacity="0.9">
                    3?щ텇硫??뱀뿰?덉쭏
                </text>
                <text x={width - padding - 110} y={height - padding - 15} fill={quadrantColors.indifferent} fontSize="12" fontWeight="bold" opacity="0.9">
                    4?щ텇硫?臾닿??ы뭹吏?                </text>

                {/* ?곗씠????李띻린 諛?援먯감??Crosshairs) */}
                {points.map((p, idx) => (
                    <g key={p.id}>
                        {/* 援먯감??(媛濡쒖꽭濡?異뺤쑝濡??덈궡?? */}

                        {/* ?곗씠???ъ씤????*/}
                        <circle cx={p.x} cy={p.y} r="8" fill={p.color} stroke="#fff" strokeWidth="2" className="cursor-pointer hover:r-10 transition-all">
                            <title>{p.name} (留뚯”怨꾩닔: {p.better.toFixed(2)}, 遺덈쭔議깃퀎?? {p.worse.toFixed(2)})</title>
                        </circle>
                        <text x={p.x} y={p.y + 3} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold" className="pointer-events-none">
                            {idx + 1}
                        </text>

                        {/* ???덉쓽 ?レ옄 ?쒓린 */}

                        {/* ???놁뿉 ?ㅼ젣 怨꾩닔 ?띿뒪???쒖떆 */}
                    </g>
                ))}
            </svg>

            {/* 踰붾? */}
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
                {[
                    ['1?щ텇硫?留ㅻ젰?덉쭏', quadrantColors.attractive],
                    ['2?щ텇硫??쇱썝???덉쭏', quadrantColors.oneDimensional],
                    ['3?щ텇硫??뱀뿰?덉쭏', quadrantColors.mustBe],
                    ['4?щ텇硫?臾닿??ы뭹吏?', quadrantColors.indifferent],
                ].map(([label, color]) => (
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
