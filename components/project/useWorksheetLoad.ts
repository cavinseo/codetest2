'use client';
// 워크시트 표의 불러오기 상태(로딩·실패·재시도·어느 프로젝트 것인지)를 한곳에서 관리한다.
//
// 매출·목표스펙·향후목표고객·개선포인트·스펙 표가 같은 상태 네 개와 같은 effect(진행 중 표시 →
// 불러오기 → 실패 표시, 화면을 떠난 뒤 늦게 온 응답은 버림)를 각자 복사해 들고 있었다
// (2026-10-25 코드 리뷰 D1). 한쪽만 고치면 다른 표에서 같은 버그가 남으므로 합쳤다.
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * load 는 표의 데이터를 불러와 표 상태에 넣고, 실패하면 던진다. isActive() 가 false 면 이미
 * 다른 프로젝트로 넘어갔거나 화면을 떠난 것이므로 상태를 건드리지 말고 돌아가야 한다.
 */
export type WorksheetLoader = (isActive: () => boolean) => Promise<void>;

export function useWorksheetLoad(projectId: string, load: WorksheetLoader, onError?: (error: unknown) => void) {
    const [isLoading, setIsLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = useState(0);

    // 매 렌더 새로 만들어지는 함수를 effect 의존값에 넣으면 렌더마다 다시 불러온다. 최신 함수는
    // ref 로 들고, 다시 불러오는 계기는 프로젝트 변경과 재시도로만 둔다(합치기 전과 같다).
    const loadRef = useRef(load);
    const onErrorRef = useRef(onError);
    useEffect(() => {
        loadRef.current = load;
        onErrorRef.current = onError;
    });

    useEffect(() => {
        let active = true;
        const isActive = () => active;
        setIsLoading(true);
        setLoadFailed(false);
        loadRef.current(isActive)
            .then(() => { if (active) setLoadedProjectId(projectId); })
            .catch((error: unknown) => {
                if (!active) return;
                setLoadFailed(true);
                onErrorRef.current?.(error);
            })
            .finally(() => { if (active) setIsLoading(false); });
        return () => { active = false; };
    }, [projectId, loadAttempt]);

    const retry = useCallback(() => setLoadAttempt((attempt) => attempt + 1), []);

    return {
        isLoading,
        loadFailed,
        /** 이 프로젝트의 데이터를 다 불러와 편집·저장해도 되는 상태인가 */
        isReady: !isLoading && !loadFailed && loadedProjectId === projectId,
        retry,
    };
}
