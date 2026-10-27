'use client';
// 관리자 화면의 회원·프로젝트 삭제 확인 창.
//
// 프로젝트 삭제는 되돌릴 수 없고 하위 22개 모델을 함께 지운다. 그래서 확인을 두 번 받는다.
// stage 1 은 "무엇을 지우는지", stage 2 는 "정말 지울 것인지"다. 회원 삭제는 서버가 409 로
// 되물어보는 자체 2단계가 있어 stage 1 에서 요청을 보낸다. 멘티는 그 409 에 사전 점검 결과가
// 실려 오고, 이 창이 그것을 stage 2 에 담아 사유까지 받는다.
//
// 관리자 화면(app/admin/page.tsx)에 140줄 가까이 들어 있던 것을 떼어 냈다(2026-10-25 코드
// 리뷰 L4). 확인 단계의 상태는 화면이 들고, 이 창은 그리기와 단계 넘기기만 한다.
import { deleteActionFor, cancelGoesBack, type DeleteStage } from '@/lib/delete-confirmation';
import {
    DELETION_REASONS, DELETION_REASON_LABELS, describeMenteeDeletion,
    type DeletionReason, type MenteeDeletionPreview,
} from '@/lib/account-deletion';

export interface DeleteConfirmState {
    type: 'user' | 'project';
    id: string;
    name: string;
    stage: DeleteStage;
    preview?: MenteeDeletionPreview;
    reason?: DeletionReason;
    cascadeWarning?: string;
    error?: string;
}

export interface DeleteUserOptions {
    confirmCascade?: boolean;
    reason?: DeletionReason;
    previewToken?: string;
}

interface Props {
    confirmDelete: DeleteConfirmState | null;
    onChange: (next: DeleteConfirmState | null) => void;
    isDeleting: boolean;
    /** 프로젝트 삭제의 마지막 확인에 "무엇이 몇 개 사라지는지" 보여 줄 숫자 */
    targetProject: { reqCount: number; responseCount: number; memberCount: number } | null;
    onDeleteUser: (userId: string, options: DeleteUserOptions) => void;
    onDeleteProject: (projectId: string) => void;
}

