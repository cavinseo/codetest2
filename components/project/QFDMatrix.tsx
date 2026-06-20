'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { buildQfdSpecFooterRows } from '@/lib/qfd-footer-rows';
import {
    chunkTechnicalIndexes,
    findCoreIdForSubName,
    getQfdCoreOptions,
    getQfdSubOptions,
} from '@/lib/qfd-technical-header';

interface Requirement {
    id: string;
    category: string;
    subcategory?: string | null;
    requirement: string;
}

interface TechnicalChar {
    id: string;
    name: string;
    unit?: string | null;
    targetValue?: string | null;
}

interface SpecFunction {
    id: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string | null;
    name: string;
    order?: number | null;
}

interface Relationship {
    requirementId: string;
    technicalCharId: string;
    strength: 'STRONG' | 'MEDIUM' | 'WEAK' | 'NONE';
}

interface RequirementAnalysis {
    requirementId: string;
    weight: number;
    weightPercent: number;
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
    unit?: string | null;
    targetValue?: string | null;
    totalScore: number;
    rank: number | null;
    importancePercent: number;
}

interface Benchmark {
    requirementId: string;
    company: string;
    score: number;
}

interface QFDMatrixProps {
    projectId: string;
}

type DisplayTechnical = TechnicalChar & { isPlaceholder?: boolean };
type ToastType = 'success' | 'error';
type VisibleTechnicalColumn = { tech: DisplayTechnical; index: number };
type PendingBenchmarkScores = Record<string, number>;

const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5];
const MIN_WORKSHEET_TECH_COLUMNS = 15;
const SELF_COMPANY = 'self';
const DEFAULT_COMPETITOR_COMPANY = 'competitor';
const DEFAULT_COMPETITOR_LABEL = '경쟁사';

const RELATIONSHIP_OPTIONS: Array<{
    value: Relationship['strength'];
    label: string;
    score: string;
    className: string;
}> = [
    { value: 'NONE', label: '-', score: '0', className: 'text-slate-500' },
    { value: 'WEAK', label: '△', score: '1', className: 'text-amber-300' },
    { value: 'MEDIUM', label: '○', score: '3', className: 'text-sky-300' },
    { value: 'STRONG', label: '◎', score: '9', className: 'text-emerald-300' },
];

function formatNumber(value: number | undefined | null, digits = 1) {
    if (!Number.isFinite(value ?? NaN) || value === 0) return '-';
    return Number(value).toFixed(digits);
}

function normalizeCompetitorName(value: string) {
    const name = value.trim();
    return name === DEFAULT_COMPETITOR_LABEL ? DEFAULT_COMPETITOR_COMPANY : name;
}

function getCompetitorLabel(company: string) {
    return company === DEFAULT_COMPETITOR_COMPANY ? DEFAULT_COMPETITOR_LABEL : company;
}

function benchmarkKey(requirementId: string, company: string) {
    return `${requirementId}::${company}`;
}

function getRequirementGroupRowSpan(
    requirements: Requirement[],
    startIndex: number,
    field: 'category' | 'subcategory',
) {
    const startRequirement = requirements[startIndex];
    if (!startRequirement) return 1;

    const category = startRequirement.category || '';
    const subcategory = startRequirement.subcategory || '';
    let span = 1;

    for (let index = startIndex + 1; index < requirements.length; index += 1) {
        const requirement = requirements[index];
        if ((requirement.category || '') !== category) break;
        if (field === 'subcategory' && (requirement.subcategory || '') !== subcategory) break;
        span += 1;
    }

    return span;
}

