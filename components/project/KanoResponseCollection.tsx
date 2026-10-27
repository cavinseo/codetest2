'use client';

// Kano 설문 관리 탭의 응답 수집 카드. 상태와 요청은 useKanoResponseCollection 이 맡고 여기서는
// 그리기만 한다(2026-10-25 코드 리뷰 L1).
import Link from 'next/link';
import type { ToastType } from '@/components/HeaderToast';
import UploadWritePolicyPrompt from './UploadWritePolicyPrompt';
import { GOOGLE_FORMS_DISABLED_MESSAGE, GOOGLE_FORMS_INTEGRATION_ENABLED } from '@/lib/feature-flags';
import type { ExcelUploadFormat, KanoResponseCollectionState } from './useKanoResponseCollection';

export interface KanoResponseCollectionProps {
    projectId: string;
    requirementCount: number;
    googleConfigured: boolean;
    collection: KanoResponseCollectionState;
    showToast: (message: string, type?: ToastType) => void;
    // 미리보기 창은 화면 맨 위(KanoManager)에서 띄운다. 카드 안에서 띄우면 애니메이션이 걸린
    // 조상의 transform 때문에 fixed 창이 화면이 아니라 카드 기준으로 붙을 수 있다.
    onOpenPreview: () => void;
    onOpenOfflinePreview: () => void;
}

