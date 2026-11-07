'use client';
// 워크시트 표가 저장하지 않은 편집을 들고 있는지 판정하고, 그 상태로 떠나려 하면 묻는다.
//
// 탭을 바꾸면 표가 언마운트되는데 QFD·멘토 분석 말고는 편집 여부를 알리지 않아, 표 열몇
// 칸을 고친 뒤 다른 탭을 누르면 경고 없이 모두 사라졌다(2026-11-08 코드 리뷰 1번). 표마다
// 저장 여부 플래그를 손으로 관리하면 빠뜨리는 경로(행 추가·삭제·붙여넣기)가 생기므로, 마지막으로
// 불러오거나 저장한 상태의 스냅숏과 지금 상태를 비교한다.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { useLeaveGuard } from './useLeaveGuard';

export const UNSAVED_WORKSHEET_MESSAGE = '저장하지 않은 워크시트 변경이 있습니다. 저장하지 않고 이동할까요?';

/**
 * 프로젝트 화면이 탭을 바꾸기 전에 물을 수 있도록 표가 편집 상태를 알리는 통로. 한 탭 안에 표가
 * 둘 이상일 수 있어(Kano 질문지 안의 가중치 표) 표마다 reporterId 로 따로 알린다. 하나의
 * 불리언을 함께 쓰면 나중에 뜬 표의 false 가 앞 표의 미저장 상태를 지운다.
 */
export const WorksheetDirtyContext = createContext<((reporterId: string, dirty: boolean) => void) | null>(null);

/**
 * value 는 저장 대상이 되는 표 상태 전체, ready 는 이 프로젝트의 데이터를 다 불러왔는지다.
 * 불러오기가 끝난 순간과 markSaved() 뒤 첫 렌더의 value 를 기준으로 삼는다. 저장 응답으로
 * 상태를 다시 채우는 표는 그 setState 들과 같은 흐름에서 markSaved() 를 불러야 정규화된 값이
 * 기준이 된다. 저장 뒤 다시 불러오는 표는 ready 가 잠시 false 가 되므로 그때 기준을 새로 잡는다.
 */
export function useUnsavedWorksheet(value: unknown, ready: boolean) {
    const snapshot = ready ? JSON.stringify(value) : null;
    const [baseline, setBaseline] = useState<string | null>(null);
    const [rebaseRequest, setRebaseRequest] = useState(0);
    const rebasePending = useRef(true);

    useEffect(() => {
        if (snapshot === null) {
            rebasePending.current = true;
            return;
        }
        if (!rebasePending.current) return;
        rebasePending.current = false;
        setBaseline(snapshot);
    }, [snapshot, rebaseRequest]);

    const reporterId = useId();
    const reportDirty = useContext(WorksheetDirtyContext);

    const markSaved = useCallback(() => {
        rebasePending.current = true;
        setRebaseRequest(request => request + 1);
        // 기준은 다음 렌더의 effect 에서 바뀐다. 저장 직후 바로 다음 탭으로 넘기는 표가 그 사이에
        // 미저장 경고를 받지 않도록 화면에는 지금 바로 알린다.
        reportDirty?.(reporterId, false);
    }, [reportDirty, reporterId]);

    const isDirty = snapshot !== null && baseline !== null && snapshot !== baseline;

    useEffect(() => { reportDirty?.(reporterId, isDirty); }, [isDirty, reportDirty, reporterId]);
    useEffect(() => () => { reportDirty?.(reporterId, false); }, [reportDirty, reporterId]);

    // 탭 안에서도, 단독 워크시트 페이지에서도 새로고침·창 닫기·링크·뒤로 가기를 막는다.
    useLeaveGuard({ enabled: isDirty, message: UNSAVED_WORKSHEET_MESSAGE });

    return { isDirty, markSaved };
}
