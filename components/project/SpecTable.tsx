'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buildFlatSpecRowsFromFunctions } from '@/lib/spec-table-utils';
import { readBusinessPlanForSpec } from '@/lib/business-plan-sections';
import { describeAiEngine } from '@/lib/ai/engine-label';
import {
    BrowserLocalError,
    callBrowserLocalLlm,
    discoverBrowserLocalEndpoint,
} from '@/lib/ai/browser-local';

interface SpecFunction {
    id: string;
    projectId?: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string;
    name: string;
    technology?: string;
    order: number;
}

interface ProjectData {
    id: string;
    name: string;
    description?: string;
    detailedDescription?: string;
}

interface SpecTableProps {
    projectId: string;
    onSaved?: () => void; // 저장 후 다음 워크시트(제품속성서) 이동 콜백
}

interface FlatSpecRow {
    id: string;
    core: string;
    sub: string;
    detail: string;
    technology: string;
}

interface GroupedSpecRow extends FlatSpecRow {
    coreRowSpan: number;
    subRowSpan: number;
}

type SpecAiWizardStep = 'guide' | 'questions' | 'review' | 'fast';

// 서버가 로컬 엔진에 못 붙었을 때 내려주는 봉투. 브라우저가 이걸로 자기 PC의 LLM 을 부른다.
interface BrowserRelayEnvelope {
    task: string;
    prompts: { system: string; user: string };
    candidateBaseUrls: string[];
    preferredModel?: string;
}

interface SpecDraftResponse {
    specFunctions?: SpecFunction[];
    issues?: SpecAiIssue[];
    recommendations?: SpecAiRecommendation[];
    contextSummary?: SpecAiContextSummary | null;
    provider?: string;
    degraded?: boolean;
    browserRelay?: BrowserRelayEnvelope;
}

interface SpecAiContextSummary {
    keywords?: string[];
    customerNeedCount?: number;
    productAttributeCount?: number;
    existingSpecCount?: number;
    qfdTechnicalCount?: number;
    targetSpecCount?: number;
}

interface SpecAiIssue {
    severity: 'info' | 'warning' | 'error';
    message: string;
    specId?: string;
}

interface SpecAiRecommendation {
    type: 'qfd' | 'targetSpec';
    label: string;
    reason: string;
}

