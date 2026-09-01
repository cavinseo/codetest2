'use client';

// 저장하지 않은 변경이 있는 채로 창을 닫거나 뒤로 가면 브라우저가 되묻게 한다.
//
// 워크시트는 입력을 로컬 state 에만 담고 "저장" 클릭에만 영속화한다. 그래서 탭을
// 닫는 순간 그때까지 채운 표가 통째로 사라지는데, 아무 경고도 없었다.
//
// 붙이는 대상은 저장 버튼 계열 워크시트뿐이다. WS-7 Kano 가중치(onBlur 즉시 저장)와
// WS-9 QFD 관계 셀(클릭 즉시 POST)에 걸면, 저장이 이미 끝난 상태에서도 경고가 떠
// 오탐이 된다.
//
// 워크시트 사이의 탭 전환은 beforeunload 로 막을 수 없다. 라우터 이동이 아니라
// setActiveTab 에 의한 언마운트이기 때문이다. 그래서 dirty 여부를 탭 컨테이너에도
// 보고한다(UnsavedChangesProvider). Provider 가 없으면 창 닫기 경고만 걸린다.
import { useCallback, useEffect, useId, useRef } from 'react';
import { isDirty, snapshotOf } from './unsaved-changes';
import { useUnsavedChangesRegistry } from './unsaved-changes-context';

export function useUnsavedChanges<T>(value: T): { markClean: <V>(saved: V) => V } {
    const baseline = useRef<string | null>(null);
    const registry = useUnsavedChangesRegistry();
    const registryKey = useId();

    // 서버와 값을 맞춘 직후(로드 성공·저장 성공·초기화 성공) 부른다.
    //
    // 저장할 값을 인자로 받는 이유가 있다. 같은 시점에 setRows 도 부르는데 state 는
    // 아직 갱신 전이라, 훅이 스스로 현재 값을 읽으면 한 박자 늦은 값을 기준선으로
    // 굳힌다. 그러면 저장 직후인데도 dirty 로 남는다.
    //
    // 받은 값을 그대로 돌려주므로 setRows(markClean(next)) 로 감싸 쓸 수 있다.
    // 호출부에 임시 변수를 만들지 않아도 되고, 굳히는 값과 화면에 넣는 값이 반드시
    // 같아진다.
    const markClean = useCallback(<V,>(saved: V): V => {
        baseline.current = snapshotOf(saved);
        return saved;
    }, []);

    // 기준선이 ref 라 이 계산은 렌더 중에 한다. markClean 은 리렌더를 일으키지 않지만
    // 늘 setState 와 함께 불리므로, 그 리렌더에서 dirty 가 다시 계산된다.
    const dirty = isDirty(baseline.current, value);

    useEffect(() => {
        // 깨끗할 때는 리스너를 아예 걸지 않는다. beforeunload 가 등록돼 있는 것만으로
        // 일부 브라우저가 bfcache 를 포기하므로, 필요할 때만 붙인다.
        if (!dirty) return;

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            // 브라우저가 커스텀 문구를 무시한 지 오래다. preventDefault 만으로 표준
            // 확인창이 뜬다.
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [dirty]);

    // 탭 컨테이너에도 알린다. 정리 함수가 중요하다 — 탭을 옮기면 이 워크시트는
    // 언마운트되는데, 그때 dirty 로 남아 있으면 다음 이동까지 경고가 따라다닌다.
    useEffect(() => {
        if (!registry) return;
        registry.setDirty(registryKey, dirty);
        return () => registry.setDirty(registryKey, false);
    }, [registry, registryKey, dirty]);

    return { markClean };
}
