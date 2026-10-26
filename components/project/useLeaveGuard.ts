'use client';
// 저장하지 않은 변경이 있을 때 페이지를 떠나는 세 경로(새로고침·창 닫기, 링크 클릭, 뒤로 가기)를 막는다.
//
// QFD 관계 강도 표와 멘토 분석이 같은 리스너 세 개를 각자 복사해 들고 있었다(2026-10-25 코드
// 리뷰 D6). 링크 판정(새 탭·다운로드·보조키 클릭은 통과)을 한쪽만 고치면 다른 쪽이 어긋난다.
import { useEffect, useRef } from 'react';

export interface LeaveGuardOptions {
    /** false 면 리스너를 걸지 않는다. 변경이 생길 때만 거는 화면은 dirty 를 그대로 넘긴다. */
    enabled: boolean;
    /** 떠나려는 순간 아직 저장 안 된 것이 있는지. 없으면 enabled 만으로 판단한다. */
    isDirty?: () => boolean;
    /** 링크·뒤로 가기에서 묻는 확인 문구 */
    message: string;
    /**
     * 뒤로 가기를 어떻게 물을지. true 를 돌려주면 그대로 떠나고, false 면 막고 주소를 되돌린다.
     * 생략하면 window.confirm(message) 로 묻는다. 대화상자로 묻는 화면은 여기서 대화상자를 연다.
     */
    confirmBack?: () => boolean;
}

export function useLeaveGuard({ enabled, isDirty, message, confirmBack }: LeaveGuardOptions) {
    // 문구·확인 함수는 렌더마다 새로 만들어져도 리스너를 다시 걸 이유가 아니다. 다시 걸면
    // 되돌아갈 주소(currentUrl)가 그 순간으로 바뀌므로, 거는 계기는 enabled·isDirty 로만 둔다.
    const messageRef = useRef(message);
    const confirmBackRef = useRef(confirmBack);
    useEffect(() => {
        messageRef.current = message;
        confirmBackRef.current = confirmBack;
    });

    useEffect(() => {
        if (!enabled) return;
        const currentUrl = window.location.href;
        const currentHistory = window.history.state;
        const hasChanges = () => (isDirty ? isDirty() : true);
        const warn = (event: BeforeUnloadEvent) => {
            if (hasChanges()) event.preventDefault();
        };
        const guardLink = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
            if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download') || link.target === '_blank' || link.href === window.location.href) return;
            if (!hasChanges() || window.confirm(messageRef.current)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        const guardBack = (event: PopStateEvent) => {
            if (!hasChanges()) return;
            const leave = confirmBackRef.current ? confirmBackRef.current() : window.confirm(messageRef.current);
            if (leave) return;
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
    }, [enabled, isDirty]);
}
