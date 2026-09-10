'use client';
// 화면들이 공유하는 토스트 상태다. 표시는 HeaderToast 가 맡고 여기서는 상태만 다룬다.
//
// 예전에는 13개 화면이 useState·타이머 ref·showToast 세 벌을 각자 복붙해 두고 있었다.
// 같은 개념인데 시그니처가 여섯 갈래로 갈렸고(인자 이름과 타입 순서까지 달랐다),
// 무엇보다 열세 곳 모두 언마운트 정리를 빠뜨리고 있었다. 한 곳으로 모아야
// 그 정리를 한 번만 제대로 해 둘 수 있다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastType } from './HeaderToast';

/** 워크시트 대부분이 쓰는 표시 시간. Kano 화면만 조금 길게 쓴다. */
const DEFAULT_DURATION_MS = 3000;

export interface ToastState {
    message: string;
    type: ToastType;
}

export function useToast(durationMs: number = DEFAULT_DURATION_MS) {
    const [toast, setToast] = useState<ToastState | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 워크시트 탭을 옮기면 이 컴포넌트들은 언마운트된다. 저장 직후 표시 시간이
    // 지나기 전에 탭을 바꾸면 사라진 컴포넌트에 setState 가 걸리므로 여기서 끊는다.
    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    // 의존성 배열에 넣는 호출부가 생겨도 매 렌더마다 참조가 바뀌지 않게 한다.
    const showToast = useCallback((message: string, type: ToastType = 'success') => {
        if (timer.current) clearTimeout(timer.current);
        setToast({ message, type });
        timer.current = setTimeout(() => setToast(null), durationMs);
    }, [durationMs]);

    return { toast, showToast };
}
