'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HeaderToast from '@/components/HeaderToast';
import { useToast } from '@/components/useToast';
import Link from 'next/link';
import { buildQfdSpecFooterRows } from '@/lib/qfd-footer-rows';
import {
    parseCollapsedGroups,
    qfdCollapsedGroupsStorageKey,
    serializeCollapsedGroups,
    toggleGroupVisibility,
} from '@/lib/qfd-technical-header';
import { dedupeNonBlank } from '@/lib/qfd-technical-sync';
import { buildTechnicalGroups } from '@/lib/qfd-technical-groups';
import { useQfdRelationshipAutosave, type Relationship } from './useQfdRelationshipAutosave';

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
    groupIndex?: number;
    columnOrder?: number;
}

/** WS-10 세부기능과 소속 핵심기능을 연결한다. */
interface TechTreeEntry {
    subSpec?: string | null;
    coreSpec?: string | null;
}

interface Benchmark {
    requirementId: string;
    company: string;
    score: number;
}

/** 기술특성 × 회사의 스펙 실측값. 위 Benchmark(요구사항 × 회사의 5점)와 축이 다르다. */
interface TechnicalBenchmark {
    technicalCharId: string;
    company: string;
    value: string;
}

interface QFDMatrixProps {
    projectId: string;
    onDirtyChange?: (dirty: boolean) => void;
}

type DisplayTechnical = TechnicalChar;
type TechnicalGroup = ReturnType<typeof buildTechnicalGroups<TechnicalChar>>[number];
/** 표 아래쪽에서 직접 고쳐 쓰는 기술특성 칸. 둘 다 TechnicalCharacteristic 의 열이다. */
type TechnicalTextField = 'unit' | 'targetValue';
type VisibleTechnicalColumn = { tech: DisplayTechnical };
type PendingBenchmarkScores = Record<string, number>;

const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5];
const TECHNICAL_FIELD_LABELS: Record<TechnicalTextField, string> = {
    unit: '측정단위',
    targetValue: '설계 목표치',
};
const SELF_COMPANY = 'self';
const DEFAULT_COMPETITOR_COMPANY = 'competitor';
const DEFAULT_COMPETITOR_LABEL = '경쟁사';