export default function SpecTable({ projectId, onSaved }: SpecTableProps) {
    const router = useRouter();
    const templateDownloadUrl = `/api/projects/${projectId}/import/template?sheet=spec`;
    const [project, setProject] = useState<ProjectData | null>(null);
    const [rows, setRows] = useState<FlatSpecRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isUploadingExcel, setIsUploadingExcel] = useState(false);
    const [activeMode, setActiveMode] = useState<'manual' | 'auto'>('manual');
    const [showAiDetailPopup, setShowAiDetailPopup] = useState(false);
    const [aiDetailInput, setAiDetailInput] = useState('');
    const [aiWizardStep, setAiWizardStep] = useState<SpecAiWizardStep>('guide');
    const [aiQuestionInput, setAiQuestionInput] = useState({
        desiredFunctions: '',
    });
    const [aiFastRows, setAiFastRows] = useState<FlatSpecRow[]>([]);
    const [aiDraftSpecs, setAiDraftSpecs] = useState<SpecFunction[]>([]);
    const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
    const [aiIssues, setAiIssues] = useState<SpecAiIssue[]>([]);
    const [aiRecommendations, setAiRecommendations] = useState<SpecAiRecommendation[]>([]);
    const [aiContextSummary, setAiContextSummary] = useState<SpecAiContextSummary | null>(null);
    // 어떤 엔진이 이 초안을 만들었는지 결과 화면에 배지로 보여준다.
    const [aiEngineLabel, setAiEngineLabel] = useState('');
    // 브라우저 경유 호출은 최대 90초 걸릴 수 있어 진행 상황을 알려주고 취소도 받는다.
    const [relayStatus, setRelayStatus] = useState('');
    const relayAbortRef = useRef<AbortController | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [pendingExcelFile, setPendingExcelFile] = useState<File | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const excelInputRef = useRef<HTMLInputElement | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ message, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    const buildRowsFromSpecs = useCallback((loadedSpecs: SpecFunction[]) => {
        return buildFlatSpecRowsFromFunctions(loadedSpecs);
    }, []);

    // 데이터 로드
    useEffect(() => {
        async function loadData() {
            try {
                const [projRes, specRes] = await Promise.all([
                    fetch('/api/projects'),
                    fetch(`/api/projects/${projectId}/spec`),
                ]);

                if (projRes.ok) {
                    const projData = await projRes.json();
                    const found = projData.projects?.find((p: any) => p.id === projectId);
                    if (found) setProject(found);
                }

                if (specRes.ok) {
                    const specData = await specRes.json();
                    const loadedSpecs: SpecFunction[] = specData.specFunctions || [];
                    setRows(buildRowsFromSpecs(loadedSpecs));
                }
            } catch (error) {
                console.error('데이터 로딩 실패:', error);
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, [buildRowsFromSpecs, projectId]);

    const addRow = () => {
        setRows([...rows, { id: Math.random().toString(36).slice(2), core: '', sub: '', detail: '', technology: '' }]);
    };

    const insertRowAfter = (id: string, newRow: FlatSpecRow) => {
        const targetIndex = rows.findIndex(r => r.id === id);
        if (targetIndex === -1) {
            setRows([...rows, newRow]);
            return;
        }
        setRows([
            ...rows.slice(0, targetIndex + 1),
            newRow,
            ...rows.slice(targetIndex + 1),
        ]);
    };

    const addSubToCore = (row: FlatSpecRow) => {
        insertRowAfter(row.id, {
            id: Math.random().toString(36).slice(2),
            core: row.core.trim(),
            sub: '',
            detail: '',
            technology: '',
        });
    };

    const addDetailToSub = (row: FlatSpecRow) => {
        insertRowAfter(row.id, {
            id: Math.random().toString(36).slice(2),
            core: row.core.trim(),
            sub: row.sub.trim(),
            detail: '',
            technology: '',
        });
    };

    const updateRow = (id: string, field: keyof FlatSpecRow, value: string) => {
        setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const updateCoreGroup = (index: number, value: string) => {
        const currentCore = rows[index]?.core.trim();
        if (!currentCore) {
            updateRow(rows[index].id, 'core', value);
            return;
        }

        let start = index;
        while (start > 0 && rows[start - 1].core.trim() === currentCore) start--;
        let end = index;
        while (end + 1 < rows.length && rows[end + 1].core.trim() === currentCore) end++;

        setRows(rows.map((row, rowIndex) => (
            rowIndex >= start && rowIndex <= end ? { ...row, core: value } : row
        )));
    };

    const updateSubGroup = (index: number, value: string) => {
        const currentCore = rows[index]?.core.trim();
        const currentSub = rows[index]?.sub.trim();
        if (!currentSub) {
            updateRow(rows[index].id, 'sub', value);
            return;
        }

        let start = index;
        while (
            start > 0 &&
            rows[start - 1].core.trim() === currentCore &&
            rows[start - 1].sub.trim() === currentSub
        ) start--;
        let end = index;
        while (
            end + 1 < rows.length &&
            rows[end + 1].core.trim() === currentCore &&
            rows[end + 1].sub.trim() === currentSub
        ) end++;

        setRows(rows.map((row, rowIndex) => (
            rowIndex >= start && rowIndex <= end ? { ...row, sub: value } : row
        )));
    };

    const deleteRow = (id: string) => {
        setRows(rows.filter(r => r.id !== id));
    };

    const coreOptions = useMemo(() => {
        return Array.from(new Set(rows.map(row => row.core.trim()).filter(Boolean)));
    }, [rows]);

    const subOptionsByCore = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const row of rows) {
            const core = row.core.trim();
            const sub = row.sub.trim();
            if (!core || !sub) continue;
            const options = map.get(core) || [];
            if (!options.includes(sub)) options.push(sub);
            map.set(core, options);
        }
        return map;
    }, [rows]);

    const allSubOptions = useMemo(() => {
        return Array.from(new Set(rows.map(row => row.sub.trim()).filter(Boolean)));
    }, [rows]);

    const detailOptions = useMemo(() => {
        return Array.from(new Set(rows.map(row => row.detail.trim()).filter(Boolean)));
    }, [rows]);

    const technologyOptions = useMemo(() => {
        return Array.from(new Set(rows.map(row => row.technology.trim()).filter(Boolean)));
    }, [rows]);

    const groupedRows = useMemo<GroupedSpecRow[]>(() => {
        return rows.map((row, index) => {
            const core = row.core.trim();
            const sub = row.sub.trim();
            const previous = rows[index - 1];
            const isFirstCore = !core || !previous || previous.core.trim() !== core;
            const isFirstSub = !sub || isFirstCore || !previous || previous.sub.trim() !== sub || previous.core.trim() !== core;

            let coreRowSpan = 0;
            if (isFirstCore) {
                coreRowSpan = 1;
                while (index + coreRowSpan < rows.length && core && rows[index + coreRowSpan].core.trim() === core) {
                    coreRowSpan++;
                }
            }

            let subRowSpan = 0;
            if (isFirstSub) {
                subRowSpan = 1;
                while (
                    index + subRowSpan < rows.length &&
                    sub &&
                    rows[index + subRowSpan].core.trim() === core &&
                    rows[index + subRowSpan].sub.trim() === sub
                ) {
                    subRowSpan++;
                }
            }

            return { ...row, coreRowSpan, subRowSpan };
        });
    }, [rows]);

    const aiGroupedRows = useMemo<GroupedSpecRow[]>(() => {
        return aiFastRows.map((row, index) => {
            const core = row.core.trim();
            const sub = row.sub.trim();
            const previous = aiFastRows[index - 1];
            const isFirstCore = !core || !previous || previous.core.trim() !== core;
            const isFirstSub = !sub || !previous || previous.core.trim() !== core || previous.sub.trim() !== sub;

            let coreRowSpan = 0;
            if (isFirstCore) {
                coreRowSpan = 1;
                while (index + coreRowSpan < aiFastRows.length && core && aiFastRows[index + coreRowSpan].core.trim() === core) {
                    coreRowSpan++;
                }
            }

            let subRowSpan = 0;
            if (isFirstSub) {
                subRowSpan = 1;
                while (
                    index + subRowSpan < aiFastRows.length &&
                    sub &&
                    aiFastRows[index + subRowSpan].core.trim() === core &&
                    aiFastRows[index + subRowSpan].sub.trim() === sub
                ) {
                    subRowSpan++;
                }
            }

            return { ...row, coreRowSpan, subRowSpan };
        });
    }, [aiFastRows]);

    const aiDraftRows = useMemo(() => buildRowsFromSpecs(aiDraftSpecs), [aiDraftSpecs, buildRowsFromSpecs]);

    const handleSpecExcelUpload = (file: File | null) => {
        if (!file) return;
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
            showToast('.xlsx 또는 .xls 파일만 업로드할 수 있습니다.', 'error');
            if (excelInputRef.current) excelInputRef.current.value = '';
            return;
        }

        setPendingExcelFile(file);
    };

    const uploadSpecExcelFile = async (file: File, writePolicy: 'append' | 'replace') => {
        setIsUploadingExcel(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('writePolicy', writePolicy);
            const res = await fetch(`/api/projects/${projectId}/spec/upload-excel`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                const checkedSheets = data?.checkedSheets?.length
                    ? ` 확인한 시트: ${data.checkedSheets.join(', ')}`
                    : '';
                throw new Error(`${data?.error || '엑셀 업로드에 실패했습니다.'}${checkedSheets}`);
            }

            const loadedSpecs: SpecFunction[] = data.specFunctions || [];
            setRows(buildRowsFromSpecs(loadedSpecs));
            setActiveMode('manual');
            showToast(`${data.sheetName || '엑셀'}에서 AS-IS 스펙 ${data.specCount || loadedSpecs.length}개를 반영했습니다.`, 'success');
        } catch (error) {
            console.error('AS-IS 스펙 엑셀 업로드 실패:', error);
            showToast(error instanceof Error ? error.message : '엑셀 업로드에 실패했습니다.', 'error');
        } finally {
            setIsUploadingExcel(false);
            setPendingExcelFile(null);
            if (excelInputRef.current) excelInputRef.current.value = '';
        }
    };

    const handleAutoGenerate = async () => {
        const additionalDescription = aiDetailInput.trim();
        const desiredFunctions = aiQuestionInput.desiredFunctions.trim();
        if (!additionalDescription || !desiredFunctions) {
            showToast('세부설명과 원하는 기능을 모두 입력하세요.', 'error');
            return;
        }

        setAiDraftSpecs([]);
        setSelectedDraftIds(new Set());
        setAiIssues([]);
        setAiRecommendations([]);
        setAiContextSummary(null);
        setAiEngineLabel('');
        setIsGenerating(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/spec/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'draft',
                    additionalDescription,
                    structuredInput: {
                        productService: project?.name || '',
                        currentFunctions: desiredFunctions,
                    },
                }),
            });
            if (!res.ok) {
                showToast('FAST 결과표 생성에 실패했습니다.', 'error');
                return;
            }

            const data = await res.json();

            // 서버가 로컬 엔진에 못 붙어 브라우저 경유를 제안했으면, 내 PC의 LLM 을 직접 부른다.
            // 실패하면 이미 응답에 담겨 온 규칙 기반 결과를 그대로 쓴다.
            if (data.browserRelay) {
                const relayed = await tryBrowserRelay(data.browserRelay, additionalDescription);
                applyDraftResult(relayed ?? data);
                return;
            }

            applyDraftResult(data);
        } catch (error) {
            console.error('FAST 결과표 생성 실패:', error);
            showToast('FAST 결과표 생성에 실패했습니다.', 'error');
        } finally {
            setIsGenerating(false);
            setRelayStatus('');
        }
    };

    const applyDraftResult = (data: SpecDraftResponse) => {
        const loadedSpecs: SpecFunction[] = data.specFunctions || [];
        setAiDraftSpecs(loadedSpecs);
        setAiFastRows(buildRowsFromSpecs(loadedSpecs));
        setSelectedDraftIds(new Set(loadedSpecs.map((spec) => spec.id)));
        setAiIssues(data.issues || []);
        setAiRecommendations(data.recommendations || []);
        setAiContextSummary(data.contextSummary || null);
        setAiEngineLabel(describeAiEngine(data));
        setAiWizardStep('fast');
        showToast('FAST 결과표 초안을 만들었습니다. 수정 후 확정하세요.', 'info');
    };

    // 성공하면 서버가 검증까지 마친 결과를, 실패하면 null 을 돌려준다.
    const tryBrowserRelay = async (
        relay: BrowserRelayEnvelope,
        additionalDescription: string
    ): Promise<SpecDraftResponse | null> => {
        const controller = new AbortController();
        relayAbortRef.current = controller;

        try {
            setRelayStatus('내 PC에서 로컬 AI를 찾는 중...');
            const endpoint = await discoverBrowserLocalEndpoint(
                relay.candidateBaseUrls,
                relay.preferredModel,
                controller.signal
            );
            if (!endpoint) {
                showToast(
                    '로컬 AI를 찾지 못해 기본 엔진으로 만들었습니다. Ollama·LM Studio 실행 여부와 CORS 설정을 확인하세요.',
                    'info'
                );
                return null;
            }

            setRelayStatus(`${endpoint.model} 모델로 생성 중... (최대 90초)`);
            const content = await callBrowserLocalLlm(endpoint, relay.prompts, { signal: controller.signal });

            setRelayStatus('결과를 검증하는 중...');
            const res = await fetch(`/api/projects/${projectId}/spec/generate/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, additionalDescription }),
            });
            if (!res.ok) {
                showToast('로컬 AI 응답 형식이 맞지 않아 기본 엔진 결과를 사용합니다.', 'info');
                return null;
            }
            return await res.json();
        } catch (error) {
            const message = error instanceof BrowserLocalError
                ? error.message
                : '로컬 AI 호출에 실패했습니다.';
            showToast(`${message} 기본 엔진 결과를 사용합니다.`, 'info');
            return null;
        } finally {
            relayAbortRef.current = null;
        }
    };

    // 개요에 저장된 사업계획 내용을 FAST 입력칸으로 옮긴다.
    // 양식으로 채운 경우 핵심 기능 구획이 있어 원하는 기능까지 자동으로 채워진다.
    const businessPlanForSpec = useMemo(
        () => readBusinessPlanForSpec(project?.detailedDescription),
        [project?.detailedDescription]
    );

    const applyBusinessPlanToWizard = () => {
        setAiDetailInput(businessPlanForSpec.detailText || project?.description || '');
        setAiQuestionInput({ desiredFunctions: businessPlanForSpec.desiredFunctions });
    };

    const openAiDetailPopup = () => {
        setAiWizardStep('guide');
        setAiDetailInput(prev => prev || businessPlanForSpec.detailText || project?.description || '');
        setAiQuestionInput({
            desiredFunctions: businessPlanForSpec.desiredFunctions,
        });
        setAiFastRows([]);
        setShowAiDetailPopup(true);
    };

    const toggleDraftSpec = (id: string) => {
        setSelectedDraftIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const getSelectedDraftSpecs = () => {
        const selected = new Set(selectedDraftIds);
        const byId = new Map(aiDraftSpecs.map((spec) => [spec.id, spec]));
        for (const spec of aiDraftSpecs) {
            if (!selected.has(spec.id)) continue;
            let parentId = spec.parentId;
            while (parentId) {
                selected.add(parentId);
                parentId = byId.get(parentId)?.parentId;
            }
        }
        return aiDraftSpecs.filter((spec) => selected.has(spec.id));
    };

    const applySelectedDraft = () => {
        if (aiFastRows.length === 0) {
            showToast('반영할 FAST 양식 행이 없습니다.', 'error');
            return;
        }

        setRows(aiFastRows);
        setActiveMode('manual');
        setShowAiDetailPopup(false);
        showToast(`FAST 양식 ${aiFastRows.length}행을 표에 반영했습니다. 저장 버튼을 눌러 확정하세요.`, 'success');
    };

    const updateAiFastRow = (id: string, field: keyof FlatSpecRow, value: string) => {
        setAiFastRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
    };

    const updateAiFastCoreGroup = (index: number, value: string) => {
        const currentCore = aiFastRows[index]?.core.trim();
        if (!currentCore) {
            updateAiFastRow(aiFastRows[index].id, 'core', value);
            return;
        }

        let start = index;
        while (start > 0 && aiFastRows[start - 1].core.trim() === currentCore) start--;
        let end = index;
        while (end + 1 < aiFastRows.length && aiFastRows[end + 1].core.trim() === currentCore) end++;

        setAiFastRows(prev => prev.map((row, rowIndex) => (
            rowIndex >= start && rowIndex <= end ? { ...row, core: value } : row
        )));
    };

    const updateAiFastSubGroup = (index: number, value: string) => {
        const currentCore = aiFastRows[index]?.core.trim();
        const currentSub = aiFastRows[index]?.sub.trim();
        if (!currentSub) {
            updateAiFastRow(aiFastRows[index].id, 'sub', value);
            return;
        }

        let start = index;
        while (
            start > 0 &&
            aiFastRows[start - 1].core.trim() === currentCore &&
            aiFastRows[start - 1].sub.trim() === currentSub
        ) start--;
        let end = index;
        while (
            end + 1 < aiFastRows.length &&
            aiFastRows[end + 1].core.trim() === currentCore &&
            aiFastRows[end + 1].sub.trim() === currentSub
        ) end++;

        setAiFastRows(prev => prev.map((row, rowIndex) => (
            rowIndex >= start && rowIndex <= end ? { ...row, sub: value } : row
        )));
    };

    const deleteAiFastRow = (id: string) => {
        setAiFastRows(prev => prev.filter(row => row.id !== id));
    };

    const addAiFastRow = () => {
        setAiFastRows(prev => [...prev, {
            id: Math.random().toString(36).slice(2),
            core: '',
            sub: '',
            detail: '',
            technology: '',
        }]);
    };

    const serializeSpecs = (): SpecFunction[] => {
        const specs: SpecFunction[] = [];
        let orderCounter = 0;
        const coreMap = new Map<string, string>();
        const subMap = new Map<string, string>();
        const specById = new Map<string, SpecFunction>();
        let lastCore = '';
        let lastSub = '';

        for (const row of rows) {
            const currentCore = row.core.trim() || lastCore;
            const currentSub = row.sub.trim() || (row.core.trim() ? '' : lastSub);
            const technology = row.technology.trim();

            if (!currentCore) continue; // 완전히 빈 행 스킵

            // Core 처리
            let coreId = coreMap.get(currentCore);
            if (!coreId) {
                coreId = `core_${orderCounter}`;
                const coreSpec: SpecFunction = { id: coreId, level: 'CORE', name: currentCore, order: orderCounter++ };
                specs.push(coreSpec);
                specById.set(coreId, coreSpec);
                coreMap.set(currentCore, coreId);
            }

            lastCore = currentCore;

            if (!currentSub) {
                // Core만 있는 행 (Sub 없음) → Core만 저장하고 계속
                const coreSpec = specById.get(coreId);
                if (coreSpec && technology && !coreSpec.technology) coreSpec.technology = technology;
                continue;
            }

            // Sub 처리
            const subKey = `${currentCore}_${currentSub}`;
            let subId = subMap.get(subKey);
            if (!subId) {
                subId = `sub_${orderCounter}`;
                const subSpec: SpecFunction = { id: subId, level: 'SUB', parentId: coreId, name: currentSub, order: orderCounter++ };
                specs.push(subSpec);
                specById.set(subId, subSpec);
                subMap.set(subKey, subId);
            }

            lastSub = currentSub;

            // Detail 처리 (없어도 Sub는 이미 저장됨)
            if (!row.detail.trim()) {
                const subSpec = specById.get(subId);
                if (subSpec && technology && !subSpec.technology) subSpec.technology = technology;
                continue;
            }

            specs.push({
                id: `detail_${orderCounter}`,
                level: 'DETAIL',
                parentId: subId,
                name: row.detail.trim(),
                technology,
                order: orderCounter++
            });
        }
        return specs;
    };


    // 저장
    const handleSave = async (moveNext = false) => {
        setIsSaving(true);
        try {
            const finalSpecs = serializeSpecs();
            const res = await fetch(`/api/projects/${projectId}/spec`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ specFunctions: finalSpecs }),
            });
            if (res.ok) {
                if (moveNext) {
                    showToast('저장되었습니다. 제품속성서로 이동합니다...', 'success');
                    setTimeout(() => {
                        onSaved?.();
                    }, 1000);
                } else {
                    showToast('저장되었습니다.', 'success');
                }
            } else {
                showToast('저장에 실패했습니다.', 'error');
            }
        } catch (error) {
            showToast('저장에 실패했습니다.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/spec`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ specFunctions: [] }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => null);
                throw new Error(errorData?.error || 'AS-IS spec reset failed.');
            }

            setRows([]);
            setShowResetConfirm(false);
            showToast('AS-IS 스펙표가 초기화되었습니다.', 'success');
        } catch (error) {
            console.error('AS-IS 스펙표 초기화 실패:', error);
            showToast('AS-IS 스펙표 초기화에 실패했습니다.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-gray-400">로딩 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 relative">
            {/* 인라인 토스트 */}
            {toast && (
                <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border animate-fade-in ${toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200' :
                        toast.type === 'error' ? 'bg-red-900/90 border-red-500/40 text-red-200' :
                            'bg-blue-900/90 border-blue-500/40 text-blue-200'
                    }`}>
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                            toast.type === 'success' ? 'M5 13l4 4L19 7' :
                                toast.type === 'error' ? 'M6 18L18 6M6 6l12 12' :
                                    'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                        } />
                    </svg>
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>
            )}
            {pendingExcelFile && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-emerald-100">엑셀 양식 업로드</h3>
                            <p className="mt-1 text-xs text-emerald-200/70">
                                {pendingExcelFile.name} 파일을 AS-IS 스펙표로 반영할 방식을 선택하세요.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => uploadSpecExcelFile(pendingExcelFile, 'append')}
                                disabled={isUploadingExcel}
                                className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {isUploadingExcel ? '업로드 중...' : '기존 데이터에 추가'}
                            </button>
                            <button
                                type="button"
                                onClick={() => uploadSpecExcelFile(pendingExcelFile, 'replace')}
                                disabled={isUploadingExcel}
                                className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                기존 데이터 지우고 업로드
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setPendingExcelFile(null);
                                    if (excelInputRef.current) excelInputRef.current.value = '';
                                }}
                                disabled={isUploadingExcel}
                                className="px-3 py-1.5 text-sm text-gray-300 hover:text-white disabled:opacity-50"
                            >
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showAiDetailPopup && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4">
                    <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-xl border border-white/10 bg-gray-950 shadow-2xl">
                        <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
                            <div>
                                <h3 className="text-lg font-semibold text-white">WS-2 FAST 작성 지원</h3>
                                <p className="mt-1 text-sm text-gray-400">
                                    세부설명과 원하는 기능을 바탕으로 FAST 결과표를 만들고, 확정된 내용만 본 페이지 표에 반영합니다.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAiDetailPopup(false)}
                                disabled={isGenerating}
                                className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white disabled:opacity-50"
                                aria-label="닫기"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                            <div className="grid grid-cols-4 gap-2 text-xs">
                                {[
                                    ['guide', '1. 안내'],
                                    ['questions', '2. 입력'],
                                    ['review', '3. 검토'],
                                    ['fast', '4. FAST 결과표'],
                                ].map(([step, label]) => (
                                    <div key={step} className={`rounded-md px-3 py-2 text-center font-semibold ${aiWizardStep === step ? 'bg-accent-600 text-white' : 'bg-white/[0.04] text-gray-500'}`}>
                                        {label}
                                    </div>
                                ))}
                            </div>

                            {aiWizardStep === 'guide' && (
                                <div className="space-y-4">
                                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 text-sm leading-6 text-blue-100">
                                        <p className="font-semibold text-white">작성에 필요한 내용 안내.</p>
                                        <p className="mt-2">프로젝트명, 프로젝트 설명, 기존 WS-2 항목은 자동으로 참고합니다. 추가로는 세부설명과 원하는 기능만 입력하면 FAST 결과표를 핵심기술, 세부기술, 세세부기술, 적용기술 순서로 제시합니다.</p>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-3">
                                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                            <p className="text-xs text-gray-500">제품/서비스</p>
                                            <p className="mt-1 text-sm text-white">{project?.name || '미입력'}</p>
                                        </div>
                                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                            <p className="text-xs text-gray-500">프로젝트 설명</p>
                                            <p className="mt-1 line-clamp-3 text-sm text-white">{project?.description || '미입력'}</p>
                                        </div>
                                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                            <p className="text-xs text-gray-500">기존 WS-2 행</p>
                                            <p className="mt-1 text-sm text-white">{rows.length}행</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {aiWizardStep === 'questions' && (
                                <div className="space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary-500/25 bg-primary-500/10 px-3 py-2.5">
                                        <p className="text-xs text-primary-200">
                                            {businessPlanForSpec.hasSections
                                                ? '개요의 사업계획 내용(고객 정의 · 고객 문제 · 핵심 기능)을 불러올 수 있습니다.'
                                                : '개요에 상세 제품개요가 있으면 아래 칸으로 불러올 수 있습니다.'}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={applyBusinessPlanToWizard}
                                            disabled={isGenerating || !businessPlanForSpec.detailText}
                                            className="btn-secondary flex-shrink-0 text-xs disabled:opacity-40"
                                        >
                                            제품개요 불러오기
                                        </button>
                                    </div>
                                    <label className="block">
                                        <span className="mb-1 block text-xs font-medium text-gray-400">세부설명</span>
                                        <textarea
                                            value={aiDetailInput}
                                            onChange={e => setAiDetailInput(e.target.value)}
                                            disabled={isGenerating}
                                            className="min-h-[160px] w-full resize-y rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm leading-6 text-white outline-none focus:border-accent-500 disabled:opacity-60"
                                            placeholder="아이템의 배경, 사용 상황, 고객 문제, 현재 보유한 정보나 기술, 반드시 고려해야 할 제약을 입력하세요."
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-xs font-medium text-gray-400">원하는 기능</span>
                                        <textarea
                                            value={aiQuestionInput.desiredFunctions}
                                            onChange={(event) => setAiQuestionInput({ desiredFunctions: event.target.value })}
                                            disabled={isGenerating}
                                            className="min-h-[120px] w-full resize-y rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm leading-6 text-white outline-none focus:border-accent-500 disabled:opacity-60"
                                            placeholder="예: 고객 문의 자동 분류, 전문가 추천, 결과 리포트 생성처럼 원하는 기능을 줄바꿈 또는 쉼표로 입력하세요."
                                        />
                                    </label>
                                    {relayStatus && (
                                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2.5">
                                            <p className="text-xs text-cyan-100">{relayStatus}</p>
                                            <button
                                                type="button"
                                                onClick={() => relayAbortRef.current?.abort()}
                                                className="flex-shrink-0 rounded-lg px-3 py-1.5 text-xs text-cyan-200 hover:bg-white/10"
                                            >
                                                기다리지 않고 기본 엔진 결과 보기
                                            </button>
                                        </div>
                                    )}
                                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-gray-400">
                                        기본 아이템 정보는 프로젝트와 기존 워크시트에서 불러오며, 위 두 항목은 FAST 결과표를 구체화하는 데만 사용됩니다.
                                    </div>
                                </div>
                            )}

                            {aiWizardStep === 'review' && (
                                <div className="space-y-3">
                                    {[
                                        ['세부설명', aiDetailInput || '미입력'],
                                        ['원하는 기능', aiQuestionInput.desiredFunctions || '미입력'],
                                    ].map(([label, value]) => (
                                        <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                            <p className="text-xs font-semibold text-gray-500">{label}</p>
                                            <p className="mt-1 whitespace-pre-line text-sm text-white">{value}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {aiWizardStep === 'fast' && (
                                <div className="space-y-4">
                                    {aiEngineLabel && (
                                        <div className="flex items-center gap-2">
                                            <span className="badge-primary text-[10px]">{aiEngineLabel}</span>
                                            <span className="text-xs text-gray-500">이 초안을 만든 엔진</span>
                                        </div>
                                    )}
                                    {aiContextSummary && (
                                        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs leading-5 text-cyan-100">
                                            <div>참고 데이터: 제품속성 {aiContextSummary.productAttributeCount ?? 0}개, 고객요구 {aiContextSummary.customerNeedCount ?? 0}개, 기존스펙 {aiContextSummary.existingSpecCount ?? 0}개</div>
                                            {aiContextSummary.keywords?.length ? <div className="mt-1">키워드: {aiContextSummary.keywords.join(', ')}</div> : null}
                                        </div>
                                    )}
                                    {aiIssues.length > 0 && (
                                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">
                                            {aiIssues.slice(0, 4).map((issue, index) => <p key={index}>- {issue.message}</p>)}
                                        </div>
                                    )}
                                    <div className="overflow-auto rounded-lg border border-white/10">
                                        <table className="w-full min-w-[900px] border-collapse text-xs">
                                            <thead className="bg-gray-900">
                                                <tr>
                                                    <th className="border border-white/10 p-2 text-left">핵심기술</th>
                                                    <th className="border border-white/10 p-2 text-left">세부기술</th>
                                                    <th className="border border-white/10 p-2 text-left">세세부기술</th>
                                                    <th className="border border-white/10 p-2 text-left">적용기술</th>
                                                    <th className="border border-white/10 p-2 w-[56px]" />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {aiGroupedRows.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="border border-white/10 p-6 text-center text-gray-500">생성된 FAST 결과표가 없습니다.</td>
                                                    </tr>
                                                ) : aiGroupedRows.map((row, index) => (
                                                    <tr key={row.id}>
                                                        {row.coreRowSpan > 0 && (
                                                            <td className="border border-white/10 p-0 align-top bg-blue-950/10" rowSpan={row.coreRowSpan}>
                                                                <input
                                                                    type="text"
                                                                    value={row.core}
                                                                    onChange={(event) => updateAiFastCoreGroup(index, event.target.value)}
                                                                    className="w-full bg-transparent px-3 py-2 text-blue-100 outline-none focus:bg-white/[0.04]"
                                                                />
                                                            </td>
                                                        )}
                                                        {row.subRowSpan > 0 && (
                                                            <td className="border border-white/10 p-0 align-top bg-purple-950/10" rowSpan={row.subRowSpan}>
                                                                <input
                                                                    type="text"
                                                                    value={row.sub}
                                                                    onChange={(event) => updateAiFastSubGroup(index, event.target.value)}
                                                                    className="w-full bg-transparent px-3 py-2 text-purple-100 outline-none focus:bg-white/[0.04]"
                                                                />
                                                            </td>
                                                        )}
                                                        <td className="border border-white/10 p-0">
                                                            <input
                                                                type="text"
                                                                value={row.detail}
                                                                onChange={(event) => updateAiFastRow(row.id, 'detail', event.target.value)}
                                                                className="w-full bg-transparent px-3 py-2 text-emerald-100 outline-none focus:bg-white/[0.04]"
                                                            />
                                                        </td>
                                                        <td className="border border-white/10 p-0">
                                                            <input
                                                                type="text"
                                                                value={row.technology}
                                                                onChange={(event) => updateAiFastRow(row.id, 'technology', event.target.value)}
                                                                className="w-full bg-transparent px-3 py-2 text-amber-100 outline-none focus:bg-white/[0.04]"
                                                            />
                                                        </td>
                                                        <td className="border border-white/10 p-2 text-center">
                                                            <button type="button" onClick={() => deleteAiFastRow(row.id)} className="text-rose-400 hover:text-rose-300">삭제</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <button type="button" onClick={addAiFastRow} className="btn-secondary text-sm">행 추가</button>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setShowAiDetailPopup(false)}
                                disabled={isGenerating}
                                className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white disabled:opacity-50"
                            >
                                취소
                            </button>
                            {aiWizardStep === 'guide' && (
                                <button type="button" onClick={() => setAiWizardStep('questions')} className="btn-primary">입력 시작</button>
                            )}
                            {aiWizardStep === 'questions' && (
                                <button type="button" onClick={() => setAiWizardStep('review')} className="btn-primary">입력 내용 검토</button>
                            )}
                            {aiWizardStep === 'review' && (
                                <>
                                    <button type="button" onClick={() => setAiWizardStep('questions')} className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-white/5">입력 수정</button>
                                    <button type="button" onClick={handleAutoGenerate} disabled={isGenerating} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                                        {isGenerating ? '생성 중...' : 'FAST 결과표 제시'}
                                    </button>
                                </>
                            )}
                            {aiWizardStep === 'fast' && (
                                <>
                                    <button type="button" onClick={() => setAiWizardStep('questions')} className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-white/5">입력 수정</button>
                                    <button type="button" onClick={applySelectedDraft} disabled={isGenerating || aiFastRows.length === 0} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                                        확정 후 표에 반영
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-display font-bold text-white">[WS-2] AS-IS 스펙표</h2>
                    <p className="text-sm text-gray-400 mt-1">{project?.name || '기능 스펙 정의'}</p>
                </div>

                <div className="flex items-center gap-2">
                    <a
                        href={templateDownloadUrl}
                        className="px-3 py-1.5 bg-blue-900/40 hover:bg-blue-800/60 border border-blue-500/30 text-blue-200 text-sm rounded transition-colors flex items-center gap-1"
                        title="업로드할 워크시트 엑셀 양식을 다운로드합니다."
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                        </svg>
                        양식 다운로드
                    </a>
                    <input
                        ref={excelInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(event) => handleSpecExcelUpload(event.target.files?.[0] ?? null)}
                        className="hidden"
                        id={`spec-excel-upload-${projectId}`}
                    />
                    <label
                        htmlFor={`spec-excel-upload-${projectId}`}
                        className={`px-3 py-1.5 bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-500/30 text-emerald-200 text-sm rounded transition-colors flex items-center gap-1 ${isSaving || isGenerating || isUploadingExcel ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
                        title="엑셀 파일의 AS-IS 스펙표 워크시트로 현재 스펙표를 완성합니다"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        {isUploadingExcel ? '업로드 중...' : '엑셀 업로드'}
                    </label>
                    <button onClick={addRow} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        행 추가
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowResetConfirm(true)}
                        disabled={isSaving || isGenerating}
                        className="px-3 py-1.5 bg-red-900/40 hover:bg-red-800/60 border border-red-500/30 text-red-200 text-sm rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        초기화
                    </button>
                    <button
                        onClick={() => handleSave(false)}
                        disabled={isSaving || rows.length === 0}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>

            {showResetConfirm && (
                <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-red-100">AS-IS 스펙표 초기화</h3>
                            <p className="mt-1 text-xs text-red-200/70">현재 AS-IS 스펙표의 모든 행이 삭제됩니다. 계속하시겠습니까?</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowResetConfirm(false)}
                                disabled={isSaving}
                                className="px-3 py-1.5 text-sm text-gray-300 hover:text-white disabled:opacity-50"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleReset}
                                disabled={isSaving}
                                className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-500 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {isSaving ? '초기화 중...' : '모두 삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-4 mb-6 pt-2 border-t border-gray-800">
                <div className="glass-strong inline-flex p-1 rounded-xl">
                    <button
                        onClick={() => setActiveMode('manual')}
                        className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeMode === 'manual'
                            ? 'bg-primary-600/20 text-white border border-primary-500/25'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        수동 조작 모드
                    </button>
                    <button
                        onClick={() => setActiveMode('auto')}
                        className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeMode === 'auto'
                            ? 'bg-accent-600/20 text-white border border-accent-500/25'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        AI 에이전트
                    </button>
                </div>
            </div>

            {
                activeMode === 'auto' && (
                    <div className="card max-w-lg mx-auto text-center py-12 mb-8 animate-fade-in border border-accent-500/20 bg-accent-500/5">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-accent-500/20 to-primary-500/20 border border-accent-500/20 flex items-center justify-center mb-6">
                            <svg className="w-8 h-8 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <h2 className="text-xl font-display font-bold text-white mb-3">AI 에이전트</h2>
                        <p className="text-gray-400 mb-8 text-sm">
                            프로젝트 정보와 기존 워크시트 데이터를 분석해 AS-IS 스펙 초안을 생성합니다.
                        </p>
                        {rows.length > 0 && rows.some(r => r.core) && (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6 mx-auto max-w-sm">
                                <p className="text-amber-300 text-xs">
                                    기존 스펙이 있습니다. 보완 생성 또는 기술특성 추천 모드로 초안을 검토할 수 있습니다.
                                </p>
                            </div>
                        )}
                        <button
                            onClick={openAiDetailPopup}
                            disabled={isGenerating}
                            className="btn-primary inline-flex items-center gap-2"
                        >
                            {isGenerating ? '생성 중...' : 'AI 에이전트 열기'}
                        </button>
                    </div>
                )
            }

            {
                activeMode === 'manual' && (
                    <div className="card overflow-x-auto bg-gray-900 p-0 rounded-lg border border-gray-700">
                        <datalist id={`core-options-${projectId}`}>
                            {coreOptions.map(option => (
                                <option key={option} value={option} />
                            ))}
                        </datalist>
                        <datalist id={`detail-options-${projectId}`}>
                            {detailOptions.map(option => (
                                <option key={option} value={option} />
                            ))}
                        </datalist>
                        <datalist id={`technology-options-${projectId}`}>
                            {technologyOptions.map(option => (
                                <option key={option} value={option} />
                            ))}
                        </datalist>
                        <table className="w-full border-collapse text-sm table-fixed">
                            <thead>
                                <tr className="bg-gray-800">
                                    <th className="border border-gray-700 p-2 text-gray-300 font-medium text-center w-[50px]">No</th>
                                    <th className="border border-gray-700 p-2 text-blue-400 font-medium text-center">핵심기술</th>
                                    <th className="border border-gray-700 p-2 text-purple-400 font-medium text-center">세부기술</th>
                                    <th className="border border-gray-700 p-2 text-emerald-400 font-medium text-center">세세부기술</th>
                                    <th className="border border-gray-700 p-2 text-amber-400 font-medium text-center">적용기술</th>
                                    <th className="border border-gray-700 p-2 text-gray-500 font-medium text-center w-[116px]"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="border border-gray-700 p-8 text-center text-gray-500 bg-gray-800/20">
                                            데이터가 없습니다. 우상단의 &apos;행 추가&apos; 버튼을 눌러 입력을 시작하세요.
                                        </td>
                                    </tr>
                                ) : (
                                    groupedRows.map((row, idx) => {
                                        const subOptions = row.core.trim()
                                            ? (subOptionsByCore.get(row.core.trim()) || [])
                                            : allSubOptions;

                                        return (
                                        <tr key={row.id} className="hover:bg-gray-800/50 group transition-colors">
                                            <td className="border border-gray-700 p-0 text-center text-gray-500 bg-gray-800/30 select-none">{idx + 1}</td>
                                            {row.coreRowSpan > 0 && (
                                            <td className="border border-gray-700 p-0 align-top bg-blue-950/10" rowSpan={row.coreRowSpan}>
                                                <input
                                                    type="text"
                                                    list={`core-options-${projectId}`}
                                                    value={row.core}
                                                    onChange={e => updateCoreGroup(idx, e.target.value)}
                                                    className="w-full min-h-10 p-2 bg-transparent text-blue-100 outline-none focus:bg-gray-800 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                                                    placeholder="입력 (이전과 동일시 생략가능)"
                                                />
                                            </td>
                                            )}
                                            {row.subRowSpan > 0 && (
                                            <td className="border border-gray-700 p-0 align-top bg-purple-950/10" rowSpan={row.subRowSpan}>
                                                <datalist id={`sub-options-${row.id}`}>
                                                    {subOptions.map(option => (
                                                        <option key={option} value={option} />
                                                    ))}
                                                </datalist>
                                                <input
                                                    type="text"
                                                    list={`sub-options-${row.id}`}
                                                    value={row.sub}
                                                    onChange={e => updateSubGroup(idx, e.target.value)}
                                                    className="w-full min-h-10 p-2 bg-transparent text-purple-100 outline-none focus:bg-gray-800 focus:ring-1 focus:ring-purple-500/50 transition-colors"
                                                    placeholder="입력"
                                                />
                                            </td>
                                            )}
                                            <td className="border border-gray-700 p-0">
                                                <input
                                                    type="text"
                                                    list={`detail-options-${projectId}`}
                                                    value={row.detail}
                                                    onChange={e => updateRow(row.id, 'detail', e.target.value)}
                                                    className="w-full h-full p-2 bg-transparent text-emerald-100 outline-none focus:bg-gray-800 focus:ring-1 focus:ring-emerald-500/50 transition-colors"
                                                    placeholder="입력"
                                                />
                                            </td>
                                            <td className="border border-gray-700 p-0">
                                                <input
                                                    type="text"
                                                    list={`technology-options-${projectId}`}
                                                    value={row.technology}
                                                    onChange={e => updateRow(row.id, 'technology', e.target.value)}
                                                    className="w-full h-full p-2 bg-transparent text-amber-100 outline-none focus:bg-gray-800 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                                                    placeholder="입력"
                                                />
                                            </td>
                                            <td className="border border-gray-700 p-0 text-center relative pointer-events-auto">
                                                <div className="flex h-full items-stretch justify-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => addSubToCore(row)}
                                                        disabled={!row.core.trim()}
                                                        className="w-9 py-2 text-xs text-blue-300 hover:bg-blue-500/10 disabled:text-gray-700 disabled:hover:bg-transparent transition-colors"
                                                        title="이 핵심기능에 세부기능 추가"
                                                    >
                                                        +S
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => addDetailToSub(row)}
                                                        disabled={!row.core.trim() || !row.sub.trim()}
                                                        className="w-9 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:text-gray-700 disabled:hover:bg-transparent transition-colors"
                                                        title="이 세부기능에 세세부기능 추가"
                                                    >
                                                        +D
                                                    </button>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteRow(row.id)}
                                                    className="w-9 py-2 text-transparent group-hover:text-red-500 hover:bg-red-500/10 transition-all font-bold"
                                                    title="행 삭제"
                                                >
                                                    ✕
                                                </button>
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )
            }

            <div className="flex justify-end mt-4">
                <button
                    onClick={() => handleSave(true)}
                    disabled={isSaving || rows.length === 0}
                    className="btn-primary text-sm flex items-center gap-2"
                >
                    저장하고 제품속성서로 이동
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
            </div>
        </div>
    );
}
