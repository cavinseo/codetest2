'use client';

// QFD 표 아래쪽에서 직접 고쳐 쓰는 칸(측정단위·설계 목표치·자사/경쟁사 실측값)의 초안과 저장.
// QFDMatrix 한 파일에 1400줄이 몰려 있어 이 칸들의 초안 규칙(B21)을 찾기 어려웠다
// (2026-10-25 코드 리뷰 L2). 불러온 데이터는 화면이 들고, 이 훅은 입력 중인 값만 맡는다.
import { useEffect, useRef, useState } from 'react';
import type { ToastType } from '@/components/HeaderToast';

/** 표 아래쪽에서 직접 고쳐 쓰는 기술특성 칸. 둘 다 TechnicalCharacteristic 의 열이다. */
export type TechnicalTextField = 'unit' | 'targetValue';

export const TECHNICAL_FIELD_LABELS: Record<TechnicalTextField, string> = {
    unit: '측정단위',
    targetValue: '설계 목표치',
};

type DraftTechnical = { id: string; name: string; unit?: string | null; targetValue?: string | null };
type DraftTechnicalBenchmark = { technicalCharId: string; company: string; value: string };
type ShowToast = (message: string, type?: ToastType) => void;

/** 워크시트 저장이 보낼 요청 하나. 경로는 `/api/projects/:id/qfd/` 뒤쪽이다. */
export type WorksheetDraftSave = { path: string; method: string; body: object };

// 측정단위·설계 목표치는 입력 중에는 초안으로 들고 있다가 포커스를 뗄 때 한 번만
// 저장한다. 글자마다 PATCH 를 보내면 요청이 타자 수만큼 늘고 순서가 뒤집힐 수 있다.
const techFieldKey = (techId: string, field: TechnicalTextField) => `${techId}:${field}`;
// 자사·경쟁사 줄도 같은 초안·blur 방식을 쓴다. 열쇠에 회사명이 더 붙을 뿐이다.
const techBenchmarkKey = (techId: string, company: string) => `bench:${techId}:${company}`;

const savedFieldValue = (tech: DraftTechnical, field: TechnicalTextField) =>
    (field === 'unit' ? tech.unit : tech.targetValue) || '';

function withoutKey(drafts: Record<string, string>, key: string) {
    const next = { ...drafts };
    delete next[key];
    return next;
}

