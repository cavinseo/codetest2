'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { dedupeByAttributeName } from '@/lib/product-attributes-utils';

interface ProductAttribute {
    id: string;
    projectId: string;
    name?: string;
    attribute?: string;
    definition?: string;
    unit?: string;
    targetValue?: string;
    order: number;
}

interface AttributeFitness {
    id: string;
    projectId: string;
    attributeId: string;
    importance: number;
    currentLevel: number;
    targetLevel: number;
    note?: string;
}

type ToastType = 'success' | 'error';

function ScoreSlider({
    value,
    onChange,
    color,
}: {
    value: number;
    onChange: (v: number) => void;
    color: 'red' | 'blue' | 'green';
}) {
    const colorMap = {
        red: {
            track: 'accent-red-400',
            label: (v: number) => v <= 3 ? 'text-red-400' : v <= 6 ? 'text-yellow-400' : 'text-emerald-400',
            bg: (v: number) => v <= 3 ? 'bg-red-500' : v <= 6 ? 'bg-yellow-500' : 'bg-emerald-500',
        },
        blue: {
            track: 'accent-blue-400',
            label: (v: number) => v <= 3 ? 'text-red-400' : v <= 6 ? 'text-yellow-400' : 'text-emerald-400',
            bg: (v: number) => v <= 3 ? 'bg-red-500' : v <= 6 ? 'bg-yellow-500' : 'bg-emerald-500',
        },
        green: {
            track: 'accent-emerald-400',
            label: (v: number) => v <= 3 ? 'text-red-400' : v <= 6 ? 'text-yellow-400' : 'text-emerald-400',
            bg: (v: number) => v <= 3 ? 'bg-red-500' : v <= 6 ? 'bg-yellow-500' : 'bg-emerald-500',
        },
    };
    const c = colorMap[color];
    const pct = Math.round(((value - 1) / 9) * 100);
    const dotColor = c.bg(value);

    return (
        <div className="flex items-center gap-2 w-full">
            <span className={`text-base font-bold font-mono w-6 text-right flex-shrink-0 ${c.label(value)}`}>
                {value}
            </span>
            <div className="relative flex-1 flex items-center">
                <div className="absolute left-0 right-0 h-1.5 rounded-full bg-white/[0.06]" />
                <div
                    className={`absolute left-0 h-1.5 rounded-full transition-all ${dotColor}`}
                    style={{ width: `${pct}%` }}
                />
                <input
                    type="range"
                    min={1}
                    max={10}
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className="relative w-full h-1.5 rounded-full appearance-none bg-transparent cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-4
                        [&::-webkit-slider-thumb]:h-4
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:border-2
                        [&::-webkit-slider-thumb]:border-white/60
                        [&::-webkit-slider-thumb]:bg-white
                        [&::-webkit-slider-thumb]:shadow-md
                        [&::-webkit-slider-thumb]:transition-transform
                        [&::-webkit-slider-thumb]:hover:scale-110"
                />
            </div>
        </div>
    );
}

function GapBadge({ current, target }: { current: number; target: number }) {
    const gap = target - current;
    if (gap === 0) return <span className="text-xs text-gray-500">—</span>;
    if (gap > 0)
        return (
            <span className="inline-flex items-center gap-0.5 text-xs text-amber-400 font-semibold">
                +{gap}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
            </span>
        );
    return (
        <span className="inline-flex items-center gap-0.5 text-xs text-emerald-400 font-semibold">
            {gap}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
        </span>
    );
}