export default function QFDMatrix({ projectId }: QFDMatrixProps) {
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [technicalChars, setTechnicalChars] = useState<TechnicalChar[]>([]);
    const [specFunctions, setSpecFunctions] = useState<SpecFunction[]>([]);
    const [relationships, setRelationships] = useState<Relationship[]>([]);
    const [reqAnalysis, setReqAnalysis] = useState<RequirementAnalysis[]>([]);
    const [techAnalysis, setTechAnalysis] = useState<TechnicalAnalysis[]>([]);
    const [benchmarksData, setBenchmarksData] = useState<Benchmark[]>([]);
    const [pendingBenchmarks, setPendingBenchmarks] = useState<PendingBenchmarkScores>({});
    const [isSavingBenchmarks, setIsSavingBenchmarks] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddTechModal, setShowAddTechModal] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [newTech, setNewTech] = useState({ name: '', unit: '', targetValue: '' });
    const [newCompetitorName, setNewCompetitorName] = useState('');
    const [extraCompetitors, setExtraCompetitors] = useState<string[]>([]);
    const [isAddingCompetitor, setIsAddingCompetitor] = useState(false);
    const [selectedCoreByGroup, setSelectedCoreByGroup] = useState<Record<number, string>>({});
    const [collapsedTechnicalGroups, setCollapsedTechnicalGroups] = useState<Record<number, boolean>>({});
    const [removingCompetitor, setRemovingCompetitor] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
    const [dataError, setDataError] = useState<string | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const competitorColumns = useMemo(() => {
        const companies = [
            ...benchmarksData
                .map((item) => item.company)
                .filter((company) => company && company !== SELF_COMPANY),
            ...extraCompetitors,
        ];
        const uniqueCompanies = Array.from(new Set(companies));
        return uniqueCompanies.length > 0 ? uniqueCompanies : [DEFAULT_COMPETITOR_COMPANY];
    }, [benchmarksData, extraCompetitors]);
    const competitorNameOptions = useMemo(
        () => Array.from(new Set(competitorColumns.map((company) => getCompetitorLabel(company)).filter(Boolean))),
        [competitorColumns]
    );
    const technicalNameOptions = useMemo(
        () => Array.from(new Set(technicalChars.map((tech) => tech.name.trim()).filter(Boolean))),
        [technicalChars]
    );
    const technicalUnitOptions = useMemo(
        () => Array.from(new Set(technicalChars.map((tech) => (tech.unit || '').trim()).filter(Boolean))),
        [technicalChars]
    );
    const technicalTargetValueOptions = useMemo(
        () => Array.from(new Set(technicalChars.map((tech) => (tech.targetValue || '').trim()).filter(Boolean))),
        [technicalChars]
    );

    const benchmarkColumnCount = 1 + competitorColumns.length;
    const rightSideColumnSpan = 8 + competitorColumns.length;
    const scoreSelectClassName = 'h-[31px] w-full cursor-pointer border-none bg-white p-1 text-center font-semibold text-slate-950 outline-none hover:bg-cyan-50';

    const showToast = (message: string, type: ToastType = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ message, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setDataError(null);
        try {
            const [requirementsRes, technicalRes, relationshipsRes, analysisRes, benchmarksRes, specRes] = await Promise.all([
                fetch(`/api/projects/${projectId}/requirements`),
                fetch(`/api/projects/${projectId}/qfd/technical`),
                fetch(`/api/projects/${projectId}/qfd/relationships`),
                fetch(`/api/projects/${projectId}/qfd/analysis`),
                fetch(`/api/projects/${projectId}/qfd/benchmarks`),
                fetch(`/api/projects/${projectId}/spec`),
            ]);

            const failedResponse = [requirementsRes, technicalRes, relationshipsRes, analysisRes, benchmarksRes, specRes].find((response) => !response.ok);
            if (failedResponse) {
                const body = await failedResponse.json().catch(() => null);
                throw new Error(body?.error || 'QFD 데이터를 불러오지 못했습니다.');
            }

            if (requirementsRes.ok) {
                const data = await requirementsRes.json();
                setRequirements(data.requirements || []);
            }
            if (technicalRes.ok) {
                const data = await technicalRes.json();
                setTechnicalChars(data.technicalCharacteristics || []);
            }
            if (relationshipsRes.ok) {
                const data = await relationshipsRes.json();
                setRelationships(data.relationships || []);
            }
            if (analysisRes.ok) {
                const data = await analysisRes.json();
                setReqAnalysis(data.requirements || []);
                setTechAnalysis(data.technicals || []);
            }
            if (benchmarksRes.ok) {
                const data = await benchmarksRes.json();
                setBenchmarksData(data.benchmarks || []);
            }
            if (specRes.ok) {
                const data = await specRes.json();
                setSpecFunctions(data.specFunctions || []);
            }
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : 'QFD 데이터를 불러오지 못했습니다.';
            setDataError(message);
            showToast(message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

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

    const setRelationshipVal = async (requirementId: string, technicalCharId: string, strength: Relationship['strength']) => {
        const res = await fetch(`/api/projects/${projectId}/qfd/relationships`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirementId, technicalCharId, strength }),
        });

        if (!res.ok) {
            showToast('관계 강도를 저장하지 못했습니다.', 'error');
            return;
        }
        await loadData();
    };

    const setTechnicalSubFunction = async (tech: DisplayTechnical, subName: string) => {
        const name = subName.trim();
        if (!name) return;

        const method = tech.isPlaceholder ? 'POST' : 'PATCH';
        const body = tech.isPlaceholder
            ? { name, unit: '', targetValue: '' }
            : { id: tech.id, name, unit: tech.unit || '', targetValue: tech.targetValue || '' };

        const res = await fetch(`/api/projects/${projectId}/qfd/technical`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => null);
            showToast(errorData?.error || '세부기능을 저장하지 못했습니다.', 'error');
            return;
        }

        await loadData();
        showToast('QFD 기술특성을 저장했습니다.');
    };

    const setBenchmark = (requirementId: string, company: string, score: number) => {
        setPendingBenchmarks((items) => ({
            ...items,
            [benchmarkKey(requirementId, company)]: score,
        }));
    };

    const saveBenchmarks = async () => {
        const entries = Object.entries(pendingBenchmarks);
        if (entries.length === 0) {
            showToast('저장할 비교 점수가 없습니다.', 'error');
            return;
        }

        setIsSavingBenchmarks(true);
        try {
            const responses = await Promise.all(entries.map(([key, score]) => {
                const [requirementId, company] = key.split('::');
                return fetch(`/api/projects/${projectId}/qfd/benchmarks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requirementId, company, score }),
                });
            }));

            if (responses.some((response) => !response.ok)) {
                showToast('비교 점수를 저장하지 못했습니다.', 'error');
                return;
            }

            setPendingBenchmarks({});
            await loadData();
            showToast('중요도 및 경쟁 비교 점수를 저장했습니다.');
        } finally {
            setIsSavingBenchmarks(false);
        }
    };

    const saveBenchmarkImmediately = async (requirementId: string, company: string, score: number) => {
        const res = await fetch(`/api/projects/${projectId}/qfd/benchmarks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirementId, company, score }),
        });

        if (!res.ok) {
            showToast('비교 점수를 저장하지 못했습니다.', 'error');
            return;
        }
        await loadData();
    };

    const addCompetitor = async (competitorName: string) => {
        const company = normalizeCompetitorName(competitorName);

        if (!company) {
            showToast('추가할 경쟁사명을 입력하세요.', 'error');
            return;
        }
        if (company === SELF_COMPANY) {
            showToast('자사는 경쟁사명으로 사용할 수 없습니다.', 'error');
            return;
        }
        if (competitorColumns.includes(company)) {
            showToast('이미 추가된 경쟁사입니다.', 'error');
            return;
        }

        setIsAddingCompetitor(true);

        try {
            if (requirements.length > 0) {
                const responses = await Promise.all(requirements.map((requirement) => fetch(`/api/projects/${projectId}/qfd/benchmarks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requirementId: requirement.id, company, score: 0 }),
                })));

                if (responses.some((response) => !response.ok)) {
                    showToast('경쟁사 열을 저장하지 못했습니다.', 'error');
                    return;
                }

                await loadData();
            }

            setExtraCompetitors((items) => [...items, company]);
            showToast(`${getCompetitorLabel(company)} 열을 추가했습니다.`);
        } finally {
            setIsAddingCompetitor(false);
        }
    };

    const handleAddCompetitor = async () => {
        await addCompetitor(newCompetitorName);
        setNewCompetitorName('');
    };

    const handleRemoveCompetitor = async (company: string) => {
        if (company === SELF_COMPANY) return;

        const label = getCompetitorLabel(company);
        if (!window.confirm(`${label} 열과 입력된 점수를 삭제할까요?`)) {
            return;
        }

        setRemovingCompetitor(company);
        try {
            const res = await fetch(`/api/projects/${projectId}/qfd/benchmarks?company=${encodeURIComponent(company)}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const body = await res.json().catch(() => null);
                showToast(body?.error || '경쟁사 열을 삭제하지 못했습니다.', 'error');
                return;
            }

            setExtraCompetitors((items) => items.filter((item) => item !== company));
            setBenchmarksData((items) => items.filter((item) => item.company !== company));
            setPendingBenchmarks((items) => Object.fromEntries(
                Object.entries(items).filter(([key]) => !key.endsWith(`::${company}`))
            ));
            await loadData();
            showToast(`${label} 열을 삭제했습니다.`);
        } finally {
            setRemovingCompetitor(null);
        }
    };

    const handleReset = async () => {
        await Promise.all([
            ...relationships.map((relationship) => fetch(`/api/projects/${projectId}/qfd/relationships`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requirementId: relationship.requirementId,
                    technicalCharId: relationship.technicalCharId,
                    strength: 'NONE',
                }),
            })),
            fetch(`/api/projects/${projectId}/qfd/correlations`, { method: 'DELETE' }),
            fetch(`/api/projects/${projectId}/qfd/benchmarks`, { method: 'DELETE' }),
        ]);

        setPendingBenchmarks({});
        setShowResetConfirm(false);
        await loadData();
        showToast('QFD 매트릭스를 초기화했습니다.');
    };

    const getRelationship = (requirementId: string, technicalCharId: string): Relationship['strength'] =>
        relationships.find((item) => item.requirementId === requirementId && item.technicalCharId === technicalCharId)?.strength || 'NONE';

    const getBenchmark = (requirementId: string, company: string) => {
        const key = benchmarkKey(requirementId, company);
        if (key in pendingBenchmarks) return pendingBenchmarks[key];
        return benchmarksData.find((item) => item.requirementId === requirementId && item.company === company)?.score || 0;
    };

    const getReqAnalysis = (requirementId: string) => reqAnalysis.find((item) => item.requirementId === requirementId);
    const getTechAnalysis = (technicalCharId: string) => techAnalysis.find((item) => item.technicalCharId === technicalCharId);

    const displayTechnicalCols = useMemo<DisplayTechnical[]>(() => [
        ...technicalChars.map((tech) => ({ ...tech, isPlaceholder: false })),
        ...Array.from({ length: Math.max(0, MIN_WORKSHEET_TECH_COLUMNS - technicalChars.length) }, (_, index) => ({
            id: `placeholder-${index}`,
            name: '',
            unit: '',
            targetValue: '',
            isPlaceholder: true,
        })),
    ], [technicalChars]);

    const totalWeight = reqAnalysis.reduce((sum, row) => sum + (row.weight || 0), 0);
    const totalAbsoluteImportance = reqAnalysis.reduce((sum, row) => sum + (row.absoluteImportance || 0), 0);
    const pendingBenchmarkCount = Object.keys(pendingBenchmarks).length;
    const connectedRequirementCount = requirements.filter((requirement) => reqAnalysis.some((row) => row.requirementId === requirement.id)).length;
    const hasRequirements = requirements.length > 0;
    const specFooterRows = buildQfdSpecFooterRows(competitorColumns, getCompetitorLabel);
    const specBlockRowSpan = specFooterRows.filter((row) => row.kind !== 'target').length;
    const coreOptions = useMemo(() => getQfdCoreOptions(specFunctions), [specFunctions]);
    const allSubOptions = useMemo(() => getQfdSubOptions(specFunctions), [specFunctions]);
    const technicalGroups = useMemo(() => chunkTechnicalIndexes(displayTechnicalCols.length, 3), [displayTechnicalCols.length]);
    const visibleTechnicalColumns = useMemo<VisibleTechnicalColumn[]>(() => {
        const columns: VisibleTechnicalColumn[] = [];

        technicalGroups.forEach((group) => {
            if (collapsedTechnicalGroups[group.groupIndex]) return;

            Array.from({ length: group.size }, (_, offset) => {
                const index = group.start + offset;
                columns.push({ tech: displayTechnicalCols[index], index });
            });
        });

        return columns;
    }, [collapsedTechnicalGroups, displayTechnicalCols, technicalGroups]);
    const visibleTechnicalGroups = useMemo(
        () => technicalGroups.filter((group) => !collapsedTechnicalGroups[group.groupIndex]),
        [collapsedTechnicalGroups, technicalGroups]
    );
    const hiddenTechnicalGroups = useMemo(
        () => technicalGroups.filter((group) => collapsedTechnicalGroups[group.groupIndex]),
        [collapsedTechnicalGroups, technicalGroups]
    );

    const collapseAllTechnicalGroups = () => {
        setCollapsedTechnicalGroups(
            technicalGroups.reduce<Record<number, boolean>>((items, group) => {
                items[group.groupIndex] = true;
                return items;
            }, {})
        );
    };
    const expandAllTechnicalGroups = () => {
        setCollapsedTechnicalGroups({});
    };

    const getCoreForTechnicalGroup = (groupIndex: number) => {
        if (selectedCoreByGroup[groupIndex]) return selectedCoreByGroup[groupIndex];
        const group = technicalGroups[groupIndex];
        if (!group) return '';

        for (let index = group.start; index < group.start + group.size; index++) {
            const tech = displayTechnicalCols[index];
            if (!tech || tech.isPlaceholder) continue;
            const coreId = findCoreIdForSubName(specFunctions, tech.name);
            if (coreId) return coreId;
        }

        return '';
    };

    const getSubOptionsForTechnicalColumn = (index: number) => {
        const coreId = getCoreForTechnicalGroup(Math.floor(index / 3));
        const options = coreId ? getQfdSubOptions(specFunctions, coreId) : allSubOptions;
        return options.length > 0 ? options : allSubOptions;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="relative space-y-6">
            <datalist id={`qfd-competitor-options-${projectId}`}>
                {competitorNameOptions.map((option) => (
                    <option key={option} value={option} />
                ))}
            </datalist>
            <datalist id={`qfd-technical-name-options-${projectId}`}>
                {technicalNameOptions.map((option) => (
                    <option key={option} value={option} />
                ))}
            </datalist>
            <datalist id={`qfd-technical-unit-options-${projectId}`}>
                {technicalUnitOptions.map((option) => (
                    <option key={option} value={option} />
                ))}
            </datalist>
            <datalist id={`qfd-technical-target-options-${projectId}`}>
                {technicalTargetValueOptions.map((option) => (
                    <option key={option} value={option} />
                ))}
            </datalist>
            {toast && (
                <div className={`fixed right-6 top-6 z-[100] flex items-center gap-3 rounded-xl border px-5 py-3 shadow-2xl animate-fade-in ${
                    toast.type === 'success'
                        ? 'border-emerald-500/40 bg-emerald-900/90 text-emerald-200'
                        : 'border-red-500/40 bg-red-900/90 text-red-200'
                }`}>
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>
            )}

            <section className="glass-strong p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                            </span>
                            <div>
                                <h2 className="text-xl font-display font-bold text-white">[WS-9] QFD</h2>
                                <p className="mt-1 text-sm text-gray-400">
                                    고객요구사항도출표의 항목을 자동으로 불러와 관계 매트릭스, 중요도, 경쟁 비교, 기획품질을 계산합니다.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] p-1">
                            <input
                                type="text"
                                list={`qfd-competitor-options-${projectId}`}
                                value={newCompetitorName}
                                onChange={(event) => setNewCompetitorName(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') handleAddCompetitor();
                                }}
                                className="h-8 w-28 rounded-md border border-white/[0.08] bg-white px-2 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-500 focus:border-cyan-300"
                                placeholder="경쟁사명"
                                aria-label="추가할 경쟁사명"
                            />
                            <button onClick={handleAddCompetitor} disabled={isAddingCompetitor} className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-60">
                                + 경쟁사
                            </button>
                        </div>
                        <button onClick={loadData} className="btn-secondary text-sm">
                            새로고침
                        </button>
                        <button
                            onClick={saveBenchmarks}
                            disabled={isSavingBenchmarks || pendingBenchmarkCount === 0}
                            className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSavingBenchmarks ? '저장 중...' : `비교 점수 저장${pendingBenchmarkCount > 0 ? ` (${pendingBenchmarkCount})` : ''}`}
                        </button>
                        <button onClick={() => setShowAddTechModal(true)} className="btn-secondary text-sm">
                            + 기술특성
                        </button>
                        <button onClick={() => setShowResetConfirm(true)} className="rounded-lg px-3 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200">
                            초기화
                        </button>
                    </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                        <p className="text-xs text-gray-500">고객요구사항 연동</p>
                        <p className="mt-1 text-2xl font-bold text-white">{connectedRequirementCount}/{requirements.length}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                        <p className="text-xs text-gray-500">기술특성</p>
                        <p className="mt-1 text-2xl font-bold text-cyan-300">{technicalChars.length}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                        <p className="text-xs text-gray-500">관계 입력</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-300">
                            {relationships.filter((item) => item.strength !== 'NONE').length}
                        </p>
                    </div>
                </div>
            </section>

            {dataError && (
                <section className="rounded-xl border border-rose-500/25 bg-rose-500/[0.05] p-5">
                    <p className="text-sm font-semibold text-rose-100">QFD 데이터를 불러오지 못했습니다.</p>
                    <p className="mt-1 text-sm text-rose-200/70">{dataError}</p>
                    <button onClick={loadData} className="btn-secondary mt-4 text-sm">다시 시도</button>
                </section>
            )}

            {showResetConfirm && (
                <section className="rounded-xl border border-rose-500/25 bg-rose-500/[0.04] p-4 animate-fade-in">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-white">QFD 매트릭스를 초기화할까요?</p>
                            <p className="mt-0.5 text-xs text-rose-200/70">관계 강도, 벤치마크, 상관관계 데이터가 삭제됩니다.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowResetConfirm(false)} className="btn-secondary text-sm">취소</button>
                            <button onClick={handleReset} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-500">초기화</button>
                        </div>
                    </div>
                </section>
            )}

            {!dataError && <section className="glass-strong overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
                    <div>
                        <h3 className="font-display text-lg font-bold text-white">QFD 매트릭스</h3>
                        <p className="mt-0.5 text-xs text-gray-500">요구사항 행은 고객요구사항도출표 저장 순서를 그대로 따릅니다.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-gray-400">
                        <button
                            type="button"
                            onClick={visibleTechnicalGroups.length > 0 ? collapseAllTechnicalGroups : expandAllTechnicalGroups}
                            className="inline-flex items-center gap-1 rounded-md border border-indigo-200/20 bg-slate-950/80 px-3 py-1.5 font-semibold text-indigo-50 transition-colors hover:border-indigo-300 hover:bg-indigo-500/20"
                        >
                            {visibleTechnicalGroups.length > 0 ? '기술특성 전체 접기' : '기술특성 전체 펼치기'}
                        </button>
                        <div className="hidden items-center gap-3 md:flex">
                        {RELATIONSHIP_OPTIONS.slice(1).map((option) => (
                            <span key={option.value} className={option.className}>{option.label}={option.score}</span>
                        ))}
                        </div>
                    </div>
                </div>

                {hiddenTechnicalGroups.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] bg-indigo-500/[0.04] px-4 py-2 text-xs">
                        <span className="font-semibold text-indigo-100">기술특성 영역이 접혀 있습니다.</span>
                        <button
                            type="button"
                            onClick={expandAllTechnicalGroups}
                            className="inline-flex items-center gap-1 rounded-md border border-indigo-200/20 bg-slate-950/80 px-2 py-1 font-semibold text-indigo-50 transition-colors hover:border-indigo-300 hover:bg-indigo-500/20"
                            title="기술특성 전체 펼치기"
                        >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16M13 5l7 7-7 7M4 5l7 7-7 7" />
                            </svg>
                            전체 펼치기
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="min-w-max w-full border-collapse text-[11px] text-gray-200">
                        <colgroup>
                            <col className="w-[190px]" />
                            <col className="w-[190px]" />
                            <col className="w-[330px]" />
                            {visibleTechnicalColumns.map(({ tech }) => <col key={`col-${tech.id}`} className="w-[88px]" />)}
                            <col className="w-[80px]" />
                            <col className="w-[88px]" />
                            <col className="w-[74px]" />
                            {competitorColumns.map((company) => <col key={`benchmark-col-${company}`} className="w-[84px]" />)}
                            <col className="w-[78px]" />
                            <col className="w-[84px]" />
                            <col className="w-[92px]" />
                            <col className="w-[96px]" />
                            <col className="w-[70px]" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="border border-white/[0.08] bg-cyan-500/15 px-2 py-2 text-center font-bold text-cyan-100" colSpan={3}>고객요구사항</th>
                                {visibleTechnicalGroups.map((group) => {
                                    const coreId = getCoreForTechnicalGroup(group.groupIndex);
                                    return (
                                        <th key={`core-group-${group.groupIndex}`} className="border border-white/[0.08] bg-indigo-500/15 px-1 py-2 text-center font-bold text-indigo-100" colSpan={group.size}>
                                            <select
                                                value={coreId}
                                                onChange={(event) => setSelectedCoreByGroup((items) => ({ ...items, [group.groupIndex]: event.target.value }))}
                                                className="h-8 min-w-0 flex-1 rounded-md border border-indigo-200/20 bg-slate-950/80 px-1 text-center text-[11px] font-bold text-indigo-50 outline-none focus:border-indigo-300"
                                                title="핵심기능 선택"
                                            >
                                                <option value="">핵심기능</option>
                                                {coreOptions.map((core) => (
                                                    <option key={core.id} value={core.id}>{core.name}</option>
                                                ))}
                                            </select>
                                        </th>
                                    );
                                })}
                                <th className="border border-white/[0.08] bg-rose-500/10 px-2 py-2 text-center font-bold text-rose-100" colSpan={benchmarkColumnCount + 2}>중요도 및 경쟁 비교</th>
                                <th className="border border-white/[0.08] bg-sky-500/10 px-2 py-2 text-center font-bold text-sky-100" colSpan={5}>기획품질</th>
                            </tr>
                            <tr>
                                <th className="border border-white/[0.08] bg-cyan-500/10 px-2 py-2 text-center font-semibold text-blue-200">2차 그룹</th>
                                <th className="border border-white/[0.08] bg-cyan-500/10 px-2 py-2 text-center font-semibold text-red-200">1차 그룹</th>
                                <th className="border border-white/[0.08] bg-cyan-500/10 px-2 py-2 text-center font-semibold text-white">항목</th>
                                {visibleTechnicalColumns.map(({ tech, index }) => (
                                    <th key={tech.id} className="h-[104px] border border-white/[0.08] bg-indigo-500/10 p-1 text-center align-bottom font-semibold">
                                        <div className="flex h-full flex-col justify-end gap-1">
                                            <span className="text-[10px] font-semibold text-indigo-200/70">세부기능</span>
                                            <select
                                                value={tech.isPlaceholder ? '' : tech.name}
                                                onChange={(event) => setTechnicalSubFunction(tech, event.target.value)}
                                                className="min-h-9 w-full rounded-md border border-indigo-200/15 bg-slate-950/80 px-1 text-center text-[11px] font-semibold leading-tight text-cyan-50 outline-none focus:border-cyan-300"
                                                title="세부기능 선택"
                                            >
                                                <option value="">{index + 1}</option>
                                                {getSubOptionsForTechnicalColumn(index).map((sub) => (
                                                    <option key={sub.id} value={sub.name}>{sub.name}</option>
                                                ))}
                                                {!tech.isPlaceholder && tech.name && !getSubOptionsForTechnicalColumn(index).some((sub) => sub.name === tech.name) && (
                                                    <option value={tech.name}>{tech.name}</option>
                                                )}
                                            </select>
                                        </div>
                                    </th>
                                ))}
                                <th className="border border-white/[0.08] bg-rose-500/10 px-2 py-2 text-center font-semibold">가중치</th>
                                <th className="border border-white/[0.08] bg-rose-500/10 px-2 py-2 text-center font-semibold">가중치<br />백분율</th>
                                <th className="border border-white/[0.08] bg-rose-500/10 px-2 py-2 text-center font-semibold">자사</th>
                                {competitorColumns.map((company) => (
                                    <th key={`benchmark-head-${company}`} className="border border-white/[0.08] bg-rose-500/10 px-2 py-2 text-center font-semibold">
                                        <div className="flex items-center justify-center gap-1">
                                            <span>{getCompetitorLabel(company)}</span>
                                            {(company !== DEFAULT_COMPETITOR_COMPANY || competitorColumns.length > 1) && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveCompetitor(company)}
                                                    disabled={removingCompetitor === company}
                                                    className="inline-flex h-5 w-5 items-center justify-center rounded border border-rose-200/20 bg-white/[0.08] text-[13px] font-bold leading-none text-rose-100 transition-colors hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                                    title={`${getCompetitorLabel(company)} 열 삭제`}
                                                    aria-label={`${getCompetitorLabel(company)} 열 삭제`}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    </th>
                                ))}
                                <th className="border border-white/[0.08] bg-sky-500/10 px-2 py-2 text-center font-semibold">기획품질</th>
                                <th className="border border-white/[0.08] bg-sky-500/10 px-2 py-2 text-center font-semibold">수준향상률</th>
                                <th className="border border-white/[0.08] bg-sky-500/10 px-2 py-2 text-center font-semibold">절대중요도</th>
                                <th className="border border-white/[0.08] bg-sky-500/10 px-2 py-2 text-center font-semibold">요구품질<br />중요도</th>
                                <th className="border border-white/[0.08] bg-sky-500/10 px-2 py-2 text-center font-semibold">RANK</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requirements.map((requirement, requirementIndex) => {
                                const analysis = getReqAnalysis(requirement.id);
                                const selfScore = getBenchmark(requirement.id, SELF_COMPANY);
                                const previousRequirement = requirements[requirementIndex - 1];
                                const isFirstCategoryRow = !previousRequirement || previousRequirement.category !== requirement.category;
                                const isFirstSubcategoryRow = isFirstCategoryRow || (previousRequirement?.subcategory || '') !== (requirement.subcategory || '');
                                const rowDividerClass = requirementIndex > 0
                                    ? isFirstCategoryRow
                                        ? 'border-t-2 border-t-red-300/70'
                                        : isFirstSubcategoryRow
                                            ? 'border-t-2 border-t-blue-300/60'
                                            : ''
                                    : '';

                                return (
                                    <tr key={requirement.id} className="h-[32px] transition-colors hover:bg-white/[0.03]">
                                        {isFirstSubcategoryRow && (
                                            <td
                                                rowSpan={getRequirementGroupRowSpan(requirements, requirementIndex, 'subcategory')}
                                                className="border border-white/[0.08] bg-blue-500/[0.08] px-2 py-1 text-center align-middle text-blue-200"
                                            >
                                                {requirement.subcategory || ''}
                                            </td>
                                        )}
                                        {isFirstCategoryRow && (
                                            <td
                                                rowSpan={getRequirementGroupRowSpan(requirements, requirementIndex, 'category')}
                                                className="border border-white/[0.08] bg-red-500/[0.08] px-2 py-1 text-center align-middle text-red-200"
                                            >
                                                {requirement.category || ''}
                                            </td>
                                        )}
                                        <td className={`border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-medium text-white ${rowDividerClass}`}>{requirement.requirement}</td>
                                        {visibleTechnicalColumns.map(({ tech }) => {
                                            if (tech.isPlaceholder) {
                                                return <td key={tech.id} className="border border-white/[0.08] bg-white/[0.015]" />;
                                            }

                                            const strength = getRelationship(requirement.id, tech.id);
                                            const option = RELATIONSHIP_OPTIONS.find((item) => item.value === strength) || RELATIONSHIP_OPTIONS[0];

                                            return (
                                                <td key={tech.id} className="border border-white/[0.08] bg-white/[0.02] p-0 text-center">
                                                    <select
                                                        value={strength}
                                                        onChange={(event) => setRelationshipVal(requirement.id, tech.id, event.target.value as Relationship['strength'])}
                                                        className={`h-[31px] w-full cursor-pointer border-none bg-transparent p-1 text-center text-base font-bold outline-none hover:bg-cyan-500/10 ${option.className}`}
                                                        title={`${option.label} (${option.score})`}
                                                    >
                                                        {RELATIONSHIP_OPTIONS.map((item) => (
                                                            <option key={item.value} value={item.value}>{item.label}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            );
                                        })}
                                        <td className="border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-center font-semibold text-white">{(analysis?.weight ?? 0).toFixed(1)}</td>
                                        <td className="border border-white/[0.08] bg-rose-500/[0.07] px-2 py-1 text-center">{(analysis?.weightPercent ?? 0).toFixed(1)}%</td>
                                        <td className="border border-white/[0.08] bg-rose-500/[0.07] p-0 text-center">
                                            <select value={selfScore} onChange={(event) => setBenchmark(requirement.id, SELF_COMPANY, parseInt(event.target.value, 10))} className={scoreSelectClassName}>
                                                {SCORE_OPTIONS.map((value) => <option key={value} value={value} className="bg-white text-slate-950">{value === 0 ? '-' : value}</option>)}
                                            </select>
                                        </td>
                                        {competitorColumns.map((company) => {
                                            const competitorScore = getBenchmark(requirement.id, company);
                                            return (
                                                <td key={`${requirement.id}-${company}`} className="border border-white/[0.08] bg-rose-500/[0.07] p-0 text-center">
                                                    <select value={competitorScore} onChange={(event) => setBenchmark(requirement.id, company, parseInt(event.target.value, 10))} className={scoreSelectClassName}>
                                                        {SCORE_OPTIONS.map((value) => <option key={value} value={value} className="bg-white text-slate-950">{value === 0 ? '-' : value}</option>)}
                                                    </select>
                                                </td>
                                            );
                                        })}
                                        <td className="border border-white/[0.08] bg-sky-500/[0.07] p-1 text-center font-semibold">{formatNumber(analysis?.planQuality, 0)}</td>
                                        <td className="border border-white/[0.08] bg-sky-500/[0.07] p-1 text-center font-semibold">{formatNumber(analysis?.improvementRate, 2)}</td>
                                        <td className="border border-white/[0.08] bg-sky-500/[0.07] p-1 text-center font-semibold">{formatNumber(analysis?.absoluteImportance, 2)}</td>
                                        <td className="border border-white/[0.08] bg-sky-500/[0.07] p-1 text-center">{analysis?.qualityImportancePercent ? `${analysis.qualityImportancePercent.toFixed(1)}%` : '-'}</td>
                                        <td className="border border-white/[0.08] bg-sky-500/[0.07] p-1 text-center font-bold text-yellow-200">{analysis?.rank || '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="h-[32px]">
                                <td colSpan={3} className="border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-center font-bold text-gray-200">품질중요도</td>
                                {visibleTechnicalColumns.map(({ tech }) => {
                                    if (tech.isPlaceholder) return <td key={tech.id} className="border border-white/[0.08] bg-white/[0.015]" />;
                                    const analysis = getTechAnalysis(tech.id);
                                    return <td key={tech.id} className="border border-white/[0.08] bg-white/[0.04] p-1 text-center font-bold text-cyan-200">{analysis?.totalScore?.toFixed(2) || '0'}</td>;
                                })}
                                <td className="border border-white/[0.08] bg-white/[0.04] p-1 text-center font-semibold">{totalWeight.toFixed(1)}</td>
                                <td className="border border-white/[0.08] bg-rose-500/[0.07] p-1 text-center">100%</td>
                                <td colSpan={benchmarkColumnCount + 2} className="border border-white/[0.08] bg-white/[0.015]" />
                                <td className="border border-white/[0.08] bg-sky-500/[0.07] p-1 text-center font-semibold">{totalAbsoluteImportance.toFixed(1)}</td>
                                <td className="border border-white/[0.08] bg-sky-500/[0.07]" />
                                <td className="border border-white/[0.08] bg-sky-500/[0.07]" />
                            </tr>
                            <tr className="h-[32px]">
                                <td colSpan={3} className="border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-right font-bold text-gray-200">RANK</td>
                                {visibleTechnicalColumns.map(({ tech }) => {
                                    if (tech.isPlaceholder) return <td key={tech.id} className="border border-white/[0.08] bg-white/[0.015]" />;
                                    const analysis = getTechAnalysis(tech.id);
                                    return <td key={tech.id} className="border border-white/[0.08] bg-white/[0.04] p-1 text-center font-bold text-yellow-200">{analysis?.rank || '-'}</td>;
                                })}
                                <td colSpan={rightSideColumnSpan} className="border border-white/[0.08] bg-white/[0.015]" />
                            </tr>
                            {specFooterRows.map((row) => (
                                <tr key={row.key} className="h-[32px]">
                                    <td className="border border-white/[0.08] bg-white/[0.015]" />
                                    {row.kind === 'unit' && (
                                        <td rowSpan={specBlockRowSpan} className="border border-white/[0.08] bg-emerald-400/[0.12] px-2 py-1 text-center align-middle font-bold text-emerald-100">
                                            {row.specLabel}
                                        </td>
                                    )}
                                    {row.kind === 'target' ? (
                                        <td colSpan={2} className="border border-white/[0.08] bg-emerald-400/[0.12] px-2 py-1 text-center font-bold text-emerald-100">
                                            {row.specLabel}
                                        </td>
                                    ) : (
                                        <td className="border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-center font-bold text-gray-200">
                                            {row.rowLabel}
                                        </td>
                                    )}
                                    {visibleTechnicalColumns.map(({ tech }) => {
                                        const value = tech.isPlaceholder
                                            ? ''
                                            : row.kind === 'unit'
                                                ? (tech.unit || '-')
                                                : row.kind === 'target'
                                                    ? (tech.targetValue || '-')
                                                    : '-';

                                        return (
                                            <td key={`${row.key}-${tech.id}`} className="border border-white/[0.08] bg-white/[0.025] p-1 text-center text-gray-300">
                                                {value}
                                            </td>
                                        );
                                    })}
                                    <td colSpan={rightSideColumnSpan} className="border border-white/[0.08] bg-white/[0.015]" />
                                </tr>
                            ))}
                        </tfoot>
                    </table>
                </div>

                {!hasRequirements && (
                    <div className="border-t border-white/[0.08] p-10 text-center">
                        <h3 className="text-lg font-display font-semibold text-gray-200">고객요구사항이 없습니다</h3>
                        <p className="mt-2 text-sm text-gray-500">고객요구사항도출표에 항목을 저장하면 QFD 행에 자동으로 표시됩니다.</p>
                        <Link href={`/project/${projectId}/requirements`} className="btn-primary mt-4 inline-flex">요구사항 입력하기</Link>
                    </div>
                )}

                {hasRequirements && technicalChars.length === 0 && (
                    <div className="border-t border-white/[0.08] bg-white/[0.02] p-6 text-center">
                        <p className="mb-3 text-sm text-gray-400">기술특성을 추가하면 고객요구사항과의 관계 강도를 입력할 수 있습니다.</p>
                        <button onClick={() => setShowAddTechModal(true)} className="btn-primary text-sm">기술특성 추가</button>
                    </div>
                )}
            </section>}

            {techAnalysis.length > 0 && (
                <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {[...techAnalysis].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).slice(0, 6).map((tech) => {
                        const max = Math.max(...techAnalysis.map((item) => item.totalScore), 1);
                        const width = (tech.totalScore / max) * 100;
                        return (
                            <div key={tech.technicalCharId} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-sm font-semibold text-white">{tech.name}</span>
                                    <span className="text-xs font-bold text-yellow-300">#{tech.rank ?? '-'}</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
                                    <div className="h-1.5 rounded-full bg-cyan-400" style={{ width: `${width}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </section>
            )}

            {showAddTechModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
                    <div className="glass-strong w-full max-w-md p-6">
                        <div className="mb-6 flex items-center justify-between">
                            <h3 className="text-xl font-display font-bold text-white">기술특성 추가</h3>
                            <button
                                onClick={() => {
                                    setShowAddTechModal(false);
                                    setNewTech({ name: '', unit: '', targetValue: '' });
                                }}
                                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-300">기술특성 이름 *</label>
                                <input
                                    type="text"
                                    list={`qfd-technical-name-options-${projectId}`}
                                    value={newTech.name}
                                    onChange={(event) => setNewTech({ ...newTech, name: event.target.value })}
                                    className="input w-full"
                                    placeholder="예: 응답 속도"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-300">측정단위</label>
                                <input
                                    type="text"
                                    list={`qfd-technical-unit-options-${projectId}`}
                                    value={newTech.unit}
                                    onChange={(event) => setNewTech({ ...newTech, unit: event.target.value })}
                                    className="input w-full"
                                    placeholder="예: ms, %, 건"
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-300">설계 목표치</label>
                                <input
                                    type="text"
                                    list={`qfd-technical-target-options-${projectId}`}
                                    value={newTech.targetValue}
                                    onChange={(event) => setNewTech({ ...newTech, targetValue: event.target.value })}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') handleAddTechnical();
                                    }}
                                    className="input w-full"
                                    placeholder="예: 100ms 이하"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => {
                                        setShowAddTechModal(false);
                                        setNewTech({ name: '', unit: '', targetValue: '' });
                                    }}
                                    className="btn-secondary flex-1 py-3"
                                >
                                    취소
                                </button>
                                <button onClick={handleAddTechnical} className="btn-primary flex-1 py-3">추가</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
