'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import TimkoWorksheetGrid from '@/components/TimkoWorksheetGrid';
import TimkoCoefficientChart from '@/components/project/TimkoCoefficientChart';
import { clusterLabel, clusterOverlappingPoints } from '@/lib/timko-point-clusters';
import { estimateLabelWidth, fitLabelFontSize } from '@/lib/timko-point-label';

interface AnalysisResult {
    requirementId: string;
    requirementName?: string;
    better: number;
    worse: number;
    timkoCategory?: string | null;
    quadrant: string;
    aggregated?: { A: number; O: number; M: number; I: number };
}

interface KanoSatisfactionGraphProps {
    analysis: AnalysisResult[];
    selectedRequirementId?: string | null;
    onSelectRequirement?: (requirementId: string) => void;
}

const KOREAN_CHART_FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", "Segoe UI", sans-serif';
// 점과 번호는 화면 캡처·보고서에서도 읽혀야 한다. 6px 점에 8px 번호는 너무 작아 두 배로 키웠다.
const POINT_RADIUS = 12;
// 번호는 원 안에 들어가야 어느 점의 번호인지 읽힌다. 테두리(2px)와 양옆 여백을 뺀
// 폭 안에 들어가도록 자릿수가 늘면 글자를 줄인다.
const POINT_LABEL_INNER_WIDTH = POINT_RADIUS * 2 - 4;
const POINT_LABEL_MAX_FONT_SIZE = 14;
const POINT_LABEL_MIN_FONT_SIZE = 8;
// 겹친 점의 번호('2·9·16')는 원 하나에 넣으면 읽을 수 없을 만큼 작아진다. 높이는
// 점 지름과 같고 글자 폭만큼 옆으로 늘어난 캡슐 안에 담는다.
const CLUSTER_LABEL_FONT_SIZE = 12;
const CLUSTER_LABEL_PADDING_X = 6;
// 글자 높이의 약 1/3 만큼 내려야 번호가 원 한가운데에 놓인다.
const LABEL_BASELINE_RATIO = 0.35;
// 누르기 쉽도록 보이는 점보다 넓게 잡는 투명 영역.
const POINT_HIT_RADIUS = POINT_RADIUS + 6;
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

    // 같은 좌표이거나 겹치는 점은 번호가 서로 가려 보이지 않으므로 겹치는 점끼리 묶어
    // 번호를 한 라벨로 그린다. 점 자체는 옮기지 않는다 — 점이 놓인 칸이 곧 가중치라
    // 위치를 흐트러뜨리면 차트에서 가중치를 읽을 수 없게 된다.
    const labelClusters = useMemo(() => clusterOverlappingPoints(points, POINT_RADIUS), [points]);

    // 부모가 선택을 관리하지 않아도 번호를 누르면 표 행이 강조되도록 자체 상태를 둔다.
    const [ownSelectedId, setOwnSelectedId] = useState<string | null>(null);
    const activeRequirementId = selectedRequirementId ?? ownSelectedId;
    // 같은 화면에 그래프가 둘 이상 그려질 수 있어 DOM id 대신 행 참조로 찾는다.
    const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

    const selectRequirement = (requirementId: string) => {
        setOwnSelectedId(requirementId);
        onSelectRequirement?.(requirementId);
        rowRefs.current.get(requirementId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const pointColor = (quadrant: string) => (
        quadrant === 'ATTRACTIVE' ? quadrantColors.attractive
            : quadrant === 'ONE_DIMENSIONAL' ? quadrantColors.oneDimensional
                : quadrant === 'MUST_BE' ? quadrantColors.mustBe
                    : quadrantColors.indifferent
    );

    return (
        <div className="space-y-8">
            <div className="card items-center justify-center flex flex-col p-8 pb-12">
                <h3 className="text-xl font-bold text-white mb-6">만족/불만족 계수 (Better-Worse) 그래프</h3>
                <div className="relative w-full overflow-x-auto pb-4">
                    <svg
                        width={width}
                        height={height}
                        fontFamily={KOREAN_CHART_FONT}
                        className="timko-chart mx-auto block bg-surface-800/50 rounded-2xl border border-white/10"
                    >
                        <TimkoWorksheetGrid x={yAxisX} y={margin.top} width={plotWidth} height={plotHeight} />

                        {/* 메인 축 */}
                        <line x1={yAxisX} y1={xAxisY} x2={yAxisX + plotWidth} y2={xAxisY} stroke="#64748b" strokeWidth="2" />
                        <line x1={yAxisX + plotWidth} y1={margin.top} x2={yAxisX + plotWidth} y2={xAxisY} stroke="#64748b" strokeWidth="2" />

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

                        <g data-capture-chart-label fill="#ffffff" fontSize="12" fontWeight="800">
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
                                    <text key={label} x={yAxisX + plotWidth + 8} y={y - 5} textAnchor="start">
                                        <tspan x={yAxisX + plotWidth + 8}>{top}</tspan>
                                        <tspan x={yAxisX + plotWidth + 8} dy="14">{bottom}</tspan>
                                    </text>
                                );
                            })}
                        </g>

                        <text data-capture-chart-label x={yAxisX + plotWidth / 2} y={height - 26} textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="800">불만족 계수</text>
                        <text data-capture-chart-label x={width - 8} y={margin.top - 36} textAnchor="end" fill="#ffffff" fontSize="14" fontWeight="800">만족 계수</text>

                        {/* 사분면 이름 */}
                        <g data-capture-chart-label stroke="#1e293b" strokeWidth="3" strokeLinejoin="round" paintOrder="stroke">
                            <text x={yAxisX + plotWidth * 0.75} y={margin.top - 36} textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="800">1사분면: 매력적 품질</text>
                            <text x={yAxisX + plotWidth * 0.25} y={margin.top - 36} textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="800">2사분면: 일원적 품질</text>
                            <text x={yAxisX + 32} y={xAxisY - 28} fill="#ffffff" fontSize="13" fontWeight="800">3사분면: 당연적 품질</text>
                            <text x={yAxisX + plotWidth - 165} y={xAxisY - 28} fill="#ffffff" fontSize="13" fontWeight="800">4사분면: 무관심 품질</text>
                        </g>

                        {/* 데이터 포인트 */}
                        {points.map((p) => (
                            <g
                                key={p.requirementId}
                                data-requirement-point={p.requirementId}
                                className="cursor-pointer"
                                onClick={() => selectRequirement(p.requirementId)}
                            >
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={POINT_HIT_RADIUS}
                                    fill="transparent"
                                />
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={POINT_RADIUS}
                                    fill={pointColor(p.quadrant)}
                                    stroke="#ffffff"
                                    strokeWidth="2"
                                    className="filter drop-shadow-sm"
                                />
                                <title>{p.requirementName}</title>
                            </g>
                        ))}

                        {/* 점 번호 — 점을 전부 그린 뒤 맨 위 층에 그려 다른 점에 가려지지 않게 한다.
                            단독 점은 자기 원 안에, 겹친 점은 '4·7' 처럼 한데 적어 캡슐 안에 넣는다.
                            번호마다 눌러서 아래 표의 해당 행으로 갈 수 있다. */}
                        {labelClusters.map((cluster) => {
                            const label = clusterLabel(cluster.members);
                            const isCluster = cluster.members.length > 1;
                            const fontSize = isCluster
                                ? CLUSTER_LABEL_FONT_SIZE
                                : fitLabelFontSize(label, POINT_LABEL_INNER_WIDTH, POINT_LABEL_MAX_FONT_SIZE, POINT_LABEL_MIN_FONT_SIZE);
                            const badgeWidth = Math.max(POINT_RADIUS * 2, estimateLabelWidth(label, fontSize) + CLUSTER_LABEL_PADDING_X * 2);
                            return (
                                <g key={cluster.members.join('-')} data-point-label={label}>
                                    {isCluster && (
                                        <rect
                                            x={cluster.x - badgeWidth / 2}
                                            y={cluster.y - POINT_RADIUS}
                                            width={badgeWidth}
                                            height={POINT_RADIUS * 2}
                                            rx={POINT_RADIUS}
                                            fill={pointColor(points[cluster.members[0]].quadrant)}
                                            stroke="#ffffff"
                                            strokeWidth="2"
                                            className="pointer-events-none"
                                        />
                                    )}
                                    <text
                                        x={cluster.x}
                                        y={cluster.y + fontSize * LABEL_BASELINE_RATIO}
                                        textAnchor="middle"
                                        fill="#fff"
                                        fontSize={fontSize}
                                        fontWeight="bold"
                                    >
                                        {cluster.members.map((memberIndex, position) => {
                                            const requirementId = points[memberIndex].requirementId;
                                            return (
                                                <Fragment key={requirementId}>
                                                    {position > 0 && <tspan className="pointer-events-none">·</tspan>}
                                                    <tspan
                                                        data-point-number={memberIndex + 1}
                                                        className="cursor-pointer hover:underline"
                                                        onClick={() => selectRequirement(requirementId)}
                                                    >
                                                        {memberIndex + 1}
                                                    </tspan>
                                                </Fragment>
                                            );
                                        })}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>

            <TimkoCoefficientChart analysis={analysis} />

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
                            const isSelected = item.requirementId === activeRequirementId;
                            return (
                                <tr
                                    key={item.requirementId}
                                    ref={(row) => {
                                        if (row) rowRefs.current.set(item.requirementId, row);
                                        else rowRefs.current.delete(item.requirementId);
                                    }}
                                    data-requirement-row={item.requirementId}
                                    data-selected={isSelected ? 'true' : undefined}
                                    className={`border-t transition-colors ${isSelected ? 'border-amber-400/40 bg-amber-400/[0.12] ring-1 ring-inset ring-amber-400/30' : 'border-white/[0.04] hover:bg-white/[0.02]'}`}>
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
