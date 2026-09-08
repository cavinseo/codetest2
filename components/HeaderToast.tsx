'use client';
// 저장·오류 알림을 헤더의 "팀원 초대" 버튼 왼편에 띄우는 공용 토스트다.
//
// 예전에는 화면 13곳이 각자 토스트를 그리며 뷰포트 구석에 fixed 로 띄웠다.
// 우상단은 헤더 버튼을 가렸고, 우하단으로 내리니 이번에는 눈에 띄지 않았다.
// 헤더 안에 자리를 하나 두고 portal 로 거기에 그리면 버튼과 같은 flex 흐름에
// 놓여 겹치지 않으면서 gap 만큼 떨어진 채 시선이 가는 곳에 남는다.
// 그 자리가 없는 화면(독립 워크시트 페이지 등)에서는 예전처럼 구석에 띄운다.
import { useState } from 'react';
import { createPortal } from 'react-dom';

export type ToastType = 'success' | 'error' | 'info';

/** 헤더가 토스트를 받아 주는 자리의 id. 헤더 쪽과 이 파일이 같은 값을 봐야 한다. */
export const HEADER_TOAST_SLOT_ID = 'header-toast-slot';

const ICON_PATHS: Record<ToastType, string> = {
    success: 'M5 13l4 4L19 7',
    error: 'M6 18L18 6M6 6l12 12',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

interface HeaderToastProps {
    message: string;
    type?: ToastType;
}

export default function HeaderToast({ message, type = 'success' }: HeaderToastProps) {
    // 첫 렌더에서 바로 자리를 찾는다. useEffect 로 미루면 한 프레임 동안
    // 구석에 떴다가 헤더로 옮겨 가는 것이 눈에 보인다.
    const [slot] = useState<HTMLElement | null>(() => (
        typeof document === 'undefined' ? null : document.getElementById(HEADER_TOAST_SLOT_ID)
    ));

    // 색은 toast-* 클래스가 정한다. 유틸리티 클래스로 주면 라이트 모드의 포괄
    // 규칙이 글자색만 어둡게 덮어써 어두운 초록 바탕에 어두운 초록 글자가 된다.
    const body = (
        <div
            role="status"
            aria-live="polite"
            className={`toast toast-${type} flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold animate-fade-in ${slot ? 'max-w-[420px]' : 'fixed bottom-6 right-6 z-[100] shadow-2xl'}`}
        >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_PATHS[type]} />
            </svg>
            <span className="truncate">{message}</span>
        </div>
    );

    return slot ? createPortal(body, slot) : body;
}