export function useQfdTechnicalDrafts(params: {
    projectId: string;
    technicalBenchmarks: DraftTechnicalBenchmark[];
    loadData: () => Promise<void>;
    showToast: ShowToast;
}) {
    const { projectId, technicalBenchmarks, loadData, showToast } = params;
    const [techFieldDrafts, setTechFieldDrafts] = useState<Record<string, string>>({});
    // 저장 요청을 보냈지만 아직 화면 데이터(tech)에 반영되지 않은 값. 측정단위를 고치고 바로
    // 목표치를 고치면, 목표치 요청이 아직 옛 단위를 담은 tech 로 단위를 덮어써 되돌렸다(B21).
    const pendingTechValues = useRef<Record<string, string>>({});

    useEffect(() => {
        setTechFieldDrafts({});
    }, [projectId]);

    const savedBenchmarkValue = (techId: string, company: string) =>
        technicalBenchmarks.find((item) => item.technicalCharId === techId && item.company === company)?.value || '';

    const getTechFieldValue = (tech: DraftTechnical, field: TechnicalTextField) => {
        const key = techFieldKey(tech.id, field);
        if (key in techFieldDrafts) return techFieldDrafts[key];
        return savedFieldValue(tech, field);
    };

    const setTechFieldDraft = (techId: string, field: TechnicalTextField, value: string) =>
        setTechFieldDrafts((drafts) => ({ ...drafts, [techFieldKey(techId, field)]: value }));

    // 같은 기술특성의 다른 칸 값. 보내 놓고 아직 반영되지 않은 값이 있으면 그것이 최신이다.
    const latestTechFieldValue = (tech: DraftTechnical, field: TechnicalTextField) => {
        const pending = pendingTechValues.current[techFieldKey(tech.id, field)];
        return pending ?? savedFieldValue(tech, field);
    };

    const commitTechField = async (tech: DraftTechnical, field: TechnicalTextField) => {
        const key = techFieldKey(tech.id, field);
        if (!(key in techFieldDrafts)) return;

        const nextValue = techFieldDrafts[key].trim();
        const currentValue = latestTechFieldValue(tech, field).trim();

        // 초안을 먼저 지운다. 남겨 두면 저장 뒤 서버가 돌려준 값 대신 초안이 계속 보인다.
        setTechFieldDrafts((drafts) => withoutKey(drafts, key));

        if (nextValue === currentValue) return;

        pendingTechValues.current[key] = nextValue;
        // 저장이 실패하면 입력한 값을 칸에 되돌려 놓는다. 초안을 이미 지웠기 때문에 그대로 두면
        // 사용자가 친 값이 사라지고 옛 값만 남았다(B21). 그사이 새로 친 초안이 있으면 그것을 둔다.
        const restoreDraft = () => {
            if (pendingTechValues.current[key] === nextValue) delete pendingTechValues.current[key];
            setTechFieldDrafts((drafts) => (key in drafts ? drafts : { ...drafts, [key]: nextValue }));
        };

        let res: Response;
        try {
            res = await fetch(`/api/projects/${projectId}/qfd/technical`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: tech.id,
                    name: tech.name,
                    unit: field === 'unit' ? nextValue : latestTechFieldValue(tech, 'unit'),
                    targetValue: field === 'targetValue' ? nextValue : latestTechFieldValue(tech, 'targetValue'),
                }),
            });
        } catch {
            restoreDraft();
            showToast(`${TECHNICAL_FIELD_LABELS[field]}을(를) 저장하지 못했습니다. 연결을 확인하세요.`, 'error');
            return;
        }

        if (!res.ok) {
            restoreDraft();
            const errorData = await res.json().catch(() => null);
            showToast(errorData?.error || `${TECHNICAL_FIELD_LABELS[field]}을(를) 저장하지 못했습니다.`, 'error');
            return;
        }

        await loadData();
        // 다시 불러온 tech 가 이 값을 담았으니 보류 값을 치운다. 그사이 더 새 값을 보냈으면 둔다.
        if (pendingTechValues.current[key] === nextValue) delete pendingTechValues.current[key];
        showToast(`${TECHNICAL_FIELD_LABELS[field]}을(를) 저장했습니다.`);
    };

    const getTechBenchmarkValue = (tech: DraftTechnical, company: string) => {
        const key = techBenchmarkKey(tech.id, company);
        if (key in techFieldDrafts) return techFieldDrafts[key];
        return savedBenchmarkValue(tech.id, company);
    };

    const setTechBenchmarkDraft = (techId: string, company: string, value: string) =>
        setTechFieldDrafts((drafts) => ({ ...drafts, [techBenchmarkKey(techId, company)]: value }));

    const commitTechBenchmark = async (tech: DraftTechnical, company: string, label: string) => {
        const key = techBenchmarkKey(tech.id, company);
        if (!(key in techFieldDrafts)) return;

        const nextValue = techFieldDrafts[key].trim();
        const currentValue = savedBenchmarkValue(tech.id, company).trim();

        setTechFieldDrafts((drafts) => withoutKey(drafts, key));

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

    /** 워크시트 저장이 보낼, 아직 저장하지 않은 초안의 요청들. 기술특성 순서대로 보낸다. */
    const worksheetDraftSaves = (technicals: DraftTechnical[], companies: string[]): WorksheetDraftSave[] =>
        technicals.flatMap((tech) => {
            const saves: WorksheetDraftSave[] = [];
            if (techFieldKey(tech.id, 'unit') in techFieldDrafts || techFieldKey(tech.id, 'targetValue') in techFieldDrafts) {
                saves.push({
                    path: 'technical',
                    method: 'PATCH',
                    body: {
                        id: tech.id,
                        name: tech.name,
                        unit: getTechFieldValue(tech, 'unit').trim(),
                        targetValue: getTechFieldValue(tech, 'targetValue').trim(),
                    },
                });
            }
            for (const company of companies) {
                if (techBenchmarkKey(tech.id, company) in techFieldDrafts) {
                    saves.push({
                        path: 'technical-benchmarks',
                        method: 'POST',
                        body: { technicalCharId: tech.id, company, value: getTechBenchmarkValue(tech, company).trim() },
                    });
                }
            }
            return saves;
        });

    const clearTechDrafts = () => setTechFieldDrafts({});

    /** 지운 기술특성의 초안을 버린다. 남겨 두면 워크시트 저장이 없는 열을 다시 보낸다. */
    const forgetTechDrafts = (deletedIds: string[]) =>
        setTechFieldDrafts((drafts) => Object.fromEntries(Object.entries(drafts).filter(([key]) =>
            !deletedIds.some((id) => key.startsWith(id + ':') || key.startsWith('bench:' + id + ':')))));

    return {
        getTechFieldValue, setTechFieldDraft, commitTechField,
        getTechBenchmarkValue, setTechBenchmarkDraft, commitTechBenchmark,
        worksheetDraftSaves, clearTechDrafts, forgetTechDrafts,
    };
}
