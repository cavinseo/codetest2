// WS-6과 WS-7에서 워크시트 형식의 TIMKO 격자와 눈금을 표시한다.
interface TimkoWorksheetGridProps {
    x: number;
    y: number;
    width: number;
    height: number;
}

const colors = {
    darkRed: '#632523', red: '#953735', rose: '#d99694',
    pink: '#e6b8b7', palePink: '#f2dcdb', white: '#ffffff',
    paleYellow: '#ffffcc', yellow: '#ffff99', brightYellow: '#ffff66',
    blue: '#c5d9f1', peach: '#fde9d9', axis: '#dce6f1',
};

const upperRows = [
    [colors.darkRed, colors.red, colors.rose, colors.pink, colors.palePink, colors.white, colors.paleYellow, colors.yellow, colors.brightYellow, colors.white],
    [colors.darkRed, colors.red, colors.rose, colors.pink, colors.pink, colors.white, colors.paleYellow, colors.yellow, colors.brightYellow, colors.brightYellow],
    [colors.darkRed, colors.red, colors.rose, colors.rose, colors.rose, colors.white, colors.paleYellow, colors.yellow, colors.yellow, colors.yellow],
    [colors.darkRed, colors.red, colors.red, colors.red, colors.red, colors.white, colors.paleYellow, colors.paleYellow, colors.paleYellow, colors.paleYellow],
    [colors.darkRed, colors.darkRed, colors.darkRed, colors.darkRed, colors.darkRed, colors.white, colors.white, colors.white, colors.white, colors.white],
];
const worseTicks = ['-1.0|~-0.91', '-0.9|~-0.81', '-0.8|~-0.71', '-0.7|~-0.61', '-0.6|~-0.50', '-0.49|~-0.41', '-0.4|~-0.31', '-0.3|~-0.21', '-0.2|~-0.11', '-0.1|~0.0'];
const betterTicks = ['1.0|~0.91', '0.9|~0.81', '0.8|~0.71', '0.7|~0.61', '0.6|~0.50', '0.49|~0.41', '0.4|~0.31', '0.3|~0.21', '0.2|~0.11', '0.1|~0.0'];

export default function TimkoWorksheetGrid({ x, y, width, height }: TimkoWorksheetGridProps) {
    const cellWidth = width / 10;
    const cellHeight = height / 10;
    return (
        <g fill="#000" fontSize="18" fontWeight="700">
            <text x={x} y={y - 44} fontSize="16">TIMKO</text>
            <text x={x + width + 8} y={y - 20} fontSize="16">만족 계수</text>
            {betterTicks.map((label, row) => (
                <g key={label}>
                    {worseTicks.map((_, col) => (
                        <rect key={col} x={x + col * cellWidth} y={y + row * cellHeight}
                            width={cellWidth} height={cellHeight}
                            fill={row < 5 ? upperRows[row][col] : col < 5 ? colors.blue : colors.peach}
                            stroke="#000" strokeWidth="1" />
                    ))}
                    <rect x={x + width} y={y + row * cellHeight} width={cellWidth} height={cellHeight} fill={colors.axis} stroke="#000" />
                    <text x={x + width + 5} y={y + row * cellHeight + 25}>
                        <tspan>{label.split('|')[0]}</tspan>
                        <tspan x={x + width + 28} dy="28">{label.split('|')[1]}</tspan>
                    </text>
                </g>
            ))}
            {worseTicks.map((label, col) => (
                <g key={label}>
                    <rect x={x + col * cellWidth} y={y - 36} width={cellWidth} height={36} fill={colors.white} stroke="#d4d4d4" />
                    <text x={x + (col + 0.5) * cellWidth} y={y - 10} textAnchor="middle" fontSize="26">{(3.2 + col * 0.2).toFixed(1)}</text>
                    <rect x={x + col * cellWidth} y={y + height} width={cellWidth} height={cellHeight} fill={colors.axis} stroke="#000" />
                    <text x={x + col * cellWidth + 5} y={y + height + 25}>
                        <tspan>{label.split('|')[0]}</tspan>
                        <tspan x={x + col * cellWidth + 24} dy="28">{label.split('|')[1]}</tspan>
                    </text>
                </g>
            ))}
            <rect x={x + width} y={y + height} width={cellWidth} height={cellHeight} fill={colors.axis} stroke="#000" />
            <text x={x + width + cellWidth / 2} y={y + height + 40} textAnchor="middle">0</text>
            <text x={x + width / 2} y={y + height + 78} textAnchor="middle" fontSize="12">불만족 계수</text>
            <rect x={x} y={y} width={width} height={height} fill="none" stroke="#000" strokeWidth="2" />
            <line x1={x} y1={y + height / 2} x2={x + width} y2={y + height / 2} stroke="#000" strokeWidth="2" />
        </g>
    );
}
