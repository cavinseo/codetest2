// QFD 관계 강도의 즉시 반영과 순차 저장, 분석 결과 갱신을 관리한다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface Relationship {
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

interface Analysis {
    requirements?: RequirementAnalysis[];
    technicals?: TechnicalAnalysis[];
}

type Draft = Relationship & { version: number; status: 'pending' | 'saved' | 'error'; savedVersion?: number };

function relationshipKey(item: Pick<Relationship, 'requirementId' | 'technicalCharId'>) {
    return `${item.requirementId}::${item.technicalCharId}`;
}

function createSession(projectId: string) {
    return {
        projectId,
        active: true,
        version: 0,
        savedVersion: 0,
        readVersion: 0,
        processing: false,
        drafts: new Map<string, Draft>(),
        queue: new Map<string, Draft>(),
        analysisTimer: null as ReturnType<typeof setTimeout> | null,
    };
}

export function useQfdRelationshipAutosave(projectId: string, onDirtyChange?: (dirty: boolean) => void) {
    const session = useMemo(() => createSession(projectId), [projectId]);
    const dirtyChangeCallback = useRef(onDirtyChange);
    const [relationships, setRelationships] = useState<Relationship[]>([]);
    const [reqAnalysis, setReqAnalysis] = useState<RequirementAnalysis[]>([]);
    const [techAnalysis, setTechAnalysis] = useState<TechnicalAnalysis[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [failedRelationships, setFailedRelationships] = useState<Relationship[]>([]);
    const [analysisError, setAnalysisError] = useState(false);
    const [isRefreshingAnalysis, setIsRefreshingAnalysis] = useState(false);

    useEffect(() => {
        session.active = true;
        setRelationships([]);
        setReqAnalysis([]);
        setTechAnalysis([]);
        setPendingCount(0);
        setFailedRelationships([]);
        setAnalysisError(false);
        setIsRefreshingAnalysis(false);
        return () => {
            session.active = false;
            session.readVersion += 1;
            session.queue.clear();
            if (session.analysisTimer) clearTimeout(session.analysisTimer);
        };
    }, [session]);

    const hasUnsavedRelationships = useCallback(() => session.processing ||
        Array.from(session.drafts.values()).some((draft) => draft.status !== 'saved'), [session]);

    useEffect(() => {
        dirtyChangeCallback.current = onDirtyChange;
        onDirtyChange?.(hasUnsavedRelationships());
        return () => { onDirtyChange?.(false); };
    }, [hasUnsavedRelationships, onDirtyChange]);

    const publishSaveState = useCallback(() => {
        if (!session.active) return;
        const drafts = Array.from(session.drafts.values());
        setPendingCount(drafts.filter((draft) => draft.status === 'pending').length);
        setFailedRelationships(drafts.filter((draft) => draft.status === 'error'));
        dirtyChangeCallback.current?.(hasUnsavedRelationships());
    }, [hasUnsavedRelationships, session]);

    const refreshAnalysis = useCallback(async () => {
        if (!session.active || session.processing || session.queue.size > 0) return;
        if (session.analysisTimer) clearTimeout(session.analysisTimer);
        session.analysisTimer = null;
        const version = session.version;
        const readVersion = ++session.readVersion;
        const isCurrent = () => session.active && version === session.version && readVersion === session.readVersion;
        setIsRefreshingAnalysis(true);
        try {
            const response = await fetch(`/api/projects/${session.projectId}/qfd/analysis`);
            if (!response.ok) throw new Error('분석 갱신 실패');
            const data: Analysis = await response.json();
            if (!isCurrent()) return;
            setReqAnalysis(data.requirements || []);
            setTechAnalysis(data.technicals || []);
            setAnalysisError(false);
        } catch {
            if (isCurrent()) setAnalysisError(true);
        } finally {
            if (isCurrent()) setIsRefreshingAnalysis(false);
        }
    }, [session]);

    const drainQueue = useCallback(async () => {
        if (session.processing || !session.active) return;
        session.processing = true;
        while (session.active && session.queue.size > 0) {
            const [key, draft] = session.queue.entries().next().value!;
            session.queue.delete(key);
            let saved = false;
            try {
                const response = await fetch(`/api/projects/${session.projectId}/qfd/relationships`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requirementId: draft.requirementId,
                        technicalCharId: draft.technicalCharId,
                        strength: draft.strength,
                    }),
                });
                saved = response.ok;
            } catch {
                saved = false;
            }
            if (!session.active) return;
            if (saved) session.savedVersion += 1;
            // 앞선 요청의 성공·실패가 같은 셀에 나중에 고른 값을 덮지 않게 한다.
            if (session.drafts.get(key)?.version === draft.version) {
                session.drafts.set(key, { ...draft, status: saved ? 'saved' : 'error', savedVersion: saved ? session.savedVersion : undefined });
            }
            publishSaveState();
        }
        session.processing = false;
        if (session.active) {
            publishSaveState();
            session.analysisTimer = setTimeout(() => { void refreshAnalysis(); }, 150);
        }
    }, [publishSaveState, refreshAnalysis, session]);

    const setRelationshipVal = useCallback((requirementId: string, technicalCharId: string, strength: Relationship['strength']) => {
        if (!session.active) return;
        if (session.analysisTimer) clearTimeout(session.analysisTimer);
        session.analysisTimer = null;
        session.readVersion += 1;
        setIsRefreshingAnalysis(false);
        const draft: Draft = { requirementId, technicalCharId, strength, version: ++session.version, status: 'pending' };
        const key = relationshipKey(draft);
        session.drafts.set(key, draft);
        session.queue.set(key, draft);
        setRelationships((items) => {
            const next = items.filter((item) => relationshipKey(item) !== key);
            return [...next, { requirementId, technicalCharId, strength }];
        });
        publishSaveState();
        void drainQueue();
    }, [drainQueue, publishSaveState, session]);

    const retryRelationship = useCallback((requirementId: string, technicalCharId: string) => {
        const draft = session.drafts.get(relationshipKey({ requirementId, technicalCharId }));
        if (draft?.status === 'error') setRelationshipVal(requirementId, technicalCharId, draft.strength);
    }, [session, setRelationshipVal]);

    const retryFailedRelationships = useCallback(() => {
        for (const draft of Array.from(session.drafts.values())) {
            if (draft.status === 'error') retryRelationship(draft.requirementId, draft.technicalCharId);
        }
    }, [retryRelationship, session]);

    const captureSnapshot = useCallback(() => {
        if (session.active) setIsRefreshingAnalysis(false);
        return { session, version: session.version, savedVersion: session.savedVersion, readVersion: ++session.readVersion, pending: session.processing };
    }, [session]);

    type Snapshot = ReturnType<typeof captureSnapshot>;
    const isCurrentSnapshot = useCallback((snapshot: Snapshot) => snapshot.session === session && session.active, [session]);

    const applyServerData = useCallback((snapshot: Snapshot, serverRelationships: Relationship[], analysis: Analysis) => {
        if (!isCurrentSnapshot(snapshot)) return;
        const merged = new Map(serverRelationships.map((item) => [relationshipKey(item), item]));
        // 다른 필드 저장·새로고침의 응답에도 저장 중이거나 실패한 셀의 초안을 유지한다.
        // 성공한 값은 저장 완료 뒤 시작한 조회부터 서버 값을 받아들인다.
        for (const [key, draft] of session.drafts) {
            if (draft.status === 'saved' && draft.savedVersion! <= snapshot.savedVersion) {
                session.drafts.delete(key);
            } else {
                merged.set(key, { requirementId: draft.requirementId, technicalCharId: draft.technicalCharId, strength: draft.strength });
            }
        }
        setRelationships(Array.from(merged.values()));
        if (!snapshot.pending && snapshot.version === session.version && snapshot.readVersion === session.readVersion) {
            setReqAnalysis(analysis.requirements || []);
            setTechAnalysis(analysis.technicals || []);
            setAnalysisError(false);
        }
    }, [isCurrentSnapshot, session]);

    const clearSavedRelationships = useCallback((technicalCharId?: string) => {
        if (!session.active || hasUnsavedRelationships()) return;
        session.version += 1;
        session.readVersion += 1;
        for (const [key, draft] of session.drafts) {
            if (!technicalCharId || draft.technicalCharId === technicalCharId) session.drafts.delete(key);
        }
        setRelationships((items) => technicalCharId ? items.filter((item) => item.technicalCharId !== technicalCharId) : []);
    }, [hasUnsavedRelationships, session]);

    return {
        relationships, reqAnalysis, techAnalysis, pendingCount, failedRelationships, analysisError, isRefreshingAnalysis,
        setRelationshipVal, retryRelationship, retryFailedRelationships, refreshAnalysis,
        captureSnapshot, isCurrentSnapshot, applyServerData, clearSavedRelationships, hasUnsavedRelationships,
    };
}
