'use client';

import { useRef, useState } from 'react';
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
    canDelete?: boolean;
    isDeleting?: boolean;
    onDelete?: (respondentEmails?: string[]) => Promise<void>;
}

export default function KanoRespondentTable({ respondents, requirements, canDelete = false, isDeleting = false, onDelete }: KanoRespondentTableProps) {
    const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
    const [isPending, setIsPending] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const pending = useRef(false);
    const busy = isDeleting || isPending;
    const selected = selectedEmails.filter(email => respondents.some(respondent => respondent.email === email));

    const handleDelete = async (all: boolean) => {
        if (!canDelete || !onDelete || busy || pending.current) return;
        const count = all ? respondents.length : selected.length;
        if (count === 0) return;
        if (!window.confirm(`${all ? '전체' : '선택한'} 응답자 ${count}명의 모든 문항 응답을 삭제할까요? 삭제한 응답은 복구할 수 없습니다. 해당 응답자의 응답 완료 상태도 초기화되며 초대 내역은 유지됩니다.`)) return;
        pending.current = true;
        setIsPending(true);
        setDeleteError('');
        try {
            await onDelete(all ? undefined : selected);
            setSelectedEmails([]);
        } catch (error: unknown) {
            setDeleteError(error instanceof Error ? error.message : '응답 삭제에 실패했습니다.');
        } finally {
            pending.current = false;
            setIsPending(false);
        }
    };
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
            {canDelete && onDelete && <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-sm text-gray-400">{selected.length}명 선택</span>
                <button type="button" onClick={() => handleDelete(false)} disabled={busy || selected.length === 0} className="btn-secondary text-sm disabled:opacity-50">
                    선택 삭제 ({selected.length}명)
                </button>
                <button type="button" onClick={() => handleDelete(true)} disabled={busy} className="btn-secondary text-sm disabled:opacity-50">
                    전체 삭제 ({respondents.length}명)
                </button>
            </div>}
            {deleteError && <p role="alert" className="text-sm text-red-400">{deleteError}</p>}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-white/[0.04]">
                            <tr className="text-gray-400 border-b border-white/[0.08]">
                                {canDelete && onDelete && <th className="px-4 py-3">
                                    <input type="checkbox" aria-label="전체 응답자 선택" disabled={busy}
                                        checked={selected.length === respondents.length}
                                        onChange={event => setSelectedEmails(event.target.checked ? respondents.map(respondent => respondent.email) : [])} />
                                </th>}
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
                            {respondents.map((respondent) => (
                                <tr key={respondent.email} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                    {canDelete && onDelete && <td className="px-4 py-3">
                                        <input type="checkbox" aria-label={`${respondent.email} 선택`} disabled={busy}
                                            checked={selected.includes(respondent.email)}
                                            onChange={event => {
                                                const checked = event.target.checked;
                                                setSelectedEmails(previous => checked ? [...previous, respondent.email] : previous.filter(email => email !== respondent.email));
                                            }} />
                                    </td>}
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