export default function DeleteConfirmDialog({ confirmDelete, onChange, isDeleting, targetProject, onDeleteUser, onDeleteProject }: Props) {
    if (!confirmDelete) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div role="dialog" aria-modal="true" aria-labelledby="admin-delete-title" className="card max-w-sm w-full mx-4 max-h-[90vh] overflow-y-auto border-rose-500/20">
                <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 id="admin-delete-title" className="text-lg font-bold text-white mb-2">
                    {confirmDelete.stage === 2
                        ? '마지막 확인'
                        : confirmDelete.type === 'user' ? '사용자 삭제' : '프로젝트 삭제'}
                </h3>

                {confirmDelete.stage === 2 ? (
                    <>
                        <p className="text-sm text-gray-400 mb-3">
                            <span className="text-white font-medium">&quot;{confirmDelete.name}&quot;</span>을(를)
                            정말 삭제합니까? 이 작업은 <span className="text-rose-300 font-medium">되돌릴 수 없습니다.</span>
                        </p>
                        {targetProject && (
                            <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 mb-4">
                                <p className="text-[11px] text-rose-300/80 mb-2">함께 삭제되는 데이터</p>
                                <ul className="space-y-1 text-xs text-gray-300">
                                    <li>요구사항 {targetProject.reqCount}개</li>
                                    <li>Kano 응답 {targetProject.responseCount}개</li>
                                    <li>참여 멤버 {targetProject.memberCount}명의 접근 권한</li>
                                    <li>QFD 행렬·기술특성·설문 초대 전체</li>
                                </ul>
                            </div>
                        )}

                        {confirmDelete.cascadeWarning && !confirmDelete.preview && (
                            <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 mb-4 text-sm text-amber-300">
                                {confirmDelete.cascadeWarning}
                            </p>
                        )}

                        {confirmDelete.preview && (
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 mb-4">
                                <p className="text-[11px] text-amber-300/80 mb-2">삭제하면 이렇게 됩니다</p>
                                <ul className="space-y-1 text-xs text-gray-300">
                                    {describeMenteeDeletion(confirmDelete.preview).map((line) => (
                                        <li key={line}>{line}</li>
                                    ))}
                                    <li>이름·연락처·소속 등 개인정보는 파기됩니다.</li>
                                    <li>재가입해도 이전 프로젝트는 돌아오지 않습니다.</li>
                                </ul>
                                <p className="text-[11px] text-gray-500 mt-2">
                                    접근만 막으려면 삭제 대신 승인 취소를 쓰세요.
                                </p>
                            </div>
                        )}

                        {confirmDelete.preview && (
                            <div className="mb-4">
                                <p className="text-[11px] text-gray-400 mb-2">삭제 사유</p>
                                <div className="space-y-1.5">
                                    {DELETION_REASONS.map((reason) => (
                                        <label key={reason} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="deletion-reason"
                                                value={reason}
                                                checked={confirmDelete.reason === reason}
                                                onChange={() => onChange({ ...confirmDelete, reason })}
                                            />
                                            {DELETION_REASON_LABELS[reason]}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <p className="text-sm text-gray-400 mb-1">
                            <span className="text-white font-medium">&quot;{confirmDelete.name}&quot;</span>을(를) 삭제하시겠습니까?
                        </p>
                        {confirmDelete.type === 'project' && (
                            <p className="text-xs text-rose-400 mt-1 mb-4">⚠️ 프로젝트의 모든 데이터(요구사항, QFD, Kano 응답 등)가 함께 삭제됩니다.</p>
                        )}
                        {confirmDelete.type === 'user' && (
                            <p className="text-xs text-amber-400 mt-1 mb-4">⚠️ 이 작업은 되돌릴 수 없습니다.</p>
                        )}
                    </>
                )}

                {confirmDelete.error && (
                    <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                        {confirmDelete.error}
                    </p>
                )}

                <div className="flex gap-3 mt-4">
                    <button
                        onClick={() => cancelGoesBack(confirmDelete)
                            // 되돌아갈 자리를 준다. 마지막 확인에서 취소만 가능하면
                            // 실수로 다음 단계에 온 사람이 처음부터 다시 해야 한다.
                            ? onChange({ ...confirmDelete, stage: 1, error: undefined })
                            : onChange(null)
                        }
                        className="btn-ghost flex-1"
                        id="admin-cancel-delete-btn"
                        disabled={isDeleting}
                    >
                        {confirmDelete.stage === 2 ? '뒤로' : '취소'}
                    </button>
                    <button
                        onClick={() => {
                            // 몇 번 더 물어볼지는 lib/delete-confirmation 이 정한다.
                            if (deleteActionFor(confirmDelete) === 'advance') {
                                onChange({ ...confirmDelete, stage: 2 });
                                return;
                            }
                            if (confirmDelete.type === 'user') {
                                // 확정은 점검 결과를 보고 있는 stage 2 에서만 한다. preview 만
                                // 보고 판단하면, "뒤로"로 stage 1 에 돌아온 뒤 다시 누를 때
                                // 마지막 확인을 건너뛰고 지워진다 — preview 는 남아 있으므로.
                                onDeleteUser(confirmDelete.id, confirmDelete.stage === 2 && (confirmDelete.preview || confirmDelete.cascadeWarning)
                                    ? { confirmCascade: true, reason: confirmDelete.reason, previewToken: confirmDelete.preview?.previewToken }
                                    : {});
                                return;
                            }
                            onDeleteProject(confirmDelete.id);
                        }}
                        // 사유를 고르기 전에는 확정할 수 없다. 서버도 400 으로 막지만,
                        // 되돌릴 수 없는 조작이라 누르기 전에 알려 주는 편이 낫다.
                        disabled={isDeleting || (confirmDelete.stage === 2 && Boolean(confirmDelete.preview) && !confirmDelete.reason)}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-sm font-medium hover:bg-rose-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        id="admin-confirm-delete-btn"
                    >
                        {isDeleting ? '처리 중...' : deleteActionFor(confirmDelete) === 'advance' ? '계속' : '삭제'}
                    </button>
                </div>
            </div>
        </div>
    );
}
