// 관리자 화면의 삭제 확인 단계를 정하는 규칙.
//
// 프로젝트 삭제는 되돌릴 수 없고 schema.prisma 의 onDelete: Cascade 를 타고
// 하위 22개 모델(요구사항·QFD 행렬·Kano 응답·설문 초대·멤버)을 함께 지운다.
// 그래서 확인을 두 번 받는다. 이 규칙이 버튼 onClick 안에 묻혀 있으면
// "한 번만 물어보고 지우는" 회귀가 조용히 들어올 수 있어 밖으로 뺐다.
//
// 사용자 삭제는 서버가 409(needsCascadeConfirm)로 되물어보는 자체 2단계가
// 있으므로 여기서 또 막지 않는다. 두 번 묻는 자리가 갈리면 어느 쪽이
// 진짜 마지막인지 알 수 없게 된다.

/** 확인창이 지금 어느 단계인가. 1 = 무엇을 지우는지, 2 = 정말 지울 것인지. */
export type DeleteStage = 1 | 2;

export type DeleteTargetType = 'user' | 'project';

export interface DeleteConfirmState {
    type: DeleteTargetType;
    stage: DeleteStage;
}

/**
 * 확인창의 삭제 버튼을 눌렀을 때 무엇을 할지.
 *
 * - `advance`  : 한 단계 더 확인받는다(아직 지우지 않는다)
 * - `delete`   : 실제로 삭제를 실행한다
 */
export type DeleteAction = 'advance' | 'delete';

export function deleteActionFor(state: DeleteConfirmState): DeleteAction {
    // 사용자는 단계를 늘리지 않는다. 서버 409 가 두 번째 확인을 맡는다.
    if (state.type === 'user') return 'delete';
    // 프로젝트는 1단계에서 절대 지우지 않는다.
    return state.stage === 1 ? 'advance' : 'delete';
}

/** 확인창을 몇 단계까지 거치는가. 화면이 버튼 문구를 고를 때도 쓴다. */
export function totalDeleteStages(type: DeleteTargetType): number {
    return type === 'project' ? 2 : 1;
}

/** 취소 버튼이 창을 닫아야 하는가, 앞 단계로 돌아가야 하는가. */
export function cancelGoesBack(state: DeleteConfirmState): boolean {
    return state.stage === 2;
}
