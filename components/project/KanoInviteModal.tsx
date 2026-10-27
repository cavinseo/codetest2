'use client';

// Kano 응답자 초대 창. 한 명 초대와 명단(붙여넣기·엑셀) 일괄 초대를 맡는다.
// KanoManager 한 파일에 1600줄이 몰려 있어 떼어 냈다(2026-10-25 코드 리뷰 L1). 창을 닫아도
// 컴포넌트는 남아 있어, 마지막으로 고른 초대 방식(한 명/여러 명)을 다시 열 때도 기억한다.
import { useRef, useState } from 'react';
import type { ToastType } from '@/components/HeaderToast';
import { readJsonOrThrow } from '@/lib/client-fetch';
import { EXCEL_FILE_TYPE_ERROR, isExcelFileName } from '@/lib/upload-guard';

interface BulkInviteResult {
    email: string;
    status: 'invited' | 'skipped' | 'failed';
    reason?: string;
}

interface BulkInviteSummary {
    invited: number;
    skipped: number;
    failed: number;
    emailSent: number;
}

export interface KanoInviteModalProps {
    projectId: string;
    open: boolean;
    onClose: () => void;
    /** 초대를 보낸 뒤 초대 내역을 다시 불러온다. */
    onInvited: () => Promise<void>;
    showToast: (message: string, type?: ToastType) => void;
}

