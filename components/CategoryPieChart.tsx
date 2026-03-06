'use client';

interface CategoryDistribution {
    M: number;
    O: number;
    A: number;
    I: number;
    R: number;
    Q: number;
}

interface CategoryPieChartProps {
    distribution: CategoryDistribution;
    total: number;
}

export default function CategoryPieChart({ distribution, total }: CategoryPieChartProps) {
    const categoryInfo = {
        M: { name: 'Must-be', color: '#ef4444', label: 'M' },
        O: { name: 'One-dimensional', color: '#3b82f6', label: 'O' },
        A: { name: 'Attractive', color: '#10b981', label: 'A' },
        I: { name: 'Indifferent', color: '#6b7280', label: 'I' },
        R: { name: 'Reverse', color: '#a855f7', label: 'R' },
        Q: { name: 'Questionable', color: '#eab308', label: 'Q' },
    };

    // 파이 차트 데이터 계산
    const data = Object.entries(distribution)
        .filter(([_, count]) => count > 0)
        .map(([category, count]) => ({
            category,
            count,
            percentage: (count / total) * 100,
            ...categoryInfo[category as keyof CategoryDistribution],
        }));

    const size = 300;
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 20;

    // 각 섹션의 경로와 각도 계산
    let currentAngle = -90; // 12시 방향부터 시작

    const arcs = data.map((item) => {
        const angle = (item.percentage / 100) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;

        // SVG 경로 생성
        const startRadians = (startAngle * Math.PI) / 180;
        const endRadians = (endAngle * Math.PI) / 180;

        const x1 = centerX + radius * Math.cos(startRadians);
        const y1 = centerY + radius * Math.sin(startRadians);
        const x2 = centerX + radius * Math.cos(endRadians);
        const y2 = centerY + radius * Math.sin(endRadians);

        const largeArc = angle > 180 ? 1 : 0;

        const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

        // 레이블 위치
        const midAngle = ((startAngle + endAngle) / 2 * Math.PI) / 180;
        const labelX = centerX + (radius * 0.65) * Math.cos(midAngle);
        const labelY = centerY + (radius * 0.65) * Math.sin(midAngle);

        currentAngle = endAngle;

        return {
            ...item,
            path,
            labelX,
            labelY,
        };
    });

    if (total === 0) {
        return (
            <div className="flex items-center justify-center h-[300px] text-gray-500">
                <p>데이터가 없습니다</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center">
            <svg width={size} height={size} className="mb-4">
                {arcs.map((arc) => (
                    <g key={arc.category}>
                        <path
                            d={arc.path}
                            fill={arc.color}
                            opacity="0.85"
                            stroke="white"
                            strokeWidth="2"
                            className="hover:opacity-100 transition-opacity cursor-pointer"
                        >
                            <title>{`${arc.name}: ${arc.count}개 (${arc.percentage.toFixed(1)}%)`}</title>
                        </path>
                        {arc.percentage > 5 && (
                            <text
                                x={arc.labelX}
                                y={arc.labelY}
                                textAnchor="middle"
                                fill="white"
                                fontSize="14"
                                fontWeight="bold"
                            >
                                {arc.label}
                            </text>
                        )}
                    </g>
                ))}
            </svg>

            {/* 범례 */}
            <div className="grid grid-cols-2 gap-3 text-sm">
                {data.map((item) => (
                    <div key={item.category} className="flex items-center gap-2">
                        <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: item.color }}
                        />
                        <span className="text-gray-300">
                            {item.label}: {item.count}개 ({item.percentage.toFixed(1)}%)
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
