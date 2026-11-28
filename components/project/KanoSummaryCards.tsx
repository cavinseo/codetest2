// Kano 설문 요약 수치를 카드 형태로 표시한다.
interface Props {
    requirementCount: number;
    invitationCount: number;
    respondedCount: number;
}

const cards = [
    { label: '설문 질문', sub: '긍정/부정 2문항이 1세트', color: 'text-blue-400', path: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', value: (props: Props) => `${props.requirementCount}개` },
    { label: '초대 발송', sub: '응답자 초대', color: 'text-purple-400', path: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', value: (props: Props) => `${props.invitationCount}명` },
    { label: '응답 완료', sub: '설문 완료자', color: 'text-emerald-400', path: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', value: (props: Props) => `${props.respondedCount}명` },
    { label: '응답률', sub: '완료/발송', color: 'text-amber-400', path: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055zM20.488 9H15V3.512A9.025 9.025 0 0120.488 9z', value: (props: Props) => `${props.invitationCount > 0 ? Math.round(props.respondedCount / props.invitationCount * 100) : 0}%` },
];

export default function KanoSummaryCards(props: Props) {
    return <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map(card => <div key={card.label} className="card">
            <div className="mb-2 flex items-center gap-2">
                <svg className={`h-5 w-5 ${card.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.path} />
                </svg>
                <p className="text-xs text-gray-500">{card.label}</p>
            </div>
            <p className={`font-display text-2xl font-bold ${card.color}`}>{card.value(props)}</p>
            <p className="mt-1 text-[11px] text-gray-600">{card.sub}</p>
        </div>)}
    </div>;
}
