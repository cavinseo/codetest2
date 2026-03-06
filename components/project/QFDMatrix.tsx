'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Requirement { id: string; category: string; subcategory?: string; requirement: string; }
interface TechnicalChar { id: string; name: string; unit: string; targetValue: string; }
interface Relationship { requirementId: string; technicalCharId: string; strength: 'STRONG' | 'MEDIUM' | 'WEAK' | 'NONE'; }
interface Correlation { id: string; techId1: string; techId2: string; correlation: string; }
interface RequirementAnalysis { requirementId: string; kanoCategory: string; importance: number; better: number; worse: number; responseCount: number; }
interface TechnicalAnalysis { technicalCharId: string; name: string; totalScore: number; rank: number; }
interface Benchmark { requirementId: string; company: string; score: number; }
interface QFDRightColumn { requirementId: string; planQuality: number; }
interface QFDMatrixProps { projectId: string; }

export default function QFDMatrix({ projectId }: QFDMatrixProps) {
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [technicalChars, setTechnicalChars] = useState<TechnicalChar[]>([]);
    const [relationships, setRelationships] = useState<Relationship[]>([]);
    const [correlations, setCorrelations] = useState<Correlation[]>([]);
    const [reqAnalysis, setReqAnalysis] = useState<RequirementAnalysis[]>([]);
    const [techAnalysis, setTechAnalysis] = useState<TechnicalAnalysis[]>([]);
    const [benchmarksData, setBenchmarksData] = useState<Benchmark[]>([]);
    const [rightColumns, setRightColumns] = useState<QFDRightColumn[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddTechModal, setShowAddTechModal] = useState(false);
    const [newTech, setNewTech] = useState({ name: '', unit: '', targetValue: '' });
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ message, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => { loadData(); }, [projectId]);

    const loadData = async () => {
        try {
            const [r1, r2, r3, r4, r5, r6] = await Promise.all([
                fetch(`/api/projects/${projectId}/requirements`),
                fetch(`/api/projects/${projectId}/qfd/technical`),
                fetch(`/api/projects/${projectId}/qfd/relationships`),
                fetch(`/api/projects/${projectId}/qfd/analysis`),
                fetch(`/api/projects/${projectId}/qfd/correlations`),
                fetch(`/api/projects/${projectId}/qfd/benchmarks`),
            ]);
            if (r1.ok) { const d = await r1.json(); setRequirements(d.requirements || []); }
            if (r2.ok) { const d = await r2.json(); setTechnicalChars(d.technicalCharacteristics || []); }
            if (r3.ok) { const d = await r3.json(); setRelationships(d.relationships || []); }
            if (r4.ok) { const d = await r4.json(); setReqAnalysis(d.requirements || []); setTechAnalysis(d.technicals || []); }
            if (r5.ok) { const d = await r5.json(); setCorrelations(d.correlations || []); }
            if (r6.ok) { const d = await r6.json(); setBenchmarksData(d.benchmarks || []); }
        } catch (e) { console.error(e); }
        finally { setIsLoading(false); }
    };

    const handleAddTechnical = async () => {
        if (!newTech.name.trim()) return;
        const res = await fetch(`/api/projects/${projectId}/qfd/technical`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newTech),
        });
        if (res.ok) { await loadData(); setShowAddTechModal(false); setNewTech({ name: '', unit: '', targetValue: '' }); showToast('기술특성이 추가되었습니다.'); }
    };

    const getRelationship = (reqId: string, techId: string): 'STRONG' | 'MEDIUM' | 'WEAK' | 'NONE' =>
        relationships.find(r => r.requirementId === reqId && r.technicalCharId === techId)?.strength || 'NONE';

    const setRelationshipVal = async (reqId: string, techId: string, strength: string) => {
        await fetch(`/api/projects/${projectId}/qfd/relationships`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirementId: reqId, technicalCharId: techId, strength }),
        });
        await loadData();
    };

    const getCorrelation = (t1: string, t2: string) => {
        const c = correlations.find(c => (c.techId1 === t1 && c.techId2 === t2) || (c.techId1 === t2 && c.techId2 === t1));
        return c?.correlation || 'NONE';
    };

    const setCorrelationVal = async (t1: string, t2: string, corr: string) => {
        await fetch(`/api/projects/${projectId}/qfd/correlations`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ techId1: t1, techId2: t2, correlation: corr }),
        });
        await loadData();
    };

    const handleReset = async () => {
        await Promise.all([
            ...relationships.map(r => fetch(`/api/projects/${projectId}/qfd/relationships`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requirementId: r.requirementId, technicalCharId: r.technicalCharId, strength: 'NONE' }),
            })),
            fetch(`/api/projects/${projectId}/qfd/correlations`, { method: 'DELETE' }),
            fetch(`/api/projects/${projectId}/qfd/benchmarks`, { method: 'DELETE' }),
        ]);
        setRightColumns([]); setShowResetConfirm(false);
        await loadData(); showToast('QFD 매트릭스가 초기화되었습니다.');
    };

    const setBenchmark = async (reqId: string, company: string, score: number) => {
        await fetch(`/api/projects/${projectId}/qfd/benchmarks`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirementId: reqId, company, score }),
        });
        await loadData();
    };

    const getBenchmark = (reqId: string, company: string) => benchmarksData.find(b => b.requirementId === reqId && b.company === company)?.score || 0;
    const getPlanQuality = (reqId: string) => rightColumns.find(r => r.requirementId === reqId)?.planQuality || 0;
    const setPlanQuality = (reqId: string, val: number) => {
        setRightColumns(prev => {
            const existing = prev.find(r => r.requirementId === reqId);
            if (existing) return prev.map(r => r.requirementId === reqId ? { ...r, planQuality: val } : r);
            return [...prev, { requirementId: reqId, planQuality: val }];
        });
    };

    const getReqAnalysis = (reqId: string) => reqAnalysis.find(a => a.requirementId === reqId);
    const getTechAnalysis = (techId: string) => techAnalysis.find(t => t.technicalCharId === techId);
    const getImprovementRate = (reqId: string) => {
        const self = getBenchmark(reqId, 'self'), plan = getPlanQuality(reqId);
        if (!plan) return 0;
        if (!self) return plan;
        return Math.round((plan / self) * 100) / 100;
    };
    const getAbsoluteImportance = (reqId: string) => {
        const importance = getReqAnalysis(reqId)?.importance || 0;
        return Math.round(importance * getImprovementRate(reqId) * 100) / 100;
    };
    const totalAbsImp = requirements.reduce((s, r) => s + getAbsoluteImportance(r.id), 0);
    const getQualityPct = (reqId: string) => totalAbsImp === 0 ? 0 : Math.round((getAbsoluteImportance(reqId) / totalAbsImp) * 10000) / 100;
    const getRank = (reqId: string) => {
        const sorted = [...requirements].map(r => ({ id: r.id, val: getAbsoluteImportance(r.id) })).sort((a, b) => b.val - a.val);
        const idx = sorted.findIndex(s => s.id === reqId);
        return sorted[idx]?.val > 0 ? idx + 1 : '-';
    };

    const sym = (s: string) => ({ STRONG: '●', MEDIUM: '○', WEAK: '△' }[s] || '—');
    const symColor = (s: string) => ({ STRONG: 'text-emerald-400', MEDIUM: 'text-blue-400', WEAK: 'text-amber-400' }[s] || 'text-gray-700');
    const corrSym = (c: string) => ({ STRONG_POSITIVE: '++', POSITIVE: '+', NEGATIVE: '−', STRONG_NEGATIVE: '−−' }[c] || '');
    const corrColor = (c: string) => ({ STRONG_POSITIVE: 'text-emerald-400 bg-emerald-500/15', POSITIVE: 'text-emerald-300', NEGATIVE: 'text-red-300', STRONG_NEGATIVE: 'text-red-400 bg-red-500/15' }[c] || '');
    const kanoInfo = (cat: string) => ({ M: { l: '당연', c: 'text-red-300', b: 'bg-red-500/15' }, O: { l: '일원', c: 'text-blue-300', b: 'bg-blue-500/15' }, A: { l: '매력', c: 'text-emerald-300', b: 'bg-emerald-500/15' }, I: { l: '무관', c: 'text-gray-400', b: 'bg-white/[0.04]' } }[cat] || { l: '—', c: 'text-gray-500', b: 'bg-white/[0.04]' });

    if (isLoading) return <div className="flex items-center justify-center p-16"><div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full" /></div>;

    const scoreOpts = [0, 1, 2, 3, 4, 5];

    return (
        <div className="space-y-6 relative">
            {/* 토스트 */}
            {toast && (
                <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border animate-fade-in ${toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200' : 'bg-red-900/90 border-red-500/40 text-red-200'}`}>
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={toast.type === 'success' ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} /></svg>
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>
            )}

            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">QFD (품질기능전개)</h2>
                    <p className="text-sm text-gray-500 mt-1">고객 요구사항과 기술특성의 관계 매트릭스 · 셀 클릭으로 편집</p>
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

            {/* 리셋 확인 배너 */}
            {showResetConfirm && (
                <div className="card border-rose-500/25 bg-rose-500/[0.04] animate-fade-in">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <div>
                                <p className="text-white text-sm font-semibold">QFD 매트릭스 초기화</p>
                                <p className="text-rose-300/70 text-xs mt-0.5">모든 관계, 상관, 벤치마크 데이터가 삭제됩니다. 되돌릴 수 없습니다.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowResetConfirm(false)} className="btn-secondary text-sm">취소</button>
                            <button onClick={handleReset} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm rounded-lg transition-colors font-medium">초기화</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 범례 */}
            <div className="card bg-primary-500/[0.04] border-primary-500/15 py-3">
                <div className="flex flex-wrap gap-6 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="text-white font-medium">관계:</span>
                        <span className="text-emerald-400">● 강(9)</span>
                        <span className="text-blue-400">○ 중(3)</span>
                        <span className="text-amber-400">△ 약(1)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-white font-medium">상관:</span>
                        <span className="text-emerald-400 font-bold">++ 강양</span>
                        <span className="text-emerald-300 font-bold">+ 양</span>
                        <span className="text-red-300 font-bold">− 음</span>
                        <span className="text-red-400 font-bold">−− 강음</span>
                    </div>
                </div>
            </div>

            {requirements.length === 0 ? (
                <div className="card text-center py-14">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                        <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    </div>
                    <h3 className="text-lg font-display font-semibold text-gray-300 mb-2">고객 요구사항이 없습니다</h3>
                    <Link href={`/project/${projectId}/requirements`} className="btn-primary inline-flex mt-4">요구사항 입력하기</Link>
                </div>
            ) : (
                <div className="card p-0 overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                        {technicalChars.length > 1 && (
                            <thead>
                                <tr>
                                    <th colSpan={4} className="border-none bg-transparent" />
                                    <th colSpan={technicalChars.length} className="border border-white/[0.06] p-1 bg-white/[0.02] text-gray-500 text-[10px]">기술특성 간 상관관계</th>
                                    <th colSpan={7} className="border-none bg-transparent" />
                                </tr>
                                {technicalChars.map((t1, i) => (
                                    i < technicalChars.length - 1 && (
                                        <tr key={`c-${t1.id}`}>
                                            <td colSpan={4} className="border-none bg-transparent" />
                                            {technicalChars.map((t2, j) => {
                                                if (j <= i) return <td key={j} className="border-none bg-transparent w-[50px]" />;
                                                const cv = getCorrelation(t1.id, t2.id);
                                                return (
                                                    <td key={j} className={`border border-white/[0.06] p-0 text-center w-[50px] ${corrColor(cv)}`}>
                                                        <select value={cv} onChange={e => setCorrelationVal(t1.id, t2.id, e.target.value)} className="w-full bg-transparent border-none text-center text-[10px] cursor-pointer p-1">
                                                            <option value="NONE">—</option>
                                                            <option value="STRONG_POSITIVE">++</option>
                                                            <option value="POSITIVE">+</option>
                                                            <option value="NEGATIVE">−</option>
                                                            <option value="STRONG_NEGATIVE">−−</option>
                                                        </select>
                                                    </td>
                                                );
                                            })}
                                            <td colSpan={7} className="border-none bg-transparent text-[10px] text-gray-600 pl-2 whitespace-nowrap">{t1.name}</td>
                                        </tr>
                                    )
                                ))}
                            </thead>
                        )}
                        <thead>
                            <tr className="bg-white/[0.04]">
                                <th className="border border-white/[0.06] p-2 text-gray-400 text-[10px] text-center w-[80px]" rowSpan={2}>2차 그룹</th>
                                <th className="border border-white/[0.06] p-2 text-gray-400 text-[10px] text-center w-[80px]" rowSpan={2}>1차 그룹</th>
                                <th className="border border-white/[0.06] p-2 text-gray-400 text-[10px] text-center min-w-[120px]" rowSpan={2}>항목</th>
                                <th className="border border-white/[0.06] p-2 text-purple-300 text-[10px] text-center w-[50px]" rowSpan={2}>Kano</th>
                                {technicalChars.map(t => (
                                    <th key={t.id} className="border border-white/[0.06] p-1 text-cyan-300 text-center min-w-[50px] max-w-[70px]" rowSpan={2}>
                                        <div className="text-[10px] font-semibold">{t.name}</div>
                                        {t.unit && <div className="text-[8px] text-gray-500">({t.unit})</div>}
                                    </th>
                                ))}
                                <th className="border border-white/[0.06] p-1 bg-purple-900/15 text-purple-300 text-[10px] text-center" colSpan={2}>비교대상</th>
                                <th className="border border-white/[0.06] p-1 bg-blue-900/15 text-blue-300 text-[10px] text-center" colSpan={2}>경쟁사 비교</th>
                                <th className="border border-white/[0.06] p-1 bg-emerald-900/15 text-emerald-300 text-[10px] text-center" rowSpan={2}>기획<br />품질</th>
                                <th className="border border-white/[0.06] p-1 bg-amber-900/15 text-amber-300 text-[10px] text-center" rowSpan={2}>향상율</th>
                                <th className="border border-white/[0.06] p-1 bg-red-900/15 text-red-300 text-[10px] text-center" rowSpan={2}>절대<br />중요성</th>
                                <th className="border border-white/[0.06] p-1 bg-orange-900/15 text-orange-300 text-[10px] text-center" rowSpan={2}>품질<br />중요%</th>
                                <th className="border border-white/[0.06] p-1 bg-yellow-900/15 text-yellow-300 text-[10px] text-center" rowSpan={2}>RANK</th>
                            </tr>
                            <tr className="bg-white/[0.03]">
                                <th className="border border-white/[0.06] p-1 bg-purple-900/10 text-purple-200 text-[10px] text-center">가중치</th>
                                <th className="border border-white/[0.06] p-1 bg-purple-900/10 text-purple-200 text-[10px] text-center">%</th>
                                <th className="border border-white/[0.06] p-1 bg-blue-900/10 text-blue-200 text-[10px] text-center">자사</th>
                                <th className="border border-white/[0.06] p-1 bg-blue-900/10 text-blue-200 text-[10px] text-center">경쟁사C</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requirements.map(req => {
                                const a = getReqAnalysis(req.id);
                                const ki = kanoInfo(a?.kanoCategory || 'I');
                                const importance = a?.importance || 0;
                                const totalImp = reqAnalysis.reduce((s, x) => s + (x.importance || 0), 0) || 1;
                                const impPct = Math.round((importance / totalImp) * 10000) / 100;
                                const selfScore = getBenchmark(req.id, 'self');
                                const compScore = getBenchmark(req.id, 'competitor');
                                const planQ = getPlanQuality(req.id);
                                const impRate = getImprovementRate(req.id);
                                const absImp = getAbsoluteImportance(req.id);
                                const qualPct = getQualityPct(req.id);
                                const rank = getRank(req.id);
                                return (
                                    <tr key={req.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                        <td className="border border-white/[0.06] p-1 text-blue-300 text-[10px] text-center">{req.subcategory || ''}</td>
                                        <td className="border border-white/[0.06] p-1 text-red-300 text-[10px] text-center">{req.category || ''}</td>
                                        <td className="border border-white/[0.06] p-2 text-white text-[11px]">{req.requirement}</td>
                                        <td className="border border-white/[0.06] p-1 text-center">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ki.b} ${ki.c}`}>{ki.l}</span>
                                        </td>
                                        {technicalChars.map(tech => {
                                            const s = getRelationship(req.id, tech.id);
                                            return (
                                                <td key={tech.id} className="border border-white/[0.06] p-0 text-center">
                                                    <select value={s} onChange={e => setRelationshipVal(req.id, tech.id, e.target.value)}
                                                        className={`w-full p-1 bg-transparent border-none text-center text-lg cursor-pointer hover:bg-white/[0.04] transition-colors ${symColor(s)}`}>
                                                        <option value="NONE">—</option>
                                                        <option value="WEAK">△</option>
                                                        <option value="MEDIUM">○</option>
                                                        <option value="STRONG">●</option>
                                                    </select>
                                                </td>
                                            );
                                        })}
                                        <td className="border border-white/[0.06] p-1 bg-purple-900/[0.06] text-center text-purple-300 text-[11px] font-bold">{importance.toFixed(1)}</td>
                                        <td className="border border-white/[0.06] p-1 bg-purple-900/[0.06] text-center text-purple-200 text-[10px]">{impPct.toFixed(1)}%</td>
                                        <td className="border border-white/[0.06] p-0 bg-blue-900/[0.06] text-center">
                                            <select value={selfScore} onChange={e => setBenchmark(req.id, 'self', parseInt(e.target.value))} className="w-full bg-transparent border-none text-center text-blue-300 text-[11px] cursor-pointer p-1">
                                                {scoreOpts.map(v => <option key={v} value={v}>{v === 0 ? '—' : v}</option>)}
                                            </select>
                                        </td>
                                        <td className="border border-white/[0.06] p-0 bg-blue-900/[0.06] text-center">
                                            <select value={compScore} onChange={e => setBenchmark(req.id, 'competitor', parseInt(e.target.value))} className="w-full bg-transparent border-none text-center text-blue-200 text-[11px] cursor-pointer p-1">
                                                {scoreOpts.map(v => <option key={v} value={v}>{v === 0 ? '—' : v}</option>)}
                                            </select>
                                        </td>
                                        <td className="border border-white/[0.06] p-0 bg-emerald-900/[0.06] text-center">
                                            <select value={planQ} onChange={e => setPlanQuality(req.id, parseInt(e.target.value))} className="w-full bg-transparent border-none text-center text-emerald-300 text-[11px] cursor-pointer p-1">
                                                {scoreOpts.map(v => <option key={v} value={v}>{v === 0 ? '—' : v}</option>)}
                                            </select>
                                        </td>
                                        <td className="border border-white/[0.06] p-1 text-center text-amber-300 text-[11px] font-bold">{impRate ? impRate.toFixed(2) : '—'}</td>
                                        <td className="border border-white/[0.06] p-1 text-center text-red-300 text-[11px] font-bold">{absImp ? absImp.toFixed(2) : '—'}</td>
                                        <td className="border border-white/[0.06] p-1 text-center text-orange-300 text-[11px]">{qualPct ? qualPct.toFixed(1) + '%' : '—'}</td>
                                        <td className={`border border-white/[0.06] p-1 text-center font-bold text-xs ${rank === 1 ? 'bg-yellow-500/15 text-yellow-300' : rank === 2 ? 'bg-gray-500/15 text-gray-300' : rank === 3 ? 'bg-orange-500/15 text-orange-300' : 'text-gray-500'}`}>
                                            {rank === 1 ? '1위' : rank === 2 ? '2위' : rank === 3 ? '3위' : rank}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {technicalChars.length > 0 && (
                            <tfoot>
                                <tr>
                                    <td colSpan={4} className="border border-white/[0.06] p-2 bg-white/[0.04] text-white font-semibold text-[10px]">목표값</td>
                                    {technicalChars.map(t => <td key={t.id} className="border border-white/[0.06] p-1 bg-white/[0.03] text-center text-gray-400 text-[10px]">{t.targetValue || '—'}</td>)}
                                    <td colSpan={7} className="border border-white/[0.06]" />
                                </tr>
                                <tr>
                                    <td colSpan={4} className="border border-white/[0.06] p-2 bg-primary-900/15 text-primary-300 font-semibold text-[10px]">종합 점수</td>
                                    {technicalChars.map(t => {
                                        const ta = getTechAnalysis(t.id);
                                        return <td key={t.id} className="border border-white/[0.06] p-1 bg-primary-900/10 text-center text-primary-300 font-bold text-[11px]">{ta?.totalScore?.toFixed(1) || '0'}</td>;
                                    })}
                                    <td colSpan={7} className="border border-white/[0.06]" />
                                </tr>
                                <tr>
                                    <td colSpan={4} className="border border-white/[0.06] p-2 bg-emerald-900/15 text-emerald-300 font-semibold text-[10px]">우선순위</td>
                                    {technicalChars.map(t => {
                                        const ta = getTechAnalysis(t.id);
                                        const r = ta?.rank || '-';
                                        return <td key={t.id} className={`border border-white/[0.06] p-1 text-center font-bold text-xs ${r === 1 ? 'bg-yellow-500/15 text-yellow-300' : r === 2 ? 'bg-gray-500/15 text-gray-300' : r === 3 ? 'bg-orange-500/15 text-orange-300' : 'text-emerald-400'}`}>
                                            {r === 1 ? '1위' : r === 2 ? '2위' : r === 3 ? '3위' : `#${r}`}
                                        </td>;
                                    })}
                                    <td colSpan={7} className="border border-white/[0.06]" />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                    {technicalChars.length === 0 && (
                        <div className="text-center py-10">
                            <p className="text-gray-500 text-sm mb-3">기술특성을 추가하여 QFD 매트릭스를 작성하세요</p>
                            <button onClick={() => setShowAddTechModal(true)} className="btn-primary text-sm">기술특성 추가</button>
                        </div>
                    )}
                </div>
            )}

            {/* 기술특성 우선순위 요약 */}
            {techAnalysis.length > 0 && (
                <div className="card">
                    <h2 className="text-lg font-display font-bold text-white mb-4">기술특성 우선순위 분석</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[...techAnalysis].sort((a, b) => a.rank - b.rank).map(tech => {
                            const max = Math.max(...techAnalysis.map(t => t.totalScore), 1);
                            const w = (tech.totalScore / max) * 100;
                            return (
                                <div key={tech.technicalCharId} className="card bg-white/[0.02]">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-white font-semibold text-sm">{tech.name}</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${tech.rank <= 3 ? 'bg-yellow-500/15 text-yellow-300' : 'bg-white/[0.04] text-gray-500'}`}>#{tech.rank}</span>
                                    </div>
                                    <div className="w-full bg-white/[0.06] rounded-full h-1.5 mb-1.5">
                                        <div className="bg-gradient-to-r from-primary-500 to-cyan-400 h-1.5 rounded-full transition-all duration-500" style={{ width: `${w}%` }} />
                                    </div>
                                    <div className="text-right text-xs text-gray-500">{tech.totalScore.toFixed(1)}점</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 기술특성 추가 모달 */}
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
                            {[{ label: '기술특성 이름 *', key: 'name' as const, ph: '예: 응답 속도' }, { label: '단위', key: 'unit' as const, ph: '예: ms, %, 점' }, { label: '목표값', key: 'targetValue' as const, ph: '예: 100ms 이하' }].map((item, idx) => (
                                <div key={item.key}>
                                    <label className="block text-sm font-medium text-gray-300 mb-1.5">{item.label}</label>
                                    <input type="text" value={newTech[item.key]} onChange={e => setNewTech({ ...newTech, [item.key]: e.target.value })}
                                        onKeyDown={e => { if (e.key === 'Enter' && idx === 2) handleAddTechnical(); }}
                                        className="input w-full" placeholder={item.ph} autoFocus={idx === 0} />
                                </div>
                            ))}
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
