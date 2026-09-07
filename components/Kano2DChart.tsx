'use client';

import { useMemo } from 'react';
import TimkoWorksheetGrid from '@/components/TimkoWorksheetGrid';

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
const width = 1020;
const height = 800;
const padding = 10;
const plotTop = 70;
const plotWidth = 900;
const plotHeight = 650;

export default function Kano2DChart({ requirements }: Kano2DChartProps) {
    // Better-Worse 값을 사분면 위치와 색상으로 변환.
    const points = useMemo(() => {
        return requirements.map((req) => {
            const normalizedWorse = Math.min(1, Math.max(0, req.worse + 1));
            const x = padding + (normalizedWorse * plotWidth);
            const y = plotTop + ((1 - req.better) * plotHeight);
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
        <div className="relative overflow-x-auto">
            <svg
                width={width}
                height={height}
                fontFamily={chartFont}
                viewBox={`0 0 ${width} ${height}`}
                className="block mx-auto bg-white"
            >
                <TimkoWorksheetGrid x={padding} y={plotTop} width={plotWidth} height={plotHeight} />

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
