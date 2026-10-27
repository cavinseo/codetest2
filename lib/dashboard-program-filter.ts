// 대시보드에서 고른 프로그램을 로그아웃할 때까지 기억한다. 프로젝트에 들어갔다 나오거나
// 새로고침할 때마다 "전체"로 돌아가, 여러 프로그램을 보는 회원이 매번 다시 골라야 했다.
//
// 탭을 닫아도 로그인은 유지되므로 sessionStorage 가 아니라 localStorage 에 둔다. 대신 같은
// 브라우저를 다음 사람이 쓸 수 있어 로그아웃할 때와 새로 로그인할 때 지운다 — 로그아웃 없이
// 세션이 만료된 뒤 다른 계정으로 들어와도 앞 사람의 선택이 남지 않는다.
// 사생활 보호 모드 등에서 저장소 접근이 막히면 기억만 못 할 뿐 화면은 그대로 쓴다.
const STORAGE_KEY = 'dashboard-selected-program';

export function readSelectedProgramId(): string {
    try {
        return window.localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
        return '';
    }
}

export function saveSelectedProgramId(programId: string) {
    try {
        if (programId) window.localStorage.setItem(STORAGE_KEY, programId);
        else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // 저장하지 못하면 이번 화면에서만 유지된다.
    }
}

export function clearSelectedProgramId() {
    saveSelectedProgramId('');
}