export default function AttributeFitnessPage() {
    const params = useParams();
    const projectId = params.id as string;

    const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
    const [fitnessMap, setFitnessMap] = useState<Record<string, AttributeFitness>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (message: string, type: ToastType = 'success') => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ message, type });
        toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        async function loadData() {
            try {
                const [attrRes, fitRes] = await Promise.all([
                    fetch(`/api/projects/${projectId}/attributes`),
                    fetch(`/api/projects/${projectId}/attributes/fitness`),
                ]);

                if (attrRes.ok) {
                    const data = await attrRes.json();
                    const loadedAttributes: ProductAttribute[] = (data.attributes || [])
                        .filter((attr: ProductAttribute) => (attr.attribute ?? attr.name ?? '').trim())
                        .sort((a: ProductAttribute, b: ProductAttribute) => a.order - b.order);
                    setAttributes(dedupeByAttributeName(loadedAttributes));
                }

                if (fitRes.ok) {
                    const data = await fitRes.json();
                    const fitnesses: AttributeFitness[] = data.fitnesses || [];
                    const map: Record<string, AttributeFitness> = {};
                    fitnesses.forEach(f => { map[f.attributeId] = f; });
                    setFitnessMap(map);
                    if (fitnesses.length > 0) {
                        setSavedAt('저장됨');
                    }
                }
            } catch (error) {
                console.error('데이터 로딩 실패:', error);
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, [projectId]);

    const handleFitnessChange = (attrId: string, field: keyof AttributeFitness, value: any) => {
        setFitnessMap(prev => {
            const existing = prev[attrId] || {
                id: `fit_${Date.now()}_${attrId}`,
                projectId,
                attributeId: attrId,
                importance: 5,
                currentLevel: 3,
                targetLevel: 7,
                note: '',
            };
            return { ...prev, [attrId]: { ...existing, [field]: value } };
        });
        setSavedAt(null);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const fitnesses = Object.values(fitnessMap);
            const response = await fetch(`/api/projects/${projectId}/attributes/fitness`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fitnesses }),
            });
            if (response.ok) {
                setSavedAt('저장됨');
                showToast('적합도 분석이 저장되었습니다.', 'success');
            } else {
                showToast('저장에 실패했습니다.', 'error');
            }
        } catch {
            showToast('저장 중 오류가 발생했습니다.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-surface-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-gray-400">로딩 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative">
            <div className="bg-orb w-[400px] h-[400px] bg-pink-600/50 top-[-200px] right-[20%] opacity-10" />

            {/* 토스트 */}
            {toast && (
                <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border animate-fade-in ${toast.type === 'success'
                        ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200'
                        : 'bg-red-900/90 border-red-500/40 text-red-200'
                    }`}>
                    {toast.type === 'success' ? (
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    )}
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>
            )}

            {/* 헤더 */}
            <header className="relative z-10 glass border-b border-white/[0.06] rounded-none">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href={`/project/${projectId}`} className="btn-ghost text-sm flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                                프로젝트
                            </Link>
                            <div className="w-px h-6 bg-white/10" />
                            <div>
                                <h1 className="text-xl font-display font-bold text-white">[WS-4] 제품 속성 적합도</h1>
                                <p className="text-xs text-gray-500 mt-0.5">중요도·현수준·목표수준을 슬라이더로 설정하세요 (1–10점)</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {savedAt && (
                                <span className="text-xs text-emerald-400 flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    {savedAt}
                                </span>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={isSaving || attributes.length === 0}
                                className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                </svg>
                                {isSaving ? '저장 중...' : '저장'}
                            </button>
                            <Link
                                href={`/project/${projectId}/requirements`}
                                className="btn-secondary text-sm flex items-center gap-2"
                            >
                                다음: 요구사항
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* 메인 */}
            <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 page-enter">

                {/* 안내 + 범례 */}
                <div className="card mb-6 bg-pink-500/[0.04] border-pink-500/15">
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-red-300">중요도</p>
                                <p className="text-[11px] text-gray-500">고객에게 얼마나 중요한지</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-blue-300">현 수준</p>
                                <p className="text-[11px] text-gray-500">현재 제품의 달성 수준</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-emerald-300">목표 수준</p>
                                <p className="text-[11px] text-gray-500">도달해야 할 목표</p>
                            </div>
                        </div>
                        <div className="ml-auto flex items-center gap-4 text-[11px] text-gray-500">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />1–3: 낮음</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" />4–6: 중간</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />7–10: 높음</span>
                        </div>
                    </div>
                </div>

                {attributes.length === 0 ? (
                    <div className="card text-center py-16">
                        <div className="text-gray-600 text-4xl mb-4">⚠️</div>
                        <h3 className="text-lg font-semibold text-gray-300 mb-2">등록된 제품 속성이 없습니다</h3>
                        <p className="text-gray-500 text-sm mb-6">
                            먼저 제품 속성을 정의해야 적합도 분석을 진행할 수 있습니다
                        </p>
                        <Link href={`/project/${projectId}/attributes`} className="btn-primary inline-flex">
                            제품 속성 정의하러 가기
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {attributes.map((attr, idx) => {
                            const attributeName = attr.attribute ?? attr.name ?? '';
                            const fitness = fitnessMap[attr.id] || {
                                id: '',
                                projectId,
                                attributeId: attr.id,
                                importance: 5,
                                currentLevel: 3,
                                targetLevel: 7,
                                note: '',
                            };
                            return (
                                <div key={attr.id} className="card hover:border-white/[0.10] transition-all duration-200">
                                    <div className="flex items-start gap-4">
                                        {/* 번호 + 속성명 */}
                                        <div className="flex-shrink-0 w-[180px]">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs text-gray-600 font-mono">#{idx + 1}</span>
                                                {attr.targetValue && (
                                                    <span className="text-[10px] text-gray-600 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded">
                                                        목표: {attr.targetValue}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm font-semibold text-white leading-snug">{attributeName}</p>
                                            {attr.definition && (
                                                <p className="text-[11px] text-gray-600 mt-1 leading-snug">{attr.definition}</p>
                                            )}
                                        </div>

                                        {/* 슬라이더 영역 */}
                                        <div className="flex-1 space-y-3">
                                            {/* 중요도 */}
                                            <div className="flex items-center gap-3">
                                                <label className="text-[11px] text-red-400 font-semibold w-14 flex-shrink-0">중요도</label>
                                                <ScoreSlider
                                                    value={fitness.importance}
                                                    onChange={(v) => handleFitnessChange(attr.id, 'importance', v)}
                                                    color="red"
                                                />
                                            </div>
                                            {/* 현 수준 */}
                                            <div className="flex items-center gap-3">
                                                <label className="text-[11px] text-blue-400 font-semibold w-14 flex-shrink-0">현 수준</label>
                                                <ScoreSlider
                                                    value={fitness.currentLevel}
                                                    onChange={(v) => handleFitnessChange(attr.id, 'currentLevel', v)}
                                                    color="blue"
                                                />
                                            </div>
                                            {/* 목표 수준 */}
                                            <div className="flex items-center gap-3">
                                                <label className="text-[11px] text-emerald-400 font-semibold w-14 flex-shrink-0">목표</label>
                                                <ScoreSlider
                                                    value={fitness.targetLevel}
                                                    onChange={(v) => handleFitnessChange(attr.id, 'targetLevel', v)}
                                                    color="green"
                                                />
                                            </div>
                                        </div>

                                        {/* Gap + 비고 */}
                                        <div className="flex-shrink-0 w-[140px] space-y-2">
                                            <div className="card py-2 px-3 bg-white/[0.02] border-white/[0.06] text-center">
                                                <p className="text-[10px] text-gray-600 mb-0.5">목표 갭</p>
                                                <GapBadge current={fitness.currentLevel} target={fitness.targetLevel} />
                                            </div>
                                            <input
                                                type="text"
                                                value={fitness.note || ''}
                                                onChange={(e) => handleFitnessChange(attr.id, 'note', e.target.value)}
                                                placeholder="비고..."
                                                className="w-full px-2.5 py-1.5 bg-white/[0.03] border border-white/[0.06] rounded-lg text-white text-xs placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {attributes.length > 0 && (
                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="btn-primary flex items-center gap-2 disabled:opacity-50"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                            </svg>
                            {isSaving ? '저장 중...' : '적합도 저장'}
                        </button>
                        <Link href={`/project/${projectId}/requirements`} className="btn-secondary flex items-center gap-2">
                            다음: 요구사항 입력
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                        </Link>
                    </div>
                )}
            </main>
        </div>
    );
}
