'use client';

import { getKanoAnswerLabel, getKanoCategoryLabel } from '@/lib/kano-response-display';

interface RespondentAnswer {
    requirementId: string;
    positiveAnswer: number;
    negativeAnswer: number;
    kanoCategory: string;
}

interface Respondent {
    email: string;
    respondedAt: string;
    answers: RespondentAnswer[];
}

interface KanoRespondentTableProps {
    respondents: Respondent[];
    requirements: { id: string; requirement: string }[];
}

export default function KanoRespondentTable({ respondents, requirements }: KanoRespondentTableProps) {
    // 렌더링용 날짜 포맷팅 헬퍼
    const formatDate = (dateString: string) => {
        const d = new Date(dateString);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const getCategoryColor = (cat: string) => {
        switch (cat) {
            case 'M': return 'text-rose-400 font-medium';
            case 'O': return 'text-blue-400 font-medium';
            case 'A': return 'text-emerald-400 font-medium';
            case 'I': return 'text-gray-400';
            case 'R': return 'text-purple-400 font-medium';
            case 'Q': return 'text-amber-500 font-medium';
            default: return 'text-gray-500';
        }
    };

    if (respondents.length === 0) {
        return (
            <div className="card text-center py-12">
                <p className="text-gray-400">아직 제출된 개별 응답 내역이 없습니다.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-bold text-white mb-4">제출자별 응답 결과</h3>
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-white/[0.04]">
                            <tr className="text-gray-400 border-b border-white/[0.08]">
                                <th className="px-4 py-3 text-left border-r border-white/5 whitespace-nowrap min-w-[150px]">이메일 (응답자)</th>
                                <th className="px-4 py-3 text-left border-r border-white/5 whitespace-nowrap min-w-[120px]">응답 일시</th>
                                {requirements.map((req, idx) => (
                                    <th key={req.id} className="px-3 py-3 font-medium text-gray-300 min-w-[220px] border-r border-white/5 whitespace-nowrap">
                                        <div className="max-w-[240px] overflow-hidden text-ellipsis inline-block align-bottom" title={req.requirement}>
                                            Q{idx + 1}. {req.requirement}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {respondents.map((respondent, idx) => (
                                <tr key={idx} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                    <td className="px-4 py-3 text-left font-mono text-gray-300 border-r border-white/5 whitespace-nowrap">
                                        {respondent.email}
                                    </td>
                                    <td className="px-4 py-3 text-left text-xs text-gray-500 border-r border-white/5 whitespace-nowrap">
                                        {formatDate(respondent.respondedAt)}
                                    </td>
                                    {requirements.map((req) => {
                                        // 해당 요구사항에 대한 이 유저의 응답 찾기
                                        const ans = respondent.answers.find(a => a.requirementId === req.id);
                                        if (!ans) {
                                            return <td key={req.id} className="px-3 py-3 border-r border-white/5 text-center text-gray-600">-</td>;
                                        }
                                        return (
                                            <td key={req.id} className="px-3 py-3 border-r border-white/5 align-top">
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[11px] text-emerald-400">긍정</span>
                                                        <span className="text-xs text-gray-200 text-right">{getKanoAnswerLabel(ans.positiveAnswer)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[11px] text-rose-400">부정</span>
                                                        <span className="text-xs text-gray-200 text-right">{getKanoAnswerLabel(ans.negativeAnswer)}</span>
                                                    </div>
                                                    <div className={`pt-1 text-xs text-right ${getCategoryColor(ans.kanoCategory)}`}>
                                                        {getKanoCategoryLabel(ans.kanoCategory)}
                                                    </div>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="text-xs text-gray-500 bg-white/[0.02] p-3 rounded-lg border border-white/[0.05]">
                <p>💡 <b>도움말:</b> 각 항목별로 해당 응답자가 설문에서 선택한 긍정/부정 답변에 따라 어떤 <b>Kano 품질 성향</b>(단일 속성)을 나타냈는지 확인할 수 있습니다. 전체 집계에서는 이러한 성향들의 빈도수를 모아서 최종 유형을 도출합니다.</p>
            </div>
        </div>
    );
}