const RELATIONSHIP_OPTIONS: Array<{
    value: Relationship['strength'];
    label: string;
    description: string;
    className: string;
}> = [
    { value: 'NONE', label: '-', description: '관계 없음', className: 'text-slate-500' },
    { value: 'WEAK', label: '1', description: '약함', className: 'text-amber-300' },
    { value: 'MEDIUM', label: '3', description: '보통', className: 'text-sky-300' },
    { value: 'STRONG', label: '9', description: '강함', className: 'text-emerald-300' },
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

export default function QFDMatrix({ projectId, onDirtyChange }: QFDMatrixProps) {
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [technicalChars, setTechnicalChars] = useState<TechnicalChar[]>([]);
    const [techTreeEntries, setTechTreeEntries] = useState<TechTreeEntry[]>([]);
    const {
        relationships, reqAnalysis, techAnalysis, pendingCount, failedRelationships, analysisError, isRefreshingAnalysis,
        setRelationshipVal, retryRelationship, retryFailedRelationships, refreshAnalysis,
        captureSnapshot, isCurrentSnapshot, applyServerData, clearSavedRelationships, hasUnsavedRelationships,
    } = useQfdRelationshipAutosave(projectId, onDirtyChange);
    const [benchmarksData, setBenchmarksData] = useState<Benchmark[]>([]);
    const [technicalBenchmarks, setTechnicalBenchmarks] = useState<TechnicalBenchmark[]>([]);
    const [pendingBenchmarks, setPendingBenchmarks] = useState<PendingBenchmarkScores>({});
    const [isSavingBenchmarks, setIsSavingBenchmarks] = useState(false);
    const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
    const loadRequest = useRef(0);
    const relationshipSaveBlocked = pendingCount > 0 || failedRelationships.length > 0;
    const [showAddTechModal, setShowAddTechModal] = useState(false);
    const [addingToGroup, setAddingToGroup] = useState<number | null>(null);
    const [isAddingTechnical, setIsAddingTechnical] = useState(false);
    const [canWriteTechnicals, setCanWriteTechnicals] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [newTech, setNewTech] = useState({ name: '', unit: '', targetValue: '' });
    const [newCompetitorName, setNewCompetitorName] = useState('');
    const [extraCompetitors, setExtraCompetitors] = useState<string[]>([]);
    const [isAddingCompetitor, setIsAddingCompetitor] = useState(false);
    const [collapsedTechnicalGroups, setCollapsedTechnicalGroups] = useState<Record<number, boolean>>({});
    const [removingCompetitor, setRemovingCompetitor] = useState<string | null>(null);
    const [techFieldDrafts, setTechFieldDrafts] = useState<Record<string, string>>({});
    const [deletingTech, setDeletingTech] = useState<DisplayTechnical | null>(null);
    const [deletingGroup, setDeletingGroup] = useState<TechnicalGroup | null>(null);
    const [isDeletingTech, setIsDeletingTech] = useState(false);
    const { toast, showToast } = useToast();
    const [dataError, setDataError] = useState<string | null>(null);

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
        () => dedupeNonBlank(techTreeEntries.map((entry) => entry.subSpec)).filter(name => !technicalChars.some(tech => tech.name.trim() === name)),
        [technicalChars, techTreeEntries]
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

    const loadData = useCallback(async () => {
        const snapshot = captureSnapshot();
        if (!isCurrentSnapshot(snapshot)) return;
        const request = ++loadRequest.current;
        const isCurrent = () => request === loadRequest.current && isCurrentSnapshot(snapshot);
        setDataError(null);
        try {
            const [requirementsRes, technicalRes, relationshipsRes, analysisRes, benchmarksRes, treeRes, techBenchmarksRes] = await Promise.all([
                fetch(`/api/projects/${projectId}/requirements`),
                fetch(`/api/projects/${projectId}/qfd/technical`),
                fetch(`/api/projects/${projectId}/qfd/relationships`),
                fetch(`/api/projects/${projectId}/qfd/analysis`),
                fetch(`/api/projects/${projectId}/qfd/benchmarks`),
                // WS-10 세부기능 선택지와 그룹의 핵심기능 제목에 사용한다.
                fetch(`/api/projects/${projectId}/tech-tree`),
                // 아래 실패 판정에서 일부러 뺀다 — 이 줄 하나 때문에 QFD 표 전체가
                // 열리지 않으면 손해가 더 크다. 값이 없으면 그 줄만 비어 보인다.
                fetch(`/api/projects/${projectId}/qfd/technical-benchmarks`).catch(() => null),
            ]);

            const failedResponse = [requirementsRes, technicalRes, relationshipsRes, analysisRes, benchmarksRes, treeRes].find((response) => !response.ok);
            if (failedResponse) {
                const body = await failedResponse.json().catch(() => null);
                throw new Error(body?.error || 'QFD 데이터를 불러오지 못했습니다.');
            }

            const [requirementData, technicalData, relationshipData, analysisData, benchmarkData, treeData, techBenchmarkData] = await Promise.all([
                requirementsRes.json(), technicalRes.json(), relationshipsRes.json(), analysisRes.json(),
                benchmarksRes.json(), treeRes.json(), techBenchmarksRes?.ok ? techBenchmarksRes.json() : null,
            ]);
            if (!isCurrent()) return;
            setRequirements(requirementData.requirements || []);
            setTechnicalChars(technicalData.technicalCharacteristics || []);
            setCanWriteTechnicals(technicalData.canWrite === true);
            applyServerData(snapshot, relationshipData.relationships || [], analysisData);
            setBenchmarksData(benchmarkData.benchmarks || []);
            setTechTreeEntries(treeData.entries || []);
            if (techBenchmarkData) setTechnicalBenchmarks(techBenchmarkData.technicalBenchmarks || []);
        } catch (error) {
            if (!isCurrent()) return;
            console.error(error);
            const message = error instanceof Error ? error.message : 'QFD 데이터를 불러오지 못했습니다.';
            setDataError(message);
            showToast(message, 'error');
            // 새로고침이 앞선 분석 응답을 무효화한 뒤 실패해도 최종 저장값의 분석은 다시 구한다.
            if (snapshot.version > 0) void refreshAnalysis();
        } finally {
            if (isCurrent()) setLoadedProjectId(projectId);
        }
    }, [applyServerData, captureSnapshot, isCurrentSnapshot, projectId, refreshAnalysis, showToast]);

    useEffect(() => {
        setRequirements([]);
        setTechnicalChars([]);
        setTechTreeEntries([]);
        setBenchmarksData([]);
        setTechnicalBenchmarks([]);
        setPendingBenchmarks({});
        setTechFieldDrafts({});
        setExtraCompetitors([]);
        setDeletingTech(null);
        setDeletingGroup(null);
        setAddingToGroup(null);
        setIsAddingTechnical(false);
        setIsDeletingTech(false);
        setCanWriteTechnicals(false);
        setShowResetConfirm(false);
        setShowAddTechModal(false);
    }, [projectId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        const currentUrl = window.location.href;
        const currentHistory = window.history.state;
        const confirmLeave = () => !hasUnsavedRelationships() || window.confirm('저장 중이거나 저장하지 못한 관계 강도가 있습니다. 저장하지 않고 이동할까요?');
        const warn = (event: BeforeUnloadEvent) => {
            if (hasUnsavedRelationships()) event.preventDefault();
        };
        const guardLink = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
            if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download') || link.target === '_blank' || link.href === window.location.href) return;
            if (!confirmLeave()) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        };
        const guardBack = (event: PopStateEvent) => {
            if (confirmLeave()) return;
            event.stopImmediatePropagation();
            window.history.pushState(currentHistory, '', currentUrl);
        };
        window.addEventListener('beforeunload', warn);
        window.addEventListener('popstate', guardBack, true);
        document.addEventListener('click', guardLink, true);
        return () => {
            window.removeEventListener('beforeunload', warn);
            window.removeEventListener('popstate', guardBack, true);
            document.removeEventListener('click', guardLink, true);
        };
    }, [hasUnsavedRelationships]);

    const openAddTechnical = (groupIndex: number | null) => {
        setAddingToGroup(groupIndex);
        setNewTech({ name: '', unit: '', targetValue: '' });
        setShowAddTechModal(true);
    };

    const handleAddTechnical = async () => {
        if (!newTech.name.trim() || isAddingTechnical) return;
        const snapshot = captureSnapshot();
        setIsAddingTechnical(true);
        loadRequest.current += 1;
        try {
            const res = await fetch(`/api/projects/${projectId}/qfd/technical`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...newTech, ...(addingToGroup === null ? {} : { groupIndex: addingToGroup }) }),
            });
            const data = await res.json();
            if (!isCurrentSnapshot(snapshot)) return;
            if (!res.ok) throw new Error(data.error || '세부기능을 추가하지 못했습니다.');
            setTechnicalChars(items => [...items, data.technicalCharacteristic]);
            updateCollapsedTechnicalGroups({ ...collapsedTechnicalGroups, [data.technicalCharacteristic.groupIndex]: false });
            setShowAddTechModal(false);
            setNewTech({ name: '', unit: '', targetValue: '' });
            void refreshAnalysis();
            showToast(addingToGroup === null ? '그룹과 첫 세부기능을 추가했습니다.' : '그룹에 세부기능을 추가했습니다.');
        } catch (error) {
            if (isCurrentSnapshot(snapshot)) showToast(error instanceof Error ? error.message : '세부기능을 추가하지 못했습니다.', 'error');
        } finally {
            if (isCurrentSnapshot(snapshot)) setIsAddingTechnical(false);
        }
    };

    const setTechnicalSubFunction = async (tech: DisplayTechnical, subName: string) => {
        const name = subName.trim();
        if (!name || name === tech.name) return;
        const snapshot = captureSnapshot();
        try {
            const res = await fetch(`/api/projects/${projectId}/qfd/technical`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: tech.id, name, unit: tech.unit || '', targetValue: tech.targetValue || '' }),
            });
            const data = await res.json();
            if (!isCurrentSnapshot(snapshot)) return;
            if (!res.ok) throw new Error(data.error || '세부기능을 저장하지 못했습니다.');
            setTechnicalChars(items => items.map(item => item.id === tech.id ? data.technicalCharacteristic : item));
            void refreshAnalysis();
            showToast('세부기능을 저장했습니다.');
        } catch (error) {
            if (isCurrentSnapshot(snapshot)) showToast(error instanceof Error ? error.message : '세부기능을 저장하지 못했습니다.', 'error');
        }
    };

    // 측정단위·설계 목표치는 입력 중에는 초안으로 들고 있다가 포커스를 뗄 때 한 번만
    // 저장한다. 글자마다 PATCH 를 보내면 요청이 타자 수만큼 늘고 순서가 뒤집힐 수 있다.
    const techFieldKey = (techId: string, field: TechnicalTextField) => `${techId}:${field}`;

    const getTechFieldValue = (tech: DisplayTechnical, field: TechnicalTextField) => {
        const key = techFieldKey(tech.id, field);
        if (key in techFieldDrafts) return techFieldDrafts[key];
        return (field === 'unit' ? tech.unit : tech.targetValue) || '';
    };

    const commitTechField = async (tech: DisplayTechnical, field: TechnicalTextField) => {
        const key = techFieldKey(tech.id, field);
        if (!(key in techFieldDrafts)) return;

        const nextValue = techFieldDrafts[key].trim();
        const currentValue = ((field === 'unit' ? tech.unit : tech.targetValue) || '').trim();

        // 초안을 먼저 지운다. 남겨 두면 저장 뒤 서버가 돌려준 값 대신 초안이 계속 보인다.
        setTechFieldDrafts((drafts) => {
            const next = { ...drafts };
            delete next[key];
            return next;
        });

        if (nextValue === currentValue) return;

        const res = await fetch(`/api/projects/${projectId}/qfd/technical`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: tech.id,
                name: tech.name,
                unit: field === 'unit' ? nextValue : (tech.unit || ''),
                targetValue: field === 'targetValue' ? nextValue : (tech.targetValue || ''),
            }),
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => null);
            showToast(errorData?.error || `${TECHNICAL_FIELD_LABELS[field]}을(를) 저장하지 못했습니다.`, 'error');
            return;
        }

        await loadData();
        showToast(`${TECHNICAL_FIELD_LABELS[field]}을(를) 저장했습니다.`);
    };

    // 자사·경쟁사 줄도 같은 초안·blur 방식을 쓴다. 열쇠에 회사명이 더 붙을 뿐이다.
    const techBenchmarkKey = (techId: string, company: string) => `bench:${techId}:${company}`;

    const getTechBenchmarkValue = (tech: DisplayTechnical, company: string) => {
        const key = techBenchmarkKey(tech.id, company);
        if (key in techFieldDrafts) return techFieldDrafts[key];
        return technicalBenchmarks.find(
            (item) => item.technicalCharId === tech.id && item.company === company
        )?.value || '';
    };

    const commitTechBenchmark = async (tech: DisplayTechnical, company: string, label: string) => {
        const key = techBenchmarkKey(tech.id, company);
        if (!(key in techFieldDrafts)) return;

        const nextValue = techFieldDrafts[key].trim();
        const currentValue = (technicalBenchmarks.find(
            (item) => item.technicalCharId === tech.id && item.company === company
        )?.value || '').trim();

        setTechFieldDrafts((drafts) => {
            const next = { ...drafts };
            delete next[key];
            return next;
        });

        if (nextValue === currentValue) return;

        const res = await fetch(`/api/projects/${projectId}/qfd/technical-benchmarks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ technicalCharId: tech.id, company, value: nextValue }),
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => null);
            showToast(errorData?.error || `${label} 값을 저장하지 못했습니다.`, 'error');
            return;
        }

        await loadData();
        showToast(`${label} 값을 저장했습니다.`);
    };

    // 지울 열에 실제로 입력해 둔 관계 강도가 몇 개인지. 확인창이 "정말?"을 한 번 더
    // 묻는 대신 무엇을 잃는지 숫자로 보여 주게 한다 — 반사적으로 누르는 두 번째 확인보다
    // 이쪽이 실수를 막는다.
    const countEnteredRelationships = (technicalCharId: string) =>
        relationships.filter((item) => item.technicalCharId === technicalCharId && item.strength !== 'NONE').length;

    const handleDeleteTechnical = async () => {
        if ((!deletingTech && !deletingGroup) || hasUnsavedRelationships() || isDeletingTech) return;
        const snapshot = captureSnapshot();
        const deletedIds = deletingGroup ? deletingGroup.technicals.map(tech => tech.id) : [deletingTech!.id];
        setIsDeletingTech(true);
        loadRequest.current += 1;
        try {
            const res = await fetch(`/api/projects/${projectId}/qfd/technical`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(deletingGroup
                    ? { groupIndex: deletingGroup.groupIndex, ids: deletedIds }
                    : { id: deletingTech!.id }),
            });
            if (!isCurrentSnapshot(snapshot)) return;
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error || '세부기능을 삭제하지 못했습니다.');
            }
            deletedIds.forEach(id => clearSavedRelationships(id));
            setTechnicalChars(items => items.filter(tech => !deletedIds.includes(tech.id)));
            setTechnicalBenchmarks(items => items.filter(item => !deletedIds.includes(item.technicalCharId)));
            setTechFieldDrafts(drafts => Object.fromEntries(Object.entries(drafts).filter(([key]) =>
                !deletedIds.some(id => key.startsWith(id + ':') || key.startsWith('bench:' + id + ':')))));
            setDeletingTech(null);
            setDeletingGroup(null);
            void refreshAnalysis();
            showToast(deletingGroup ? '그룹과 세부기능을 삭제했습니다.' : '세부기능을 삭제했습니다.');
        } catch (error) {
            if (isCurrentSnapshot(snapshot)) showToast(error instanceof Error ? error.message : '세부기능을 삭제하지 못했습니다.', 'error');
        } finally {
            if (isCurrentSnapshot(snapshot)) setIsDeletingTech(false);
        }
    };

    const setBenchmark = (requirementId: string, company: string, score: number) => {
        setPendingBenchmarks((items) => ({
            ...items,
            [benchmarkKey(requirementId, company)]: score,
        }));
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

    const saveWorksheet = async () => {
        if (isSavingBenchmarks || hasUnsavedRelationships()) return;
        setIsSavingBenchmarks(true);
        try {
            const save = async (path: string, method: string, body: object) => {
                const response = await fetch(`/api/projects/${projectId}/qfd/${path}`, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => null);
                    throw new Error(data?.error || 'QFD 저장에 실패했습니다. 다시 저장해주세요.');
                }
            };

            for (const tech of technicalChars) {
                if (techFieldKey(tech.id, 'unit') in techFieldDrafts || techFieldKey(tech.id, 'targetValue') in techFieldDrafts) {
                    await save('technical', 'PATCH', {
                        id: tech.id,
                        name: tech.name,
                        unit: getTechFieldValue(tech, 'unit').trim(),
                        targetValue: getTechFieldValue(tech, 'targetValue').trim(),
                    });
                }
                for (const company of [SELF_COMPANY, ...competitorColumns]) {
                    if (techBenchmarkKey(tech.id, company) in techFieldDrafts) {
                        await save('technical-benchmarks', 'POST', {
                            technicalCharId: tech.id,
                            company,
                            value: getTechBenchmarkValue(tech, company).trim(),
                        });
                    }
                }
            }
            for (const [key, score] of Object.entries(pendingBenchmarks)) {
                const [requirementId, company] = key.split('::');
                await save('benchmarks', 'POST', { requirementId, company, score });
            }
            setTechFieldDrafts({});
            setPendingBenchmarks({});
            await loadData();
            showToast('워크시트를 저장했습니다.');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'QFD 저장에 실패했습니다. 다시 저장해주세요.', 'error');
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
        if (hasUnsavedRelationships() || isResetting) return;
        setIsResetting(true);
        try {
            const responses = await Promise.allSettled([
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
            if (responses.some((result) => result.status === 'rejected' || !result.value.ok)) {
                await loadData();
                throw new Error('QFD 초기화에 실패했습니다. 다시 시도해주세요.');
            }
            clearSavedRelationships();
            setPendingBenchmarks({});
            setShowResetConfirm(false);
            await loadData();
            showToast('QFD 매트릭스를 초기화했습니다.');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'QFD 초기화에 실패했습니다. 다시 시도해주세요.', 'error');
        } finally {
            setIsResetting(false);
        }
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

    const totalWeight = reqAnalysis.reduce((sum, row) => sum + (row.weight || 0), 0);
    const totalAbsoluteImportance = reqAnalysis.reduce((sum, row) => sum + (row.absoluteImportance || 0), 0);
    const pendingBenchmarkCount = Object.keys(pendingBenchmarks).length;
    const connectedRequirementCount = requirements.filter((requirement) => reqAnalysis.some((row) => row.requirementId === requirement.id)).length;
    const hasRequirements = requirements.length > 0;
    const specFooterRows = buildQfdSpecFooterRows(competitorColumns, getCompetitorLabel);
    const specBlockRowSpan = specFooterRows.filter((row) => row.kind !== 'target').length;
    const subFunctionOptions = useMemo(
        () => dedupeNonBlank(techTreeEntries.map((entry) => entry.subSpec)).map((name) => ({ id: name, name })),
        [techTreeEntries]
    );
    const technicalGroups = useMemo(() => buildTechnicalGroups(technicalChars, techTreeEntries), [technicalChars, techTreeEntries]);
    const visibleTechnicalColumns = useMemo<VisibleTechnicalColumn[]>(
        () => technicalGroups.filter(group => !collapsedTechnicalGroups[group.groupIndex])
            .flatMap(group => group.technicals.map(tech => ({ tech }))),
        [collapsedTechnicalGroups, technicalGroups]
    );
    const visibleTechnicalGroups = useMemo(
        () => technicalGroups.filter((group) => !collapsedTechnicalGroups[group.groupIndex]),
        [collapsedTechnicalGroups, technicalGroups]
    );
    const hiddenTechnicalGroups = useMemo(
        () => technicalGroups.filter((group) => collapsedTechnicalGroups[group.groupIndex]),
        [collapsedTechnicalGroups, technicalGroups]
    );

    // 접힘 상태를 프로젝트별로 브라우저에 남긴다 — 다른 화면에 다녀와도 그대로 있어야 한다.
    // 저장은 상태를 바꾸는 순간에 함께 해서, 마운트 직후의 빈 상태가 저장값을 덮어쓰는 일을 막는다.
    const collapsedGroupsStorageKey = qfdCollapsedGroupsStorageKey(projectId);
    useEffect(() => {
        setCollapsedTechnicalGroups(parseCollapsedGroups(window.localStorage.getItem(collapsedGroupsStorageKey)));
    }, [collapsedGroupsStorageKey]);
    const updateCollapsedTechnicalGroups = (next: Record<number, boolean>) => {
        setCollapsedTechnicalGroups(next);
        window.localStorage.setItem(collapsedGroupsStorageKey, serializeCollapsedGroups(next));
    };

    const collapseAllTechnicalGroups = () => {
        updateCollapsedTechnicalGroups(
            technicalGroups.reduce<Record<number, boolean>>((items, group) => {
                items[group.groupIndex] = true;
                return items;
            }, {})
        );
    };
    const expandAllTechnicalGroups = () => {
        updateCollapsedTechnicalGroups({});
    };
    const toggleTechnicalGroup = (groupIndex: number) => {
        updateCollapsedTechnicalGroups(toggleGroupVisibility(collapsedTechnicalGroups, groupIndex));
    };

    if (loadedProjectId !== projectId) {
        return (
            <div className="flex items-center justify-center p-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <fieldset disabled={isSavingBenchmarks || isDeletingTech || isResetting || isAddingTechnical} className="relative min-w-0 space-y-6">
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
            {toast && <HeaderToast message={toast.message} type={toast.type} />}

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
                        <button
                            type="button"
                            data-worksheet-save
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={saveWorksheet}
                            disabled={isSavingBenchmarks || relationshipSaveBlocked}
                            className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSavingBenchmarks ? '저장 중...' : '저장'}
                        </button>
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
                            disabled={isSavingBenchmarks || relationshipSaveBlocked || pendingBenchmarkCount === 0}
                            className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSavingBenchmarks ? '저장 중...' : `비교 점수 저장${pendingBenchmarkCount > 0 ? ` (${pendingBenchmarkCount})` : ''}`}
                        </button>
                        {canWriteTechnicals && <button onClick={() => openAddTechnical(null)} className="btn-secondary text-sm">
                            + 그룹
                        </button>}
                        <button onClick={() => setShowResetConfirm(true)} disabled={relationshipSaveBlocked} className="rounded-lg px-3 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50">
                            초기화
                        </button>
                    </div>
                </div>

                <div className="mt-3 min-h-6 text-sm" aria-live="polite">
                    {pendingCount > 0 && <span className="text-cyan-200">관계 강도 저장 중...</span>}
                    {failedRelationships.length > 0 && (
                        <span className="ml-2 text-rose-200">
                            관계 강도 {failedRelationships.length}개 저장 실패.
                            <button type="button" onClick={retryFailedRelationships} className="ml-2 underline">실패한 관계 다시 저장</button>
                        </span>
                    )}
                    {pendingCount === 0 && failedRelationships.length === 0 && isRefreshingAnalysis && <span className="text-gray-400">분석 결과 갱신 중...</span>}
                    {analysisError && (
                        <div className="text-amber-200">
                            분석 결과를 갱신하지 못했습니다.
                            <button type="button" onClick={refreshAnalysis} disabled={pendingCount > 0 || isRefreshingAnalysis} className="ml-2 underline disabled:opacity-50">분석 다시 불러오기</button>
                        </div>
                    )}
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

            {(deletingTech || deletingGroup) && (
                <section role="alertdialog" aria-label="세부기능 삭제 확인" className="rounded-xl border border-rose-500/25 bg-rose-500/[0.04] p-4 animate-fade-in">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-white">
                                {deletingGroup
                                    ? `그룹 ${deletingGroup.groupIndex + 1}의 세부기능 ${deletingGroup.technicals.length}개를 모두 삭제할까요?`
                                    : `세부기능 '${deletingTech!.name}' 열을 삭제할까요?`}
                            </p>
                            {deletingGroup && <p className="mt-1 text-sm text-gray-300">{deletingGroup.technicals.map(tech => tech.name).join(', ')}</p>}
                            <p className="mt-1 text-xs text-rose-200/70">
                                관계 강도 {(deletingGroup?.technicals || [deletingTech!]).reduce((sum, tech) => sum + countEnteredRelationships(tech.id), 0)}개와 해당 세부기능의 상관관계·기술 벤치마크가 함께 삭제됩니다. 되돌릴 수 없습니다.
                                {!deletingGroup && ' 마지막 세부기능을 삭제하면 그룹도 제거됩니다.'}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => { setDeletingTech(null); setDeletingGroup(null); }} className="btn-secondary text-sm">취소</button>
                            <button onClick={handleDeleteTechnical} disabled={isDeletingTech || relationshipSaveBlocked}
                                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60">
                                {isDeletingTech ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
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
                            <button onClick={handleReset} disabled={relationshipSaveBlocked || isResetting} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50">초기화</button>
                        </div>
                    </div>
                </section>
            )}

            {(!dataError || requirements.length > 0 || technicalChars.length > 0) && <section className="glass-strong overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
                    <div>
                        <h3 className="font-display text-lg font-bold text-white">QFD 매트릭스</h3>
                        <p className="mt-0.5 text-xs text-gray-500">요구사항 행은 고객요구사항도출표 저장 순서를 그대로 따릅니다.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-gray-400">
                        {/* 개별로 숨긴 그룹을 되살리는 길은 이 버튼뿐이라, 하나라도 숨겨져 있으면 "펼치기"를 우선한다. */}
                        <button
                            type="button"
                            onClick={hiddenTechnicalGroups.length > 0 ? expandAllTechnicalGroups : collapseAllTechnicalGroups}
                            className="inline-flex items-center gap-1 rounded-md border border-indigo-200/20 bg-slate-950/80 px-3 py-1.5 font-semibold text-indigo-50 transition-colors hover:border-indigo-300 hover:bg-indigo-500/20"
                        >
                            {hiddenTechnicalGroups.length > 0 ? '기술특성 전체 펼치기' : '기술특성 전체 접기'}
                        </button>
                        <div className="hidden items-center gap-3 md:flex">
                        {RELATIONSHIP_OPTIONS.slice(1).map((option) => (
                            <span key={option.value} className={option.className}>{option.label} = {option.description}</span>
                        ))}
                        </div>
                    </div>
                </div>

                {technicalGroups.length === 0 && <p className="px-4 py-5 text-sm text-gray-400">등록된 세부기능이 없습니다. 그룹을 추가하고 첫 세부기능을 입력해 주세요.</p>}
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
                                {visibleTechnicalGroups.map((group) => (
                                    <th key={group.groupIndex} className="border border-white/[0.08] bg-indigo-500/15 px-2 py-2 text-center font-bold text-indigo-100" colSpan={group.technicals.length}>
                                        <div className="mb-1 text-[10px] text-indigo-200/70">그룹 {group.groupIndex + 1}</div>
                                        <div className="whitespace-normal break-words text-xs text-indigo-50">{group.coreNames.join(' · ') || '핵심기능 미연결'}</div>
                                        <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
                                            {canWriteTechnicals && <>
                                                <button type="button" onClick={() => openAddTechnical(group.groupIndex)}
                                                    aria-label={`그룹 ${group.groupIndex + 1} 세부기능 추가`}
                                                    className="rounded border border-indigo-200/20 px-2 py-1 text-[10px] hover:bg-indigo-500/20">+ 세부기능</button>
                                                <button type="button" onClick={() => { setDeletingTech(null); setDeletingGroup(group); }}
                                                    disabled={relationshipSaveBlocked} aria-label={`그룹 ${group.groupIndex + 1} 삭제`}
                                                    className="rounded border border-rose-200/20 px-2 py-1 text-[10px] text-rose-200 disabled:opacity-50">그룹 삭제</button>
                                            </>}
                                            <button type="button" onClick={() => toggleTechnicalGroup(group.groupIndex)}
                                                aria-label={`그룹 ${group.groupIndex + 1} 영역 숨기기`}
                                                className="rounded border border-indigo-200/20 px-2 py-1 text-[10px] hover:bg-indigo-500/20">접기</button>
                                        </div>
                                    </th>
                                ))}
                                <th className="border border-white/[0.08] bg-rose-500/10 px-2 py-2 text-center font-bold text-rose-100" colSpan={benchmarkColumnCount + 2}>중요도 및 경쟁 비교</th>
                                <th className="border border-white/[0.08] bg-sky-500/10 px-2 py-2 text-center font-bold text-sky-100" colSpan={5}>기획품질</th>
                            </tr>
                            <tr>
                                <th className="border border-white/[0.08] bg-cyan-500/10 px-2 py-2 text-center font-semibold text-blue-200">2차 그룹</th>
                                <th className="border border-white/[0.08] bg-cyan-500/10 px-2 py-2 text-center font-semibold text-red-200">1차 그룹</th>
                                <th className="border border-white/[0.08] bg-cyan-500/10 px-2 py-2 text-center font-semibold text-white">항목</th>
                                {visibleTechnicalColumns.map(({ tech }) => (
                                    <th key={tech.id} className="h-[104px] border border-white/[0.08] bg-indigo-500/10 p-1 text-center align-bottom font-semibold">
                                        <div className="flex h-full flex-col justify-end gap-1">
                                            <div className="flex items-center justify-center gap-1">
                                                <span className="text-[10px] font-semibold text-indigo-200/70">세부기능</span>
                                                {canWriteTechnicals && (
                                                    <button
                                                        type="button"
                                                        onClick={() => { setDeletingGroup(null); setDeletingTech(tech); }}
                                                        disabled={relationshipSaveBlocked}
                                                        className="inline-flex h-4 w-4 items-center justify-center rounded border border-rose-200/20 bg-white/[0.08] text-[11px] font-bold leading-none text-rose-100 transition-colors hover:bg-rose-500/30"
                                                        title={`${tech.name || '세부기능'} 열 삭제`}
                                                        aria-label={`${tech.name || '세부기능'} 열 삭제`}
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                            <select
                                                value={tech.name}
                                                disabled={!canWriteTechnicals}
                                                aria-label={`${tech.name} 세부기능`}
                                                onChange={(event) => setTechnicalSubFunction(tech, event.target.value)}
                                                className="min-h-9 w-full rounded-md border border-indigo-200/15 bg-slate-950/80 px-1 text-center text-[11px] font-semibold leading-tight text-cyan-50 outline-none focus:border-cyan-300"
                                                title="세부기능 선택"
                                            >
                                                {subFunctionOptions.map((sub) => (
                                                    <option key={sub.id} value={sub.name}>{sub.name}</option>
                                                ))}
                                                {!subFunctionOptions.some((sub) => sub.name === tech.name) && (
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
                                            const strength = getRelationship(requirement.id, tech.id);
                                            const option = RELATIONSHIP_OPTIONS.find((item) => item.value === strength) || RELATIONSHIP_OPTIONS[0];
                                            const saveFailed = failedRelationships.some((item) => item.requirementId === requirement.id && item.technicalCharId === tech.id);
                                            const cellLabel = `${requirement.requirement} / ${tech.name}`;

                                            return (
                                                <td key={tech.id} className="border border-white/[0.08] bg-white/[0.02] p-0 text-center">
                                                    <select
                                                        value={strength}
                                                        aria-label={`${cellLabel} 관계 강도`}
                                                        aria-invalid={saveFailed}
                                                        onChange={(event) => setRelationshipVal(requirement.id, tech.id, event.target.value as Relationship['strength'])}
                                                        className={`h-[31px] w-full cursor-pointer border-none bg-transparent p-1 text-center text-base font-bold outline-none hover:bg-cyan-500/10 ${option.className}`}
                                                        title={`${option.description} (${option.label})`}
                                                    >
                                                        {RELATIONSHIP_OPTIONS.map((item) => (
                                                            <option key={item.value} value={item.value}>{item.label}</option>
                                                        ))}
                                                    </select>
                                                    {saveFailed && (
                                                        <button
                                                            type="button"
                                                            onClick={() => retryRelationship(requirement.id, tech.id)}
                                                            aria-label={`${cellLabel} 관계 저장 재시도`}
                                                            className="w-full bg-rose-500/20 px-1 text-[10px] text-rose-200 underline"
                                                        >저장 실패 · 재시도</button>
                                                    )}
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
                                        <td className={`border border-white/[0.08] bg-sky-500/[0.07] p-1 text-center ${analysis?.rank && analysis.rank >= 1 && analysis.rank <= 5 ? 'font-bold text-red-600' : 'font-normal text-black'}`}>{analysis?.rank || '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="h-[32px]">
                                <td colSpan={3} className="border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-center font-bold text-gray-200">품질중요도</td>
                                {visibleTechnicalColumns.map(({ tech }) => {
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
                                    const analysis = getTechAnalysis(tech.id);
                                    return <td key={tech.id} className={`border border-white/[0.08] bg-white/[0.04] p-1 text-center ${analysis?.rank && analysis.rank >= 1 && analysis.rank <= 5 ? 'font-bold text-red-600' : 'font-normal text-black'}`}>{analysis?.rank || '-'}</td>;
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
                                        // 네 줄 모두 입력 칸이다. 측정단위·설계 목표치는 기술특성 자신의
                                        // 열이고, 자사·경쟁사는 technical_benchmarks 의 회사별 행이다.
                                        const editableField: TechnicalTextField | null = row.kind === 'unit'
                                            ? 'unit'
                                            : row.kind === 'target'
                                                ? 'targetValue'
                                                : null;

                                        if (row.kind === 'self' || row.kind === 'competitor') {
                                            const company = row.kind === 'self' ? SELF_COMPANY : row.company;
                                            const label = row.kind === 'self' ? '자사' : row.rowLabel;

                                            return (
                                                <td key={`${row.key}-${tech.id}`} className="border border-white/[0.08] bg-white/[0.025] p-0">
                                                    <input
                                                        type="text"
                                                        value={getTechBenchmarkValue(tech, company)}
                                                        onChange={(event) => setTechFieldDrafts((drafts) => ({
                                                            ...drafts,
                                                            [techBenchmarkKey(tech.id, company)]: event.target.value,
                                                        }))}
                                                        onBlur={(event) => {
                                                            if (!(event.relatedTarget instanceof HTMLElement && event.relatedTarget.hasAttribute('data-worksheet-save'))) {
                                                                commitTechBenchmark(tech, company, label);
                                                            }
                                                        }}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter') event.currentTarget.blur();
                                                        }}
                                                        className="h-[30px] w-full border-none bg-transparent px-1 text-center text-[11px] text-gray-100 outline-none placeholder:text-gray-600 focus:bg-white/[0.06]"
                                                        placeholder="-"
                                                        title={`${tech.name || '세부기능'} ${label} 값`}
                                                        aria-label={`${tech.name || '세부기능'} ${label} 값`}
                                                    />
                                                </td>
                                            );
                                        }

                                        if (editableField) {
                                            return (
                                                <td key={`${row.key}-${tech.id}`} className="border border-white/[0.08] bg-white/[0.025] p-0">
                                                    <input
                                                        type="text"
                                                        value={getTechFieldValue(tech, editableField)}
                                                        onChange={(event) => setTechFieldDrafts((drafts) => ({
                                                            ...drafts,
                                                            [techFieldKey(tech.id, editableField)]: event.target.value,
                                                        }))}
                                                        onBlur={(event) => {
                                                            if (!(event.relatedTarget instanceof HTMLElement && event.relatedTarget.hasAttribute('data-worksheet-save'))) {
                                                                commitTechField(tech, editableField);
                                                            }
                                                        }}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter') event.currentTarget.blur();
                                                        }}
                                                        className="h-[30px] w-full border-none bg-transparent px-1 text-center text-[11px] text-gray-100 outline-none placeholder:text-gray-600 focus:bg-white/[0.06]"
                                                        placeholder="-"
                                                        title={`${tech.name || '세부기능'} ${TECHNICAL_FIELD_LABELS[editableField]}`}
                                                        aria-label={`${tech.name || '세부기능'} ${TECHNICAL_FIELD_LABELS[editableField]}`}
                                                    />
                                                </td>
                                            );
                                        }

                                        const value = '-';

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
                                    <span className={`text-xs ${tech.rank && tech.rank >= 1 && tech.rank <= 5 ? 'font-bold text-red-600' : 'font-normal text-black'}`}>#{tech.rank ?? '-'}</span>
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
                <div role="dialog" aria-modal="true" aria-label={addingToGroup === null ? '그룹 추가' : '세부기능 추가'} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
                    <div className="glass-strong w-full max-w-md p-6">
                        <div className="mb-6 flex items-center justify-between">
                            <h3 className="text-xl font-display font-bold text-white">{addingToGroup === null ? '그룹 추가' : `그룹 ${addingToGroup + 1} 세부기능 추가`}</h3>
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
                                <label htmlFor="qfd-new-technical-name" className="mb-1.5 block text-sm font-medium text-gray-300">{addingToGroup === null ? '첫 세부기능' : '세부기능'} *</label>
                                <p className="mb-2 text-xs text-gray-400">WS-10 세부스펙을 선택하거나 직접 입력하세요. 그룹 제목은 연결된 핵심기능으로 표시됩니다.</p>
                                <input
                                    type="text"
                                    id="qfd-new-technical-name"
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
                                <button onClick={handleAddTechnical} disabled={!newTech.name.trim() || isAddingTechnical} className="btn-primary flex-1 py-3 disabled:opacity-50">{isAddingTechnical ? '추가 중...' : '추가'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </fieldset>
    );
}