export default function KanoInviteModal({ projectId, open, onClose, onInvited, showToast }: KanoInviteModalProps) {
    const [inviteEmail, setInviteEmail] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    const [inviteError, setInviteError] = useState('');
    // 한 명씩 보낼지, 여러 명을 한 번에 보낼지
    const [inviteMode, setInviteMode] = useState<'single' | 'bulk'>('single');
    const [bulkEmailText, setBulkEmailText] = useState('');
    const [bulkFile, setBulkFile] = useState<File | null>(null);
    const [inviteResults, setInviteResults] = useState<BulkInviteResult[] | null>(null);
    const [inviteSummary, setInviteSummary] = useState<BulkInviteSummary | null>(null);
    const bulkFileInputRef = useRef<HTMLInputElement | null>(null);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setInviteError('');
        setIsInviting(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/kano/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail }),
            });
            const data = await readJsonOrThrow(response, '초대 실패');
            await onInvited();
            onClose();
            setInviteEmail('');
            showToast(data.message || `${inviteEmail}에게 초대가 생성되었습니다!`, 'success');
        } catch (error: any) {
            setInviteError(error.message);
        } finally {
            setIsInviting(false);
        }
    };

    const closeInviteModal = () => {
        onClose();
        setInviteEmail('');
        setInviteError('');
        setBulkEmailText('');
        setBulkFile(null);
        setInviteResults(null);
        setInviteSummary(null);
        if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
    };

    // 붙여 넣은 주소 목록 또는 업로드한 명단 파일로 한 번에 초대한다.
    const handleBulkInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setInviteError('');
        setInviteResults(null);
        setInviteSummary(null);

        if (!bulkFile && !bulkEmailText.trim()) {
            setInviteError('초대할 이메일을 입력하거나 명단 파일을 선택하세요.');
            return;
        }

        setIsInviting(true);
        try {
            let response: Response;

            if (bulkFile) {
                const formData = new FormData();
                formData.append('file', bulkFile);
                response = await fetch(`/api/projects/${projectId}/kano/invite/bulk`, {
                    method: 'POST',
                    body: formData,
                });
            } else {
                response = await fetch(`/api/projects/${projectId}/kano/invite/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: bulkEmailText }),
                });
            }

            const data = await readJsonOrThrow(response, '일괄 초대에 실패했습니다.');

            await onInvited();
            setInviteResults(data.results || []);
            setInviteSummary(data.summary || null);
            setBulkEmailText('');
            setBulkFile(null);
            if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
            showToast(data.message || '일괄 초대를 처리했습니다.', 'success');
        } catch (error: any) {
            setInviteError(error.message);
        } finally {
            setIsInviting(false);
        }
    };

    const handleBulkFileChange = (file: File | null) => {
        if (!file) {
            setBulkFile(null);
            return;
        }
        if (!isExcelFileName(file.name)) {
            setInviteError(EXCEL_FILE_TYPE_ERROR);
            if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
            return;
        }
        setInviteError('');
        setBulkFile(file);
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="glass-strong max-w-xl w-full p-6 max-h-[88vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
                        <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        응답자 초대
                    </h3>
                    <button
                        onClick={closeInviteModal}
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 초대 방식 선택 */}
                <div className="glass-strong inline-flex p-1 rounded-xl mb-5">
                    <button
                        type="button"
                        onClick={() => { setInviteMode('single'); setInviteError(''); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${inviteMode === 'single'
                            ? 'bg-primary-600/20 text-white border border-primary-500/25'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        한 명 초대
                    </button>
                    <button
                        type="button"
                        onClick={() => { setInviteMode('bulk'); setInviteError(''); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${inviteMode === 'bulk'
                            ? 'bg-purple-600/20 text-white border border-purple-500/25'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        여러 명 한번에
                    </button>
                </div>

                {inviteError && (
                    <div className="bg-red-500/[0.08] border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-4 text-sm">{inviteError}</div>
                )}

                {inviteMode === 'single' ? (
                    // key 를 주지 않으면 모드를 바꿀 때 React 가 두 폼의 input 을 같은 자리로 보고 재사용해
                    // controlled/uncontrolled 경고가 난다.
                    <form key="invite-single" onSubmit={handleInvite} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">이메일 주소 *</label>
                            <input
                                type="email"
                                required
                                value={inviteEmail}
                                onChange={e => setInviteEmail(e.target.value)}
                                className="input w-full"
                                placeholder="customer@example.com"
                                autoFocus
                            />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={closeInviteModal} className="flex-1 btn-secondary py-3">
                                취소
                            </button>
                            <button type="submit" disabled={isInviting} className="flex-1 btn-primary py-3 disabled:opacity-50">
                                {isInviting ? '발송 중...' : '초대 보내기'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <form key="invite-bulk" onSubmit={handleBulkInvite} className="space-y-4">
                        {/* 양식 다운로드 + 업로드 */}
                        <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.05] p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                    <p className="text-sm font-semibold text-purple-200">명단 양식으로 초대</p>
                                    <p className="text-[11px] text-gray-500 mt-0.5">양식을 내려받아 이메일을 채운 뒤 업로드하세요.</p>
                                </div>
                                <a
                                    href={`/api/projects/${projectId}/kano/invite-template`}
                                    className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                    </svg>
                                    양식 다운로드
                                </a>
                            </div>
                            <input
                                ref={bulkFileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={(event) => handleBulkFileChange(event.target.files?.[0] ?? null)}
                                className="hidden"
                                id={`kano-invite-upload-${projectId}`}
                            />
                            <label
                                htmlFor={`kano-invite-upload-${projectId}`}
                                className={`btn-secondary text-sm w-full flex items-center justify-center gap-1.5 ${isInviting ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                {bulkFile ? bulkFile.name : '명단 파일 선택 (.xlsx)'}
                            </label>
                            {bulkFile && (
                                <button
                                    type="button"
                                    onClick={() => handleBulkFileChange(null)}
                                    className="mt-2 text-[11px] text-gray-500 hover:text-gray-300"
                                >
                                    선택한 파일 지우기
                                </button>
                            )}
                        </div>

                        {/* 직접 붙여넣기 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                또는 이메일 직접 입력
                            </label>
                            <textarea
                                value={bulkEmailText}
                                onChange={e => setBulkEmailText(e.target.value)}
                                rows={4}
                                disabled={Boolean(bulkFile)}
                                className="input w-full resize-y disabled:opacity-40"
                                placeholder={'a@example.com\nb@example.com, c@example.com'}
                            />
                            <p className="text-[11px] text-gray-600 mt-1">
                                줄바꿈·쉼표·세미콜론으로 구분해 여러 명을 입력할 수 있습니다. 중복과 잘못된 주소는 자동으로 걸러집니다.
                            </p>
                        </div>

                        {/* 처리 결과 */}
                        {inviteSummary && (
                            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                                <div className="flex items-center gap-4 text-xs">
                                    <span className="text-emerald-300">초대 {inviteSummary.invited}명</span>
                                    <span className="text-amber-300">건너뜀 {inviteSummary.skipped}명</span>
                                    {inviteSummary.failed > 0 && (
                                        <span className="text-red-300">실패 {inviteSummary.failed}명</span>
                                    )}
                                </div>
                                {inviteResults && inviteResults.length > 0 && (
                                    <div className="mt-3 max-h-[160px] overflow-auto space-y-1">
                                        {inviteResults.map((result, index) => (
                                            <div key={index} className="flex items-center gap-2 text-[11px]">
                                                <span className={
                                                    result.status === 'invited' ? 'text-emerald-400'
                                                        : result.status === 'skipped' ? 'text-amber-400'
                                                            : 'text-red-400'
                                                }>
                                                    {result.status === 'invited' ? '●' : result.status === 'skipped' ? '○' : '×'}
                                                </span>
                                                <span className="text-gray-300">{result.email}</span>
                                                {result.reason && <span className="text-gray-600">— {result.reason}</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={closeInviteModal} className="flex-1 btn-secondary py-3">
                                닫기
                            </button>
                            <button type="submit" disabled={isInviting} className="flex-1 btn-primary py-3 disabled:opacity-50">
                                {isInviting ? '발송 중...' : '일괄 초대 보내기'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
