'use client';

import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import {
    buildCustomerNamesByMarketSegment,
    dedupeByAttributeName,
} from '@/lib/product-attributes-utils';

// ──────────────────────────────────
// 타입 정의
// ──────────────────────────────────
interface ProductAttribute {
    id: string;
    attribute?: string;
    techCapability?: string;
    marketSegment?: string;
    customerName?: string;
    customerNeed?: string;
    benefit?: string;
    order: number;
}

type Priority = 'H' | 'M' | 'L' | 'L*' | '';

interface SubSegment {
    id: string;
    name: string;
}

interface Market {
    id: string;
    name: string;           // 세분시장명 (제품속성서에서 자동)
    subSegments: SubSegment[];
}

// 저장 데이터 구조: { [attrId]: { [marketId]: { [subSegId]: Priority } } }
type MatrixData = Record<string, Record<string, Record<string, Priority>>>;

interface FitnessData {
    markets: Market[];
    matrix: MatrixData;
    managerComment?: string;
    consultantComment?: string;
}

const PRIORITY_LEVELS: Priority[] = ['H', 'M', 'L', 'L*'];

const PRIORITY_STYLE: Record<string, string> = {
    H: 'bg-blue-600   text-white   font-bold',
    M: 'bg-emerald-600 text-white  font-bold',
    L: 'bg-yellow-500 text-gray-900 font-bold',
    'L*': 'bg-rose-600   text-white   font-bold',
    '': 'text-gray-600',
};

const PRIORITY_COUNT_COLOR: Record<string, string> = {
    H: 'text-blue-400',
    M: 'text-emerald-400',
    L: 'text-yellow-400',
    'L*': 'text-rose-400',
};

interface Props { projectId: string; }

function createSubSegmentsFromCustomerNames(customerNames: string[], fallbackPrefix: string): SubSegment[] {
    if (customerNames.length > 0) {
        return customerNames.map((name, index) => ({
            id: `sub_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 5)}`,
            name,
        }));
    }

    return [
        { id: `sub_${Date.now()}_${fallbackPrefix}_a`, name: '세분화1' },
        { id: `sub_${Date.now()}_${fallbackPrefix}_b`, name: '세분화2' },
    ];
}

function mergeCustomerNamesIntoSubSegments(market: Market, customerNames: string[]): Market {
    if (customerNames.length === 0) return market;

    const existingNames = new Set(market.subSegments.map((subSegment) => subSegment.name.trim()).filter(Boolean));
    const missingSubSegments = customerNames
        .filter((customerName) => !existingNames.has(customerName))
        .map((customerName, index) => ({
            id: `sub_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 5)}`,
            name: customerName,
        }));

    if (missingSubSegments.length === 0) return market;
    return { ...market, subSegments: [...market.subSegments, ...missingSubSegments] };
}

function getMarketNameTextSize(name: string) {
    const length = name.trim().length;
    if (length >= 14) return 'text-[11px]';
    if (length >= 9) return 'text-xs';
    return 'text-sm';
}

// ──────────────────────────────────
// 셀 컴포넌트 (클릭 순환)
// ──────────────────────────────────
function PriorityCell({
    value, onChange,
}: { value: Priority; onChange: (v: Priority) => void }) {
    const cycle = () => {
        const idx = PRIORITY_LEVELS.indexOf(value);
        onChange(idx < 0 || idx >= PRIORITY_LEVELS.length - 1 ? 'H' : PRIORITY_LEVELS[idx + 1]);
    };
    const clear = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onChange(''); };

    return (
        <td
            className="border border-gray-700/50 text-center cursor-pointer select-none group transition-colors hover:bg-white/[0.04] p-0"
            onClick={cycle}
            onContextMenu={clear}
            title="클릭: 다음 등급 | 우클릭: 초기화"
        >
            <div className={`text-xs px-1 py-2 w-full h-full min-w-[44px] transition-colors ${value ? PRIORITY_STYLE[value] : 'text-gray-700 hover:text-gray-500'}`}>
                {value || '—'}
            </div>
        </td>
    );
}

