'use client';

// 워크시트가 자기 dirty 상태를 탭 컨테이너에 알리는 통로.
//
// beforeunload 로는 탭 전환을 막을 수 없다(라우터 이동이 아니라 언마운트다). 막으려면
// 탭을 쥐고 있는 쪽이 "지금 열린 워크시트가 저장 안 된 상태인가"를 알아야 하는데,
// 워크시트 12개에 props 를 뚫어 내리는 대신 컨텍스트 하나로 받는다.
//
// Provider 가 없어도 동작해야 한다. 워크시트는 프로젝트 페이지 밖(테스트, 다른 화면)
// 에서도 쓰일 수 있고, 그때는 창 닫기 경고만 걸리면 된다.
import { createContext, useContext } from 'react';

export interface UnsavedChangesRegistry {
    /** 워크시트가 자기 dirty 여부를 보고한다. 언마운트 시 false 로 정리해야 한다. */
    setDirty: (key: string, dirty: boolean) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesRegistry | null>(null);

export const UnsavedChangesProvider = UnsavedChangesContext.Provider;

/** Provider 가 없으면 null 이다. 호출부는 그 경우를 그냥 건너뛴다. */
export function useUnsavedChangesRegistry(): UnsavedChangesRegistry | null {
    return useContext(UnsavedChangesContext);
}