export default function KanoResponseCollection({
    projectId, requirementCount, googleConfigured, collection, showToast, onOpenPreview, onOpenOfflinePreview,
}: KanoResponseCollectionProps) {
    const {
        collectMode, handleCollectModeChange,
        isCreatingForm, createdFormUrl, createdFormId, isImporting, handleCreateGoogleForm, handleImportResponses,
        excelFile, setExcelFile, excelUploadFormat, setExcelUploadFormat, isUploadingExcel, excelInputRef, handleUploadExcelResponses,
        offlineFiles, setOfflineFiles, offlineResults, isUploadingOffline, offlineInputRef, handleUploadOfflineResponses,
        pendingUpload, setPendingUpload, cancelPendingUpload,
    } = collection;
    const kanoUploadTemplateUrl = `/api/projects/${projectId}/kano/upload-template`;
    const kanoFormScriptUrl = `/api/projects/${projectId}/kano/form-script`;

    return (
        <div className="card">
            <h2 className="text-lg font-display font-bold text-white flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 12l-4-4m4 4l4-4M4 20h16" />
                </svg>
                응답 수집
            </h2>

            <div className="flex flex-wrap gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl w-fit mb-5">
                <button
                    type="button"
                    onClick={() => handleCollectModeChange('file')}
                    disabled={isUploadingExcel || isUploadingOffline}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${collectMode === 'file'
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                >
                    응답 파일로 업로드
                </button>
                <button
                    type="button"
                    onClick={() => handleCollectModeChange('offline')}
                    disabled={isUploadingExcel || isUploadingOffline}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${collectMode === 'offline'
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                >
                    오프라인 응답파일 업로드
                </button>
                <button
                    type="button"
                    onClick={() => handleCollectModeChange('googleForms')}
                    disabled={isUploadingExcel || isUploadingOffline}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${collectMode === 'googleForms'
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                >
                    <span className="flex items-center gap-2">
                        Google Forms 연동
                        <span className="text-[10px] bg-white/[0.08] text-gray-300 border border-white/[0.10] px-1.5 py-0.5 rounded-full">자동 연동 개발 중</span>
                    </span>
                </button>
            </div>

            {collectMode === 'googleForms' && (
                <div className="space-y-4">
                    <div>
                        <h3 className="text-white text-sm font-semibold">Google Forms 연동</h3>
                        <p className="text-sm text-gray-500 mt-1">저장된 Kano 질문으로 Google Forms 설문지를 만들 수 있는 Apps Script를 받으세요.</p>
                    </div>
                    <div className="rounded-xl border border-blue-500/25 bg-blue-500/[0.07] p-4">
                        <h4 className="text-sm font-semibold text-blue-200">Kano 설문지 Google Forms 스크립트</h4>
                        <p className="mt-2 text-xs leading-5 text-gray-400">
                            질문을 저장한 뒤 파일을 내려받아 Google Apps Script에 붙여넣고 createKanoForm()을 실행하세요.
                            생성된 설문지의 응답 시트는 Google Forms 형식으로 업로드할 수 있습니다.
                        </p>
                        <a href={kanoFormScriptUrl} className="btn-secondary mt-3 inline-flex items-center gap-1.5 text-xs">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                            </svg>
                            Kano 설문지 Apps Script 받기
                        </a>
                    </div>
                    {!GOOGLE_FORMS_INTEGRATION_ENABLED && (
                        <p className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-400">
                            {GOOGLE_FORMS_DISABLED_MESSAGE}
                        </p>
                    )}
                    {/* 자동 연동 3단계 진행 흐름 */}
                    <h4 className="text-xs font-semibold text-gray-400">자동 연동</h4>
                    <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${GOOGLE_FORMS_INTEGRATION_ENABLED ? '' : 'opacity-60 grayscale'}`}>
                        {/* 1단계: 미리보기 */}
                        <div className="p-4 bg-white/[0.03] border border-white/[0.08] rounded-xl flex flex-col">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-bold flex items-center justify-center">1</span>
                                <span className="text-[11px] text-emerald-400">
                                    {GOOGLE_FORMS_INTEGRATION_ENABLED ? '준비됨' : '개발 중'}
                                </span>
                            </div>
                            <h3 className="text-white text-sm font-semibold mb-3">미리보기</h3>
                            <button
                                onClick={onOpenPreview}
                                disabled={!GOOGLE_FORMS_INTEGRATION_ENABLED}
                                className="mt-auto w-full px-3 py-2 rounded-lg border border-white/[0.10] bg-white/[0.04] hover:bg-white/[0.08] disabled:hover:bg-white/[0.04] disabled:cursor-not-allowed text-gray-200 text-xs font-semibold transition-colors"
                            >
                                양식 확인
                            </button>
                        </div>

                        {/* 2단계: 설문지 생성 (Google 연동 필요) */}
                        <div className={`p-4 rounded-xl flex flex-col border ${GOOGLE_FORMS_INTEGRATION_ENABLED && googleConfigured
                            ? 'bg-blue-500/[0.08] border-blue-500/20'
                            : 'bg-amber-500/[0.06] border-amber-500/25'
                            }`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${GOOGLE_FORMS_INTEGRATION_ENABLED && googleConfigured
                                    ? 'bg-blue-500/15 text-blue-300'
                                    : 'bg-amber-500/15 text-amber-300'
                                    }`}>2</span>
                                {GOOGLE_FORMS_INTEGRATION_ENABLED && googleConfigured ? (
                                    <span className="text-[11px] text-blue-400">연동됨</span>
                                ) : GOOGLE_FORMS_INTEGRATION_ENABLED ? (
                                    <span className="text-[11px] text-amber-400 flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                        설정 필요
                                    </span>
                                ) : (
                                    <span className="text-[11px] text-gray-500">개발 중</span>
                                )}
                            </div>
                            <h3 className="text-white text-sm font-semibold mb-1">설문지 생성</h3>
                            <p className="text-xs text-gray-500 mb-3">{requirementCount}개 질문 세트</p>
                            {!GOOGLE_FORMS_INTEGRATION_ENABLED ? (
                                <button
                                    type="button"
                                    disabled
                                    className="mt-auto w-full px-3 py-2 rounded-lg border border-white/[0.10] bg-white/[0.04] text-gray-400 text-xs font-semibold cursor-not-allowed"
                                >
                                    개발 중
                                </button>
                            ) : googleConfigured ? (
                                <button
                                    onClick={handleCreateGoogleForm}
                                    disabled={isCreatingForm}
                                    className="mt-auto w-full px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-500/15 hover:bg-blue-500/25 disabled:opacity-50 text-blue-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                                >
                                    {isCreatingForm && <span className="w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />}
                                    {isCreatingForm ? '생성 중...' : 'Google Forms 생성'}
                                </button>
                            ) : (
                                <Link
                                    href="/settings"
                                    className="mt-auto w-full px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                                >
                                    Google 설정하기
                                </Link>
                            )}
                        </div>

                        {/* 3단계: 응답 가져오기 */}
                        <div className={`p-4 rounded-xl flex flex-col border ${GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormId
                            ? 'bg-emerald-500/[0.08] border-emerald-500/20'
                            : 'bg-white/[0.02] border-white/[0.06]'
                            }`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormId
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : 'bg-white/[0.06] text-gray-500'
                                    }`}>3</span>
                                <span className={`text-[11px] ${GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormId ? 'text-emerald-400' : 'text-gray-500'}`}>
                                    {GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormId ? '수집 가능' : '2단계 후 진행'}
                                </span>
                            </div>
                            <h3 className={`text-sm font-semibold mb-3 ${GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormId ? 'text-white' : 'text-gray-500'}`}>응답 가져오기</h3>
                            <button
                                onClick={handleImportResponses}
                                disabled={!GOOGLE_FORMS_INTEGRATION_ENABLED || isImporting || !createdFormId}
                                className="mt-auto w-full px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 disabled:hover:bg-emerald-500/15 text-emerald-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                            >
                                {GOOGLE_FORMS_INTEGRATION_ENABLED && isImporting && <span className="w-3 h-3 border-2 border-emerald-300 border-t-transparent rounded-full animate-spin" />}
                                {GOOGLE_FORMS_INTEGRATION_ENABLED && isImporting ? '가져오는 중...' : GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormId ? '응답 가져오기' : '대기 중'}
                            </button>
                        </div>
                    </div>

                    {/* 생성된 폼 URL */}
                    {GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormUrl && (
                        <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl p-4">
                            <h4 className="text-emerald-300 font-semibold text-sm mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Google Forms 설문지가 생성되었습니다
                            </h4>
                            <div className="flex items-center gap-2">
                                <input type="text" readOnly value={createdFormUrl}
                                    className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-sm" />
                                <button onClick={() => { navigator.clipboard.writeText(createdFormUrl); showToast('링크가 복사되었습니다!', 'info'); }}
                                    className="btn-secondary text-sm whitespace-nowrap flex items-center gap-1.5">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    복사
                                </button>
                                <a href={createdFormUrl} target="_blank" rel="noopener noreferrer"
                                    className="btn-primary text-sm whitespace-nowrap flex items-center gap-1.5">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    열기
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {pendingUpload && (
                <UploadWritePolicyPrompt
                    title={pendingUpload === 'excel' ? (collectMode === 'googleForms' ? 'Google Forms 설문결과 업로드' : '엑셀 양식 업로드') : 'HTML 응답지 업로드'}
                    fileName={pendingUpload === 'excel' ? excelFile?.name ?? '' : offlineFiles.map(file => file.name).join(', ')}
                    targetLabel="Kano 응답"
                    isUploading={isUploadingExcel || isUploadingOffline}
                    replaceDescription="기존 데이터 지우고 업로드를 선택하면 기존 응답과 초대 데이터가 삭제됩니다."
                    onSelect={policy => pendingUpload === 'excel'
                        ? handleUploadExcelResponses(policy) : handleUploadOfflineResponses(policy)}
                    onReplaceRespondents={() => pendingUpload === 'excel'
                        ? handleUploadExcelResponses('append', true) : handleUploadOfflineResponses('append', true)}
                    onCancel={cancelPendingUpload}
                />
            )}

            {(collectMode === 'file' || collectMode === 'googleForms') && (
                <div>
                    <h3 className="text-white text-sm font-semibold">{collectMode === 'googleForms' ? 'Google Forms 설문결과 업로드' : '응답 파일로 업로드'}</h3>
                    <p className="text-sm text-gray-500 mt-1 mb-4">
                        {collectMode === 'googleForms'
                            ? 'Google Forms의 응답 CSV 또는 연결된 Google Sheets에서 내려받은 Excel 파일을 올려 주세요.'
                            : '여러 명의 답변을 파일 하나에 정리해 한 번에 등록합니다'}
                    </p>
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 flex flex-col lg:flex-row lg:items-center gap-3">
                        {collectMode === 'file' && <select
                            value={excelUploadFormat}
                            disabled={isUploadingExcel || isUploadingOffline}
                            onChange={(event) => setExcelUploadFormat(event.target.value as ExcelUploadFormat)}
                            className="px-3 py-2 rounded-lg border border-amber-500/25 bg-black/20 text-amber-100 text-xs font-semibold outline-none focus:border-amber-500/50 lg:flex-shrink-0"
                        >
                            <option value="template">전용 양식</option>
                            <option value="googleForms">Google Forms 형식</option>
                        </select>}

                        {collectMode === 'file' && <a
                            href={`${kanoUploadTemplateUrl}?format=${excelUploadFormat}`}
                            className="px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 lg:flex-shrink-0"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                            </svg>
                            양식 받기
                        </a>}

                        <input
                            ref={excelInputRef}
                            type="file"
                            accept={collectMode === 'googleForms' ? '.xlsx,.xls,.csv' : '.xlsx,.xls'}
                            disabled={isUploadingExcel || isUploadingOffline}
                            onChange={(event) => { setExcelFile(event.target.files?.[0] ?? null); setPendingUpload(null); }}
                            className="flex-1 min-w-0 text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-500/15 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-amber-200 hover:file:bg-amber-500/25"
                        />

                        <button
                            onClick={() => setPendingUpload('excel')}
                            disabled={isUploadingExcel || !excelFile}
                            className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:hover:bg-amber-600 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 lg:flex-shrink-0"
                        >
                            {isUploadingExcel && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                            {isUploadingExcel ? '업로드 중...' : '업로드'}
                        </button>
                    </div>
                </div>
            )}

            {collectMode === 'offline' && (
                <div>
                    <h3 className="text-white text-sm font-semibold">오프라인 응답파일 업로드</h3>
                    <p className="text-sm text-gray-500 mt-1 mb-4">각자 작성한 HTML 응답지를 낱장으로, 여러 장을 한 번에 등록합니다</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                        <button
                            type="button"
                            onClick={onOpenOfflinePreview}
                            className="btn-secondary text-sm"
                        >
                            양식 확인
                        </button>
                        <a
                            href={`/api/projects/${projectId}/kano/offline-form`}
                            className="btn-secondary text-sm"
                        >
                            오프라인 HTML 받기
                        </a>
                    </div>

                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 flex flex-col lg:flex-row lg:items-center gap-3">
                        <input
                            ref={offlineInputRef}
                            type="file"
                            multiple
                            accept=".html,.htm"
                            disabled={isUploadingExcel || isUploadingOffline}
                            onChange={(event) => { setOfflineFiles(Array.from(event.target.files ?? [])); setPendingUpload(null); }}
                            className="flex-1 min-w-0 text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500/15 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-emerald-200 hover:file:bg-emerald-500/25"
                        />
                        {offlineFiles.length > 0 && (
                            <span className="text-xs font-semibold text-emerald-300 lg:flex-shrink-0">{offlineFiles.length}장 선택됨</span>
                        )}
                        <button
                            type="button"
                            onClick={() => setPendingUpload('offline')}
                            disabled={isUploadingOffline || offlineFiles.length === 0}
                            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 lg:flex-shrink-0"
                        >
                            {isUploadingOffline && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                            {isUploadingOffline ? '업로드 중...' : '업로드'}
                        </button>
                    </div>

                    {offlineResults.length > 0 && (
                        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 max-h-[200px] overflow-auto space-y-1">
                            {offlineResults.map((result, index) => (
                                <div key={`${result.fileName}-${index}`} className={`flex items-center gap-2 text-[11px] ${result.status === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
                                    <span>{result.status === 'ok' ? '●' : '×'}</span>
                                    <span>{result.fileName}</span>
                                    <span>— {result.status === 'ok' ? `${result.answerCount ?? 0}개 응답` : result.reason}</span>
                                    {result.warning && <span className="text-amber-300">⚠ {result.warning}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
