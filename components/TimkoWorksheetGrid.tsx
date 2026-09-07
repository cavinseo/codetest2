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
    blue: '#c5d9f1', peach: '#fde9d9',
};

const upperRows = [
    [colors.darkRed, colors.red, colors.rose, colors.pink, colors.palePink, colors.white, colors.paleYellow, colors.yellow, colors.brightYellow, colors.white],
    [colors.darkRed, colors.red, colors.rose, colors.pink, colors.pink, colors.white, colors.paleYellow, colors.yellow, colors.brightYellow, colors.brightYellow],
    [colors.darkRed, colors.red, colors.rose, colors.rose, colors.rose, colors.white, colors.paleYellow, colors.yellow, colors.yellow, colors.yellow],
    [colors.darkRed, colors.red, colors.red, colors.red, colors.red, colors.white, colors.paleYellow, colors.paleYellow, colors.paleYellow, colors.paleYellow],
    [colors.darkRed, colors.darkRed, colors.darkRed, colors.darkRed, colors.darkRed, colors.white, colors.white, colors.white, colors.white, colors.white],
];
export default function TimkoWorksheetGrid({ x, y, width, height }: TimkoWorksheetGridProps) {
    const cellWidth = width / 10;
    const cellHeight = height / 10;
    return (
        <g>
            {/* 기존 차트 틀 안에 워크시트의 셀별 색상 구간을 표시한다. */}
            {Array.from({ length: 10 }, (_, row) => (
                <g key={row}>
                    {Array.from({ length: 10 }, (_, col) => (
                        <rect key={col} x={x + col * cellWidth} y={y + row * cellHeight}
                            width={cellWidth} height={cellHeight}
                            fill={row < 5 ? upperRows[row][col] : col < 5 ? colors.blue : colors.peach}
                            fillOpacity="0.65" />
                    ))}
                </g>
            ))}
            <g fill="#ffffff" fontSize="13" fontWeight="800">
                {Array.from({ length: 10 }, (_, col) => (
                    <text key={col} x={x + (col + 0.5) * cellWidth} y={y - 14} textAnchor="middle">
                        {(3.2 + col * 0.2).toFixed(1)}
                    </text>
                ))}
            </g>
        </g>
    );
}
