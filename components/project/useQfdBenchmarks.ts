'use client';

// QFD 표 오른쪽의 경쟁 비교 점수(요구사항 × 회사의 5점)와 경쟁사 열 관리.
// QFDMatrix 한 파일에 1400줄이 몰려 있던 것을 나눈 한 조각이다(2026-10-25 코드 리뷰 L2).
// 불러온 점수는 화면이 들고, 이 훅은 아직 저장하지 않은 점수와 경쟁사 열 편집만 맡는다.
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { ToastType } from '@/components/HeaderToast';

export const SELF_COMPANY = 'self';
export const DEFAULT_COMPETITOR_COMPANY = 'competitor';
const DEFAULT_COMPETITOR_LABEL = '경쟁사';

export interface Benchmark {
    requirementId: string;
    company: string;
    score: number;
}

type ShowToast = (message: string, type?: ToastType) => void;

function normalizeCompetitorName(value: string) {
    const name = value.trim();
    return name === DEFAULT_COMPETITOR_LABEL ? DEFAULT_COMPETITOR_COMPANY : name;
}

export function getCompetitorLabel(company: string) {
    return company === DEFAULT_COMPETITOR_COMPANY ? DEFAULT_COMPETITOR_LABEL : company;
}

function benchmarkKey(requirementId: string, company: string) {
    return `${requirementId}::${company}`;
}

/** 저장하지 않은 점수의 열쇠를 요구사항·회사로 되돌린다. */
export function splitBenchmarkKey(key: string) {
    const [requirementId, company] = key.split('::');
    return { requirementId, company };
}

export function useQfdBenchmarks(params: {
    projectId: string;
    requirements: Array<{ id: string }>;
    benchmarksData: Benchmark[];
    setBenchmarksData: Dispatch<SetStateAction<Benchmark[]>>;
    loadData: () => Promise<void>;
    showToast: ShowToast;
    hasUnsavedRelationships: () => boolean;
    // 비교 점수 저장과 워크시트 저장은 같은 "저장 중" 표시를 쓴다. 화면이 들고 넘겨준다.
    setIsSavingBenchmarks: (saving: boolean) => void;
}) {
    const { projectId, requirements, benchmarksData, setBenchmarksData, loadData, showToast, hasUnsavedRelationships, setIsSavingBenchmarks } = params;
    const [pendingBenchmarks, setPendingBenchmarks] = useState<Record<string, number>>({});
    const [newCompetitorName, setNewCompetitorName] = useState('');
    const [extraCompetitors, setExtraCompetitors] = useState<string[]>([]);
    const [isAddingCompetitor, setIsAddingCompetitor] = useState(false);
    const [removingCompetitor, setRemovingCompetitor] = useState<string | null>(null);

    useEffect(() => {
        setPendingBenchmarks({});
        setExtraCompetitors([]);
    }, [projectId]);

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

    const setBenchmark = (requirementId: string, company: string, score: number) => {
        setPendingBenchmarks((items) => ({
            ...items,
            [benchmarkKey(requirementId, company)]: score,
        }));
    };

    const getBenchmark = (requirementId: string, company: string) => {
        const key = benchmarkKey(requirementId, company);
        if (key in pendingBenchmarks) return pendingBenchmarks[key];
        return benchmarksData.find((item) => item.requirementId === requirementId && item.company === company)?.score || 0;
    };

    const saveBenchmarks = async () => {
        if (hasUnsavedRelationships()) return;
        const entries = Object.entries(pendingBenchmarks);
        if (entries.length === 0) {
            showToast('저장할 비교 점수가 없습니다.', 'error');
            return;
        }

        setIsSavingBenchmarks(true);
        try {
            const responses = await Promise.all(entries.map(([key, score]) => {
                const { requirementId, company } = splitBenchmarkKey(key);
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

    const clearPendingBenchmarks = () => setPendingBenchmarks({});

    return {
        pendingBenchmarks, competitorColumns, competitorNameOptions,
        newCompetitorName, setNewCompetitorName, isAddingCompetitor, removingCompetitor,
        setBenchmark, getBenchmark, saveBenchmarks, handleAddCompetitor, handleRemoveCompetitor, clearPendingBenchmarks,
    };
}