// ──────────────────────────────────
// 메인 컴포넌트
// ──────────────────────────────────
export default function FitnessWrapper({ projectId }: Props) {
    const [attrs, setAttrs] = useState<ProductAttribute[]>([]);
    const [markets, setMarkets] = useState<Market[]>([]);
    const [matrix, setMatrix] = useState<MatrixData>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [managerComment, setManagerComment] = useState('');
    const [savedConsultantComment, setSavedConsultantComment] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 적합도는 시장 구성·매트릭스·담당자 코멘트를 한 번에 저장한다.
    const { markClean } = useUnsavedChanges({ markets, matrix, managerComment });

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ message, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    // ── 데이터 로드 ──
    const loadData = useCallback(async () => {
        try {
            const attrRes = await fetch(`/api/projects/${projectId}/attributes`);
            if (!attrRes.ok) return;
            const attrData = await attrRes.json();
            const loadedAttrs: ProductAttribute[] = (attrData.attributes || [])
                .filter((a: ProductAttribute) => a.attribute?.trim())
                .sort((a: ProductAttribute, b: ProductAttribute) => a.order - b.order);
            const uniqueAttrs = dedupeByAttributeName(loadedAttrs);
            setAttrs(uniqueAttrs);

            // 세분시장과 세분화명을 제품속성서에서 자동 수집
            const segmentSet = new Set<string>();
            loadedAttrs.forEach(a => { if (a.marketSegment?.trim()) segmentSet.add(a.marketSegment.trim()); });
            const customerNamesBySegment = buildCustomerNamesByMarketSegment(loadedAttrs);

            // 저장된 피트니스 데이터 로드 (DB)
            const fitnessRes = await fetch(`/api/projects/${projectId}/fitness-matrix`);
            let savedData: FitnessData | null = null;
            if (fitnessRes.ok) {
                const fitnessData = await fitnessRes.json();
                if (fitnessData?.fitnessMatrix) {
                    try {
                        const fm = fitnessData.fitnessMatrix;
                        savedData = {
                            markets: JSON.parse(fm.marketsJson || '[]'),
                            matrix: JSON.parse(fm.matrixJson || '{}'),
                            managerComment: fm.managerComment || '',
                            consultantComment: fm.consultantNote || '',
                        };
                    } catch { }
                }
            }

            if (savedData) {
                // 기존 저장 데이터와 세분시장/고객명 세분화 병합
                const existingMarketNames = new Set(savedData.markets.map(m => m.name));
                const newMarkets = savedData.markets.map((market) =>
                    mergeCustomerNamesIntoSubSegments(market, customerNamesBySegment[market.name] || [])
                );
                segmentSet.forEach(seg => {
                    if (!existingMarketNames.has(seg)) {
                        newMarkets.push({
                            id: `mkt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                            name: seg,
                            subSegments: createSubSegmentsFromCustomerNames(customerNamesBySegment[seg] || [], seg),
                        });
                    }
                });
                setMarkets(newMarkets);
                setMatrix(savedData.matrix || {});
                if (savedData.managerComment) setManagerComment(savedData.managerComment);
                if (savedData.consultantComment) setSavedConsultantComment(savedData.consultantComment);
                markClean({
                    markets: newMarkets,
                    matrix: savedData.matrix || {},
                    managerComment: savedData.managerComment || '',
                });
            } else {
                // 신규: 세분시장 자동 생성
                const newMarkets: Market[] = [];
                segmentSet.forEach((seg) => {
                    newMarkets.push({
                        id: `mkt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        name: seg,
                        subSegments: createSubSegmentsFromCustomerNames(customerNamesBySegment[seg] || [], seg),
                    });
                });
                // 세분시장이 없으면 기본 예시 하나
                if (newMarkets.length === 0) {
                    newMarkets.push({
                        id: `mkt_default`,
                        name: '시장 A',
                        subSegments: [
                            { id: 'sub_d1', name: '세분화1' },
                            { id: 'sub_d2', name: '세분화2' },
                        ],
                    });
                }
                setMarkets(newMarkets);
                setMatrix({});
                markClean({ markets: newMarkets, matrix: {}, managerComment: '' });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [projectId, markClean]);

    useEffect(() => { loadData(); }, [loadData]);

    // ── 셀 값 가져오기 ──
    const getCell = (attrId: string, mktId: string, subId: string): Priority => {
        return matrix?.[attrId]?.[mktId]?.[subId] ?? '';
    };

    // ── 셀 값 변경 ──
    const setCell = (attrId: string, mktId: string, subId: string, value: Priority) => {
        setMatrix(prev => ({
            ...prev,
            [attrId]: {
                ...(prev[attrId] || {}),
                [mktId]: {
                    ...(prev[attrId]?.[mktId] || {}),
                    [subId]: value,
                },
            },
        }));
    };

    // ── 세분화 추가 ──
    const addSubSegment = (mktId: string) => {
        setMarkets(prev => prev.map(m =>
            m.id !== mktId ? m : {
                ...m,
                subSegments: [...m.subSegments, {
                    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                    name: `세분화${m.subSegments.length + 1}`,
                }],
            }
        ));
    };

    // ── 세분화 삭제 ──
    const removeSubSegment = (mktId: string, subId: string) => {
        setMarkets(prev => prev.map(m =>
            m.id !== mktId ? m : {
                ...m,
                subSegments: m.subSegments.filter(s => s.id !== subId),
            }
        ));
    };

    // ── 시장 삭제 ──
    const removeMarket = (mktId: string) => {
        setMarkets(prev => prev.length <= 1 ? prev : prev.filter(m => m.id !== mktId));
        setMatrix(prev => {
            const next: MatrixData = {};
            Object.entries(prev).forEach(([attrId, marketValues]) => {
                const { [mktId]: _removed, ...remainingMarkets } = marketValues;
                next[attrId] = remainingMarkets;
            });
            return next;
        });
    };

    // ── 세분화명 변경 ──
    const renameSubSegment = (mktId: string, subId: string, name: string) => {
        setMarkets(prev => prev.map(m =>
            m.id !== mktId ? m : {
                ...m,
                subSegments: m.subSegments.map(s => s.id === subId ? { ...s, name } : s),
            }
        ));
    };

    // ── 시장명 변경 ──
    const renameMarket = (mktId: string, name: string) => {
        setMarkets(prev => prev.map(m => m.id !== mktId ? m : { ...m, name }));
    };

    // ── 우선순위 집계 ──
    const countPriority = (mktId: string, subId: string, p: Priority): number => {
        return attrs.filter(a => getCell(a.id, mktId, subId) === p).length;
    };

    // ── 세분화별 순위 계산
    // H 개수 내림차순 → 동수면 M 개수 → 동수면 동률
    // L*가 하나라도 있으면 '부적합' 처리
    type SubRank = { rank: number | null; label: string; isTie: boolean; isIneligible: boolean };
    const computeSubRankings = (): Map<string, SubRank> => {
        // key = `${mktId}-${subId}`
        const scores: { key: string; hasLStar: boolean; countH: number; countM: number }[] = [];
        markets.forEach(m =>
            m.subSegments.forEach(s => {
                const key = `${m.id}-${s.id}`;
                const hasLStar = attrs.some(a => getCell(a.id, m.id, s.id) === 'L*');
                const countH = attrs.filter(a => getCell(a.id, m.id, s.id) === 'H').length;
                const countM = attrs.filter(a => getCell(a.id, m.id, s.id) === 'M').length;
                scores.push({ key, hasLStar, countH, countM });
            })
        );

        const resultMap = new Map<string, SubRank>();

        // 부적합 먼저 시평
        scores.forEach(s => {
            if (s.hasLStar) {
                resultMap.set(s.key, { rank: null, label: '부적합', isTie: false, isIneligible: true });
            }
        });

        // 적점 대상(L* 없는 세분화)만 정렬
        const eligible = scores.filter(s => !s.hasLStar);
        eligible.sort((a, b) => b.countH !== a.countH ? b.countH - a.countH : b.countM - a.countM);

        // 순위 부여: 같은 H+M이면 동률
        let currentRank = 1;
        for (let i = 0; i < eligible.length; i++) {
            const e = eligible[i];
            if (i > 0) {
                const prev = eligible[i - 1];
                const isSame = e.countH === prev.countH && e.countM === prev.countM;
                if (!isSame) currentRank = i + 1;
            }
            const isTie = eligible.filter(x => x.countH === e.countH && x.countM === e.countM).length > 1;
            resultMap.set(e.key, {
                rank: currentRank,
                label: isTie ? `${currentRank}순위 (동률)` : `${currentRank}순위`,
                isTie,
                isIneligible: false,
            });
        }
        return resultMap;
    };

    // ── 컨설턴트 자동 코멘트 생성 ──
    const generateConsultantComment = (): string => {
        const totalAttrs = attrs.length;
        if (totalAttrs === 0) return '';
        const rankMap = computeSubRankings();
        const allSubs: { mkt: Market; sub: SubSegment; key: string }[] = [];
        markets.forEach(m => m.subSegments.forEach(s => allSubs.push({ mkt: m, sub: s, key: `${m.id}-${s.id}` })));
        const ineligible = allSubs.filter(x => rankMap.get(x.key)?.isIneligible);
        const rank1 = allSubs.filter(x => rankMap.get(x.key)?.rank === 1 && !rankMap.get(x.key)?.isIneligible);
        const hasTie = rank1.length > 1;
        const lines: string[] = [];

        lines.push('[종합 평가]');
        if (rank1.length === 0 && ineligible.length === allSubs.length) {
            lines.push('• 분석 대상 세분시장 전체가 L*(부적합) 등급을 포함하고 있어 진입 전략 재검토가 필요합니다.');
        } else if (rank1.length > 0) {
            const names = rank1.map(x => `${x.mkt.name}-${x.sub.name}`).join(', ');
            lines.push(`• 최우선 진입 세분시장: ${names}${hasTie ? ' (동률)' : ''}`);
            const topH = attrs.filter(a => getCell(a.id, rank1[0].mkt.id, rank1[0].sub.id) === 'H').length;
            const topM = attrs.filter(a => getCell(a.id, rank1[0].mkt.id, rank1[0].sub.id) === 'M').length;
            const topL = attrs.filter(a => getCell(a.id, rank1[0].mkt.id, rank1[0].sub.id) === 'L').length;
            lines.push(`• 1순위 시장 속성 분포: H ${topH}개 / M ${topM}개 / L ${topL}개 (전체 ${totalAttrs}개)`);
            if (topH / totalAttrs >= 0.5) lines.push('• H 비율이 50% 이상으로 제품 경쟁력이 높은 시장입니다.');
            else if (topH / totalAttrs >= 0.3) lines.push('• H 비율이 30~50% 수준으로 일부 강점이 있으나 개선 여지가 존재합니다.');
            else lines.push('• H 비율이 낮아 핵심 속성 강화 전략이 필요합니다.');
        }
        if (ineligible.length > 0) {
            lines.push(`• 부적합 시장: ${ineligible.map(x => `${x.mkt.name}-${x.sub.name}`).join(', ')} — L* 속성 개선 후 재평가를 권장합니다.`);
        }

        lines.push('');
        lines.push('[속성 분석]');
        if (rank1.length > 0) {
            const strongAttrs = attrs.filter(a => getCell(a.id, rank1[0].mkt.id, rank1[0].sub.id) === 'H');
            const weakAttrs = attrs.filter(a => getCell(a.id, rank1[0].mkt.id, rank1[0].sub.id) === 'L');
            if (strongAttrs.length > 0) lines.push(`• 핵심 강점 속성 (H): ${strongAttrs.map(a => a.attribute).join(', ')}`);
            if (weakAttrs.length > 0) lines.push(`• 개선 필요 속성 (L): ${weakAttrs.map(a => a.attribute).join(', ')}`);
        }

        lines.push('');
        lines.push('[권고사항]');
        if (hasTie && rank1.length > 1) {
            lines.push(`• 동률 1순위 시장이 ${rank1.length}개입니다. M 등급 세분 분석을 통해 우선순위를 확정하세요.`);
        } else if (rank1.length === 1) {
            lines.push(`• ${rank1[0].mkt.name}-${rank1[0].sub.name} 시장을 주요 공략 대상으로 마케팅/R&D 자원을 집중하세요.`);
        }
        if (ineligible.length > 0) {
            lines.push(`• 부적합 시장의 L* 속성을 파악하고 제품 개선 로드맵에 반영하세요.`);
        }
        return lines.join('\n');
    };

    // ── 저장 ──
    const handleSave = async () => {
        setIsSaving(true);
        try {
            const consultantComment = generateConsultantComment();
            setSavedConsultantComment(consultantComment);
            const res = await fetch(`/api/projects/${projectId}/fitness-matrix`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    marketsJson: JSON.stringify(markets),
                    matrixJson: JSON.stringify(matrix),
                    managerComment,
                    consultantNote: consultantComment,
                }),
            });
            if (res.ok) {
                markClean({ markets, matrix, managerComment });
                showToast('저장되었습니다. 컨설턴트 진단이 업데이트되었습니다.');
            } else {
                showToast('저장에 실패했습니다.', 'error');
            }
        } catch {
            showToast('저장에 실패했습니다.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // ── 총 열 수 계산 (세분화 추가 버튼 열 포함)
    const totalSubCols = markets.reduce((s, m) => s + m.subSegments.length + 1, 0);
    const marketOptions = useMemo(() => Array.from(new Set(markets.map((market) => market.name.trim()).filter(Boolean))), [markets]);
    const subSegmentOptions = useMemo(() => Array.from(new Set(markets.flatMap((market) => market.subSegments.map((subSegment) => subSegment.name.trim())).filter(Boolean))), [markets]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-16">
                <div className="animate-spin h-7 w-7 border-2 border-primary-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (attrs.length === 0) {
        return (
            <div className="card text-center py-16">
                <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
                    <svg className="w-7 h-7 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10" />
                    </svg>
                </div>
                <h3 className="text-lg font-display font-semibold text-gray-300 mb-2">제품 속성이 없습니다</h3>
                <p className="text-gray-500 text-sm">먼저 제품속성서 탭에서 속성을 추가하세요</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 relative">
            <datalist id={`fitness-market-options-${projectId}`}>
                {marketOptions.map((option) => (
                    <option key={option} value={option} />
                ))}
            </datalist>
            <datalist id={`fitness-sub-segment-options-${projectId}`}>
                {subSegmentOptions.map((option) => (
                    <option key={option} value={option} />
                ))}
            </datalist>
            {/* 토스트 */}
            {toast && (
                <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border animate-fade-in ${toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200' : 'bg-red-900/90 border-red-500/40 text-red-200'}`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={toast.type === 'success' ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} />
                    </svg>
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>
            )}

            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">[WS-4] 제품 속성 적합도</h2>
                    <p className="text-sm text-gray-500 mt-0.5">셀 클릭으로 우선순위 입력 · 우클릭으로 초기화</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleSave} disabled={isSaving} className="btn-primary text-sm flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>

            {/* 범례 */}
            <div className="flex items-center gap-4 text-xs px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] flex-wrap">
                {PRIORITY_LEVELS.map(p => (
                    <span key={p} className={`inline-flex items-center gap-1.5`}>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${PRIORITY_STYLE[p]}`}>{p}</span>
                        <span className="text-gray-500">{p === 'H' ? '높음' : p === 'M' ? '중간' : p === 'L' ? '낮음' : '최저'}</span>
                    </span>
                ))}
                <span className="ml-auto text-gray-600">셀 클릭 → H → M → L → L* 순환</span>
            </div>

            {/* 엑셀 형태 테이블 */}
            <div className="overflow-x-auto rounded-xl border border-gray-700/60 bg-gray-900/60">
                <table className="border-collapse text-xs w-full">
                    <thead>
                        {/* 1행: 타이틀 */}
                        <tr className="bg-gray-800/90">
                            <th
                                rowSpan={2}
                                className="border border-gray-600/60 px-3 py-2.5 text-left text-gray-300 font-semibold text-sm min-w-[180px] align-middle"
                            >
                                속성
                            </th>
                            {markets.map(mkt => (
                                // 세분화 수 + 추가 버튼 열(1) = colSpan
                                <th
                                    key={mkt.id}
                                    colSpan={mkt.subSegments.length + 1}
                                    className="border border-gray-600/60 px-3 py-1.5 text-center group"
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        <input
                                            type="text"
                                            list={`fitness-market-options-${projectId}`}
                                            value={mkt.name}
                                            onChange={e => renameMarket(mkt.id, e.target.value)}
                                            className={`text-center bg-transparent text-white font-semibold outline-none focus:bg-white/10 rounded px-1.5 py-0.5 min-w-0 flex-1 ${getMarketNameTextSize(mkt.name)}`}
                                            placeholder="시장명"
                                        />
                                        {markets.length > 1 && (
                                            <button
                                                onClick={() => removeMarket(mkt.id)}
                                                className="opacity-0 group-hover:opacity-100 text-rose-500/70 hover:text-rose-400 transition-all flex-shrink-0"
                                                title="시장 삭제"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                        {/* 2행: 세분화 + 추가 버튼 */}
                        <tr className="bg-gray-800/70">
                            {markets.map(mkt => (
                                <Fragment key={mkt.id}>
                                    {mkt.subSegments.map(sub => (
                                        <th
                                            key={sub.id}
                                            className="border border-gray-600/60 px-1 py-1 text-center min-w-[60px] group"
                                        >
                                            <div className="flex items-center justify-center gap-1">
                                                <input
                                                    type="text"
                                                    list={`fitness-sub-segment-options-${projectId}`}
                                                    value={sub.name}
                                                    onChange={e => renameSubSegment(mkt.id, sub.id, e.target.value)}
                                                    className="text-center bg-transparent text-gray-400 outline-none w-[70px] text-xs focus:text-white focus:bg-white/10 rounded px-1"
                                                />
                                                {mkt.subSegments.length > 1 && (
                                                    <button
                                                        onClick={() => removeSubSegment(mkt.id, sub.id)}
                                                        className="opacity-0 group-hover:opacity-100 text-rose-500/70 hover:text-rose-400 transition-all flex-shrink-0"
                                                        title="삭제"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                    {/* 세분화 추가 버튼 열 */}
                                    <th
                                        key={`${mkt.id}-add`}
                                        className="border border-gray-600/60 px-1 py-1 text-center w-[36px]"
                                    >
                                        <button
                                            onClick={() => addSubSegment(mkt.id)}
                                            className="w-full h-full flex items-center justify-center text-gray-600 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors py-1 px-1.5"
                                            title={`${mkt.name}에 세분화 추가`}
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </button>
                                    </th>
                                </Fragment>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {/* 속성 행 */}
                        {attrs.map((attr, idx) => (
                            <tr key={attr.id} className={`transition-colors hover:bg-white/[0.02] ${idx % 2 === 0 ? 'bg-gray-900/40' : 'bg-gray-900/20'}`}>
                                <td className="border border-gray-700/50 px-3 py-2 text-white font-medium min-w-[240px]">
                                    <div className="max-w-[340px]">
                                        <div className="whitespace-normal break-keep leading-snug">{attr.attribute}</div>
                                    </div>
                                </td>
                                {markets.map(mkt => (
                                    <Fragment key={mkt.id}>
                                        {mkt.subSegments.map(sub => (
                                            <PriorityCell
                                                key={`${attr.id}-${mkt.id}-${sub.id}`}
                                                value={getCell(attr.id, mkt.id, sub.id)}
                                                onChange={v => setCell(attr.id, mkt.id, sub.id, v)}
                                            />
                                        ))}
                                        {/* 추가 버튼 열 (빈 셀) */}
                                        <td key={`${attr.id}-${mkt.id}-add`} className="border border-gray-700/30 bg-gray-900/10 w-[36px]" />
                                    </Fragment>
                                ))}
                            </tr>
                        ))}
                    </tbody>

                    <tfoot>
                        {/* 구분선 */}
                        <tr>
                            <td colSpan={1 + totalSubCols} className="border-t-2 border-gray-500/60 p-0" />
                        </tr>
                        {/* 우선순위 집계 헤더 */}
                        <tr className="bg-gray-800/80">
                            <td className="border border-gray-600/60 px-3 py-2 text-gray-400 font-semibold text-xs">
                                우선순위
                            </td>
                            {markets.map(mkt => (
                                <Fragment key={mkt.id}>
                                    {mkt.subSegments.map(sub => (
                                        <td key={`${mkt.id}-${sub.id}-hdr`} className="border border-gray-600/60 px-2 py-2 text-center text-gray-500 text-[10px]">
                                            개수
                                        </td>
                                    ))}
                                    <td key={`${mkt.id}-add-hdr`} className="border border-gray-600/60 w-[36px] bg-gray-800/50" />
                                </Fragment>
                            ))}
                        </tr>
                        {/* H / M / L / L* 집계 행 */}
                        {PRIORITY_LEVELS.map(p => (
                            <tr key={p} className="hover:bg-white/[0.02]">
                                <td className="border border-gray-700/50 px-3 py-1.5">
                                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${PRIORITY_STYLE[p]}`}>{p}</span>
                                </td>
                                {markets.map(mkt => (
                                    <Fragment key={mkt.id}>
                                        {mkt.subSegments.map(sub => {
                                            const cnt = countPriority(mkt.id, sub.id, p);
                                            return (
                                                <td key={`${mkt.id}-${sub.id}-${p}`} className="border border-gray-700/50 px-2 py-1.5 text-center">
                                                    <span className={`text-sm font-mono font-bold ${cnt > 0 ? PRIORITY_COUNT_COLOR[p] : 'text-gray-700'}`}>
                                                        {cnt || '0'}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                        <td key={`${mkt.id}-${p}-add`} className="border border-gray-700/30 w-[36px] bg-gray-900/10" />
                                    </Fragment>
                                ))}
                            </tr>
                        ))}
                        {/* 세분화 간 비교 순위 헤더 */}
                        <tr className="bg-indigo-900/30">
                            <td className="border border-indigo-500/30 px-3 py-1.5 text-indigo-300 font-semibold text-xs">
                                세분시장 순위
                            </td>
                            {(() => {
                                const rankMap = computeSubRankings();
                                return markets.map(mkt => (
                                    <Fragment key={mkt.id}>
                                        {mkt.subSegments.map(sub => {
                                            const r = rankMap.get(`${mkt.id}-${sub.id}`);
                                            if (!r) return <td key={`${mkt.id}-${sub.id}-rank`} className="border border-indigo-500/20 px-2 py-2 text-center"><span className="text-gray-600 text-xs">—</span></td>;
                                            if (r.isIneligible) return (
                                                <td key={`${mkt.id}-${sub.id}-rank`} className="border border-indigo-500/20 px-2 py-2 text-center">
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-600 text-white">부적합</span>
                                                </td>
                                            );
                                            return (
                                                <td key={`${mkt.id}-${sub.id}-rank`} className="border border-indigo-500/20 px-2 py-2 text-center">
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${r.rank === 1 ? 'bg-amber-500 text-gray-900'
                                                        : r.rank === 2 ? 'bg-gray-400 text-gray-900'
                                                            : r.rank === 3 ? 'bg-amber-700/80 text-white'
                                                                : 'bg-gray-700 text-gray-300'
                                                        }`}>{r.label}</span>
                                                </td>
                                            );
                                        })}
                                        <td key={`${mkt.id}-rank-add`} className="border border-indigo-500/20 w-[36px] bg-gray-900/10" />
                                    </Fragment>
                                ));
                            })()}
                        </tr>
                    </tfoot>
                </table>
            </div>

            <p className="text-xs text-gray-600">
                총 {attrs.length}개 속성 · {markets.length}개 시장 · {markets.reduce((s, m) => s + m.subSegments.length, 0)}개 세분화
            </p>

            {/* ── 결과 분석 & 담당자 의견 패널 ── */}
            <div className="space-y-3 pt-2">
                {/* 컨설턴트 자동 진단 */}
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/30 p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-indigo-300">컨설턴트 진단</h3>
                            <p className="text-xs text-gray-500">
                                {savedConsultantComment ? '저장 시 자동 생성된 진단 결과' : '저장 버튼을 누르면 분석 결과가 생성됩니다'}
                            </p>
                        </div>
                    </div>
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed font-sans bg-black/20 rounded-lg px-4 py-3">
                        {savedConsultantComment || '─ 아직 진단 결과가 없습니다. 우선순위 입력 후 저장 버튼을 눌러 진단을 생성하세요. ─'}
                    </pre>
                </div>

                {/* 담당자 의견 */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-300">담당자 의견</h3>
                            <p className="text-xs text-gray-500">분석 결과에 대한 의견 또는 추가 사항을 입력하세요 (저장 시 함께 보관)</p>
                        </div>
                    </div>
                    <textarea
                        value={managerComment}
                        onChange={e => setManagerComment(e.target.value)}
                        placeholder="예) 시장 A의 세분화1은 현재 주요 성장 시장으로, 해당 시장 중심의 마케팅 전략을 수립할 필요가 있습니다."
                        rows={5}
                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-gray-200 placeholder:text-gray-600 outline-none focus:border-primary-500/40 focus:bg-white/[0.05] transition-colors resize-none leading-relaxed"
                    />
                    <div className="flex justify-end mt-2">
                        <span className="text-xs text-gray-600">{managerComment.length}자 · 상단 저장 버튼으로 함께 보관</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
