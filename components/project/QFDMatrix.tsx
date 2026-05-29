'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Requirement { id: string; category: string; subcategory?: string; requirement: string; }
interface TechnicalChar { id: string; name: string; unit: string; targetValue: string; }
interface Relationship { requirementId: string; technicalCharId: string; strength: 'STRONG' | 'MEDIUM' | 'WEAK' | 'NONE'; }
interface RequirementAnalysis {
    requirementId: string;
    kanoCategory: string;
    importance: number;
    weight: number;
    weightPercent: number;
    better: number;
    worse: number;
    responseCount: number;
    selfScore: number;
    competitorScore: number;
    planQuality: number;
    improvementRate: number;
    absoluteImportance: number;
    qualityImportancePercent: number;
    rank: number | null;
}
interface TechnicalAnalysis {
    technicalCharId: string;
    name: string;
    unit?: string;
    targetValue?: string;
    totalScore: number;
    rank: number | null;
    importancePercent: number;
}
interface Benchmark { requirementId: string; company: string; score: number; }
interface QFDMatrixProps { projectId: string; }
type DisplayTechnical = TechnicalChar & { isPlaceholder?: boolean };

const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5];
const MIN_WORKSHEET_TECH_COLUMNS = 15;

export default function QFDMatrix({ projectId }: QFDMatrixProps) {
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [technicalChars, setTechnicalChars] = useState<TechnicalChar[]>([]);
    const [relationships, setRelationships] = useState<Relationship[]>([]);
    const [reqAnalysis, setReqAnalysis] = useState<RequirementAnalysis[]>([]);
    const [techAnalysis, setTechAnalysis] = useState<TechnicalAnalysis[]>([]);
    const [benchmarksData, setBenchmarksData] = useState<Benchmark[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddTechModal, setShowAddTechModal] = useState(false);
    const [newTech, setNewTech] = useState({ name: '', unit: '', targetValue: '' });
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        loadData();
    }, [projectId]);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ message, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [r1, r2, r3, r4, r5] = await Promise.all([
                fetch(`/api/projects/${projectId}/requirements`),
                fetch(`/api/projects/${projectId}/qfd/technical`),
                fetch(`/api/projects/${projectId}/qfd/relationships`),
                fetch(`/api/projects/${projectId}/qfd/analysis`),
                fetch(`/api/projects/${projectId}/qfd/benchmarks`),
            ]);
            if (r1.ok) { const d = await r1.json(); setRequirements(d.requirements || []); }
            if (r2.ok) { const d = await r2.json(); setTechnicalChars(d.technicalCharacteristics || []); }
            if (r3.ok) { const d = await r3.json(); setRelationships(d.relationships || []); }
            if (r4.ok) { const d = await r4.json(); setReqAnalysis(d.requirements || []); setTechAnalysis(d.technicals || []); }
            if (r5.ok) { const d = await r5.json(); setBenchmarksData(d.benchmarks || []); }
        } catch (e) {
            console.error(e);
            showToast('QFD 데이터를 불러오지 못했습니다.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddTechnical = async () => {
        if (!newTech.name.trim()) return;
        const res = await fetch(`/api/projects/${projectId}/qfd/technical`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTech),
        });
        if (res.ok) {
            await loadData();
            setShowAddTechModal(false);
            setNewTech({ name: '', unit: '', targetValue: '' });
            showToast('기술특성을 추가했습니다.');
        } else {
            showToast('기술특성 추가에 실패했습니다.', 'error');
        }
    };

    const setRelationshipVal = async (reqId: string, techId: string, strength: string) => {
        await fetch(`/api/projects/${projectId}/qfd/relationships`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirementId: reqId, technicalCharId: techId, strength }),
        });
        await loadData();
    };

    const handleReset = async () => {
        await Promise.all([
            ...relationships.map(r => fetch(`/api/projects/${projectId}/qfd/relationships`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requirementId: r.requirementId, technicalCharId: r.technicalCharId, strength: 'NONE' }),
            })),
            fetch(`/api/projects/${projectId}/qfd/correlations`, { method: 'DELETE' }),
            fetch(`/api/projects/${projectId}/qfd/benchmarks`, { method: 'DELETE' }),
        ]);
        setShowResetConfirm(false);
        await loadData();
        showToast('QFD 매트릭스를 초기화했습니다.');
    };

    const setBenchmark = async (reqId: string, company: string, score: number) => {
        await fetch(`/api/projects/${projectId}/qfd/benchmarks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirementId: reqId, company, score }),
        });
        await loadData();
    };

    const getRelationship = (reqId: string, techId: string): Relationship['strength'] =>
        relationships.find(r => r.requirementId === reqId && r.technicalCharId === techId)?.strength || 'NONE';

    const getBenchmark = (reqId: string, company: string) =>
        benchmarksData.find(b => b.requirementId === reqId && b.company === company)?.score || 0;

    const getReqAnalysis = (reqId: string) => reqAnalysis.find(a => a.requirementId === reqId);
    const getTechAnalysis = (techId: string) => techAnalysis.find(t => t.technicalCharId === techId);

    const relationshipColor = (strength: string) => ({
        STRONG: 'text-emerald-700',
        MEDIUM: 'text-blue-700',
        WEAK: 'text-amber-700',
        NONE: 'text-slate-300',
    }[strength] || 'text-slate-300');

    const displayTechnicalCols: DisplayTechnical[] = [
        ...technicalChars.map(t => ({ ...t, isPlaceholder: false })),
        ...Array.from({ length: Math.max(0, MIN_WORKSHEET_TECH_COLUMNS - technicalChars.length) }, (_, i) => ({
            id: `placeholder-${i}`,
            name: '',
            unit: '',
            targetValue: '',
            isPlaceholder: true,
        })),
    ];

    const totalWeight = reqAnalysis.reduce((sum, row) => sum + (row.weight || 0), 0);
    const totalAbsoluteImportance = reqAnalysis.reduce((sum, row) => sum + (row.absoluteImportance || 0), 0);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-16">
                <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6 relative">
            {toast && (
                <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border animate-fade-in ${toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200' : 'bg-red-900/90 border-red-500/40 text-red-200'}`}>
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={toast.type === 'success' ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} /></svg>
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>
            )}

            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">QFD</h2>
                    <p className="text-sm text-gray-500 mt-1">워크시트 QFD 시트와 같은 구획으로 고객요구사항, 관계 매트릭스, 중요도, 경쟁사 비교, 기획품질을 편집합니다</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowAddTechModal(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        기술특성 추가
                    </button>
                    <button onClick={() => setShowResetConfirm(true)} className="px-3 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        리셋
                    </button>
                </div>
            </div>

            {showResetConfirm && (
                <div className="card border-rose-500/25 bg-rose-500/[0.04] animate-fade-in">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-white text-sm font-semibold">QFD 매트릭스 초기화</p>
                            <p className="text-rose-300/70 text-xs mt-0.5">관계, 상관, 벤치마크 데이터가 삭제됩니다.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowResetConfirm(false)} className="btn-secondary text-sm">취소</button>
                            <button onClick={handleReset} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm rounded-lg transition-colors font-medium">초기화</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="border border-slate-500/50 bg-slate-950/50 overflow-x-auto">
                <table className="min-w-max border-collapse bg-white text-[11px] text-slate-950">
                    <colgroup>
                        <col className="w-[210px]" />
                        <col className="w-[216px]" />
                        <col className="w-[345px]" />
                        {displayTechnicalCols.map(col => <col key={`col-${col.id}`} className="w-[90px]" />)}
                        <col className="w-[90px]" />
                        <col className="w-[96px]" />
                        <col className="w-[80px]" />
                        <col className="w-[80px]" />
                        <col className="w-[70px]" />
                        <col className="w-[76px]" />
                        <col className="w-[88px]" />
                        <col className="w-[98px]" />
                        <col className="w-[80px]" />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="border border-slate-400 px-2 py-2 bg-[#93CDDD] text-center font-bold" colSpan={3}>고객요구사항</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#EEECE1] text-center font-bold" colSpan={displayTechnicalCols.length}>기술특성</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#F2DCDB] text-center font-bold">비교<br />대상</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#F2DCDB] text-center font-bold">중요도</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#F2DCDB] text-center font-bold" colSpan={2}>경쟁사<br />비교</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#C6D9F1] text-center font-bold" rowSpan={2}>기획품질</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#C6D9F1] text-center font-bold" rowSpan={2}>수준향상율</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#C6D9F1] text-center font-bold" rowSpan={2}>절대적 중요성</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#C6D9F1] text-center font-bold" rowSpan={2}>요구품질<br />중요성(%)</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#C6D9F1] text-center font-bold" rowSpan={2}>RANK</th>
                        </tr>
                        <tr>
                            <th className="border border-slate-400 px-2 py-2 bg-[#8EB4E3] text-center font-semibold text-blue-800">2차 그룹<br />(파란색 글씨)</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#B9CDE5] text-center font-semibold text-red-700">1차 그룹<br />(빨간색 글씨)</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#DCE6F2] text-center font-semibold">항목<br />(검정색 글씨)</th>
                            {displayTechnicalCols.map((tech, index) => (
                                <th key={tech.id} className="h-[108px] border border-slate-400 bg-[#EEECE1] p-1 text-center align-bottom font-semibold">
                                    {tech.isPlaceholder ? (
                                        <span className="text-slate-300">{index + 1}</span>
                                    ) : (
                                        <div className="mx-auto flex h-full max-w-[82px] items-end justify-center leading-tight text-cyan-900">
                                            <span className="break-keep">{tech.name}</span>
                                        </div>
                                    )}
                                </th>
                            ))}
                            <th className="border border-slate-400 px-2 py-2 bg-[#F2DCDB] text-center font-semibold">가중치</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#F2DCDB] text-center font-semibold">가중치<br />백분율</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#F2DCDB] text-center font-semibold">자사</th>
                            <th className="border border-slate-400 px-2 py-2 bg-[#F2DCDB] text-center font-semibold">경쟁사C</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requirements.map(req => {
                            const a = getReqAnalysis(req.id);
                            const importance = a?.weight ?? a?.importance ?? 0;
                            const impPct = a?.weightPercent || 0;
                            const selfScore = getBenchmark(req.id, 'self');
                            const compScore = getBenchmark(req.id, 'competitor');
                            const planQ = a?.planQuality || 0;
                            const impRate = a?.improvementRate || 0;
                            const absImp = a?.absoluteImportance || 0;
                            const qualPct = a?.qualityImportancePercent || 0;
                            const rank = a?.rank || '-';
                            return (
                                <tr key={req.id} className="h-[31px] hover:brightness-95">
                                    <td className="border border-slate-400 bg-[#8EB4E3] px-2 py-1 text-center text-blue-800">{req.subcategory || ''}</td>
                                    <td className="border border-slate-400 bg-[#B9CDE5] px-2 py-1 text-center text-red-700">{req.category || ''}</td>
                                    <td className="border border-slate-400 bg-[#DCE6F2] px-2 py-1 font-medium">{req.requirement}</td>
                                    {displayTechnicalCols.map(tech => {
                                        if (tech.isPlaceholder) return <td key={tech.id} className="border border-slate-400 bg-white" />;
                                        const strength = getRelationship(req.id, tech.id);
                                        return (
                                            <td key={tech.id} className="border border-slate-400 bg-white p-0 text-center">
                                                <select
                                                    value={strength}
                                                    onChange={e => setRelationshipVal(req.id, tech.id, e.target.value)}
                                                    className={`h-[30px] w-full cursor-pointer border-none bg-transparent p-1 text-center text-base font-bold outline-none hover:bg-cyan-50 ${relationshipColor(strength)}`}
                                                >
                                                    <option value="NONE">—</option>
                                                    <option value="WEAK">△ 1</option>
                                                    <option value="MEDIUM">○ 3</option>
                                                    <option value="STRONG">● 9</option>
                                                </select>
                                            </td>
                                        );
                                    })}
                                    <td className="border border-slate-400 bg-white px-2 py-1 text-center font-semibold">{importance.toFixed(1)}</td>
                                    <td className="border border-slate-400 bg-[#F2DCDB] px-2 py-1 text-center">{impPct.toFixed(1)}%</td>
                                    <td className="border border-slate-400 bg-[#F2DCDB] p-0 text-center">
                                        <select value={selfScore} onChange={e => setBenchmark(req.id, 'self', parseInt(e.target.value))} className="h-[30px] w-full cursor-pointer border-none bg-transparent p-1 text-center outline-none">
                                            {SCORE_OPTIONS.map(v => <option key={v} value={v}>{v === 0 ? '—' : v}</option>)}
                                        </select>
                                    </td>
                                    <td className="border border-slate-400 bg-[#F2DCDB] p-0 text-center">
                                        <select value={compScore} onChange={e => setBenchmark(req.id, 'competitor', parseInt(e.target.value))} className="h-[30px] w-full cursor-pointer border-none bg-transparent p-1 text-center outline-none">
                                            {SCORE_OPTIONS.map(v => <option key={v} value={v}>{v === 0 ? '—' : v}</option>)}
                                        </select>
                                    </td>
                                    <td className="border border-slate-400 bg-[#C6D9F1] p-1 text-center font-semibold">{planQ || '—'}</td>
                                    <td className="border border-slate-400 bg-[#C6D9F1] p-1 text-center font-semibold">{impRate ? impRate.toFixed(2) : '—'}</td>
                                    <td className="border border-slate-400 bg-[#C6D9F1] p-1 text-center font-semibold">{absImp ? absImp.toFixed(2) : '—'}</td>
                                    <td className="border border-slate-400 bg-[#C6D9F1] p-1 text-center">{qualPct ? qualPct.toFixed(1) + '%' : '—'}</td>
                                    <td className="border border-slate-400 bg-[#C6D9F1] p-1 text-center font-bold">{rank}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="h-[31px]">
                            <td colSpan={3} className="border border-slate-400 bg-white px-2 py-1 text-center font-bold">품질중요도</td>
                            {displayTechnicalCols.map(tech => {
                                if (tech.isPlaceholder) return <td key={tech.id} className="border border-slate-400 bg-white" />;
                                const analysis = getTechAnalysis(tech.id);
                                return <td key={tech.id} className="border border-slate-400 bg-white p-1 text-center font-bold">{analysis?.totalScore?.toFixed(2) || '0'}</td>;
                            })}
                            <td className="border border-slate-400 bg-white p-1 text-center font-semibold">{totalWeight.toFixed(1)}</td>
                            <td className="border border-slate-400 bg-[#F2DCDB] p-1 text-center">100%</td>
                            <td colSpan={3} className="border border-slate-400 bg-white" />
                            <td className="border border-slate-400 bg-[#C6D9F1] p-1 text-center font-semibold">{totalAbsoluteImportance.toFixed(1)}</td>
                            <td className="border border-slate-400 bg-[#C6D9F1]" />
                            <td className="border border-slate-400 bg-[#C6D9F1]" />
                        </tr>
                        <tr className="h-[31px]">
                            <td colSpan={3} className="border border-slate-400 bg-white px-2 py-1 text-right font-bold">RANK</td>
                            {displayTechnicalCols.map(tech => {
                                if (tech.isPlaceholder) return <td key={tech.id} className="border border-slate-400 bg-white" />;
                                const analysis = getTechAnalysis(tech.id);
                                return <td key={tech.id} className="border border-slate-400 bg-white p-1 text-center font-bold">{analysis?.rank || '-'}</td>;
                            })}
                            <td colSpan={9} className="border border-slate-400 bg-white" />
                        </tr>
                        <tr className="h-[31px]">
                            <td className="border border-slate-400 bg-white" />
                            <td className="border border-slate-400 bg-white px-2 py-1 text-center font-bold">Spec</td>
                            <td className="border border-slate-400 bg-white px-2 py-1 text-center font-bold">측정단위</td>
                            {displayTechnicalCols.map(tech => <td key={tech.id} className="border border-slate-400 bg-white p-1 text-center">{tech.isPlaceholder ? '' : (tech.unit || '—')}</td>)}
                            <td colSpan={9} className="border border-slate-400 bg-white" />
                        </tr>
                        <tr className="h-[31px]">
                            <td className="border border-slate-400 bg-white" />
                            <td className="border border-slate-400 bg-white" />
                            <td className="border border-slate-400 bg-white px-2 py-1 text-center font-bold">자사</td>
                            {displayTechnicalCols.map(tech => <td key={tech.id} className="border border-slate-400 bg-white p-1 text-center">—</td>)}
                            <td colSpan={9} className="border border-slate-400 bg-white" />
                        </tr>
                        <tr className="h-[31px]">
                            <td className="border border-slate-400 bg-white" />
                            <td className="border border-slate-400 bg-white" />
                            <td className="border border-slate-400 bg-white px-2 py-1 text-center font-bold">경쟁사 A</td>
                            {displayTechnicalCols.map(tech => <td key={tech.id} className="border border-slate-400 bg-white p-1 text-center">—</td>)}
                            <td colSpan={9} className="border border-slate-400 bg-white" />
                        </tr>
                        <tr className="h-[31px]">
                            <td className="border border-slate-400 bg-white" />
                            <td colSpan={2} className="border border-slate-400 bg-white px-2 py-1 text-center font-bold">설계 목표치</td>
                            {displayTechnicalCols.map(tech => <td key={tech.id} className="border border-slate-400 bg-white p-1 text-center">{tech.isPlaceholder ? '' : (tech.targetValue || '—')}</td>)}
                            <td colSpan={9} className="border border-slate-400 bg-white" />
                        </tr>
                    </tfoot>
                </table>
                {technicalChars.length === 0 && (
                    <div className="border-t border-slate-500/50 bg-slate-950 p-8 text-center">
                        <p className="text-gray-500 text-sm mb-3">기술특성을 추가하면 QFD 관계 매트릭스를 입력할 수 있습니다.</p>
                        <button onClick={() => setShowAddTechModal(true)} className="btn-primary text-sm">기술특성 추가</button>
                    </div>
                )}
            </div>

            {techAnalysis.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[...techAnalysis].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).slice(0, 6).map(tech => {
                        const max = Math.max(...techAnalysis.map(t => t.totalScore), 1);
                        const width = (tech.totalScore / max) * 100;
                        return (
                            <div key={tech.technicalCharId} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-white font-semibold text-sm">{tech.name}</span>
                                    <span className="text-xs font-bold text-yellow-300">#{tech.rank ?? '-'}</span>
                                </div>
                                <div className="w-full bg-white/[0.06] rounded-full h-1.5">
                                    <div className="bg-cyan-400 h-1.5 rounded-full" style={{ width: `${width}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {requirements.length === 0 && (
                <div className="card text-center py-14">
                    <h3 className="text-lg font-display font-semibold text-gray-300 mb-2">고객 요구사항이 없습니다</h3>
                    <Link href={`/project/${projectId}/requirements`} className="btn-primary inline-flex mt-4">요구사항 입력하기</Link>
                </div>
            )}

            {showAddTechModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="glass-strong max-w-md w-full p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-display font-bold text-white">기술특성 추가</h3>
                            <button onClick={() => { setShowAddTechModal(false); setNewTech({ name: '', unit: '', targetValue: '' }); }}
                                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">기술특성 이름 *</label>
                                <input type="text" value={newTech.name} onChange={e => setNewTech({ ...newTech, name: e.target.value })} className="input w-full" placeholder="예: 응답 속도" autoFocus />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">측정단위</label>
                                <input type="text" value={newTech.unit} onChange={e => setNewTech({ ...newTech, unit: e.target.value })} className="input w-full" placeholder="예: ms, %, 점" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">설계 목표치</label>
                                <input type="text" value={newTech.targetValue} onChange={e => setNewTech({ ...newTech, targetValue: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') handleAddTechnical(); }} className="input w-full" placeholder="예: 100ms 이하" />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => { setShowAddTechModal(false); setNewTech({ name: '', unit: '', targetValue: '' }); }} className="flex-1 btn-secondary py-3">취소</button>
                                <button onClick={handleAddTechnical} className="flex-1 btn-primary py-3">추가</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
