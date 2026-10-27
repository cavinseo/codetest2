'use client';

// Kano 응답 수집(응답 파일 업로드·오프라인 HTML 응답지·Google Forms 연동)의 상태와 요청.
// KanoManager 한 파일에 1600줄이 몰려 있어 떼어 냈다(2026-10-25 코드 리뷰 L1). 카드는 설문
// 관리 탭에서만 그려지지만 상태는 KanoManager 가 이 훅으로 들고 있는다 — 분석 탭에 다녀와도
// 고른 수집 방식과 만들어 둔 Google Forms 연결이 남아야 한다.
import { useRef, useState } from 'react';
import type { ToastType } from '@/components/HeaderToast';
import type { UploadWritePolicy } from './UploadWritePolicyPrompt';
import { readJsonOrThrow } from '@/lib/client-fetch';

export interface OfflineUploadFileResult {
    fileName: string;
    status: 'ok' | 'failed';
    answerCount?: number;
    reason?: string;
    warning?: string;
}

export type ExcelUploadFormat = 'template' | 'googleForms';
export type KanoCollectMode = 'file' | 'offline' | 'googleForms';

export function useKanoResponseCollection(params: {
    projectId: string;
    projectName: string;
    loadData: () => Promise<void>;
    showToast: (message: string, type?: ToastType) => void;
}) {
    const { projectId, projectName, loadData, showToast } = params;
    const [isCreatingForm, setIsCreatingForm] = useState(false);
    const [createdFormUrl, setCreatedFormUrl] = useState('');
    const [createdFormId, setCreatedFormId] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [isUploadingExcel, setIsUploadingExcel] = useState(false);
    const [excelFile, setExcelFile] = useState<File | null>(null);
    const [pendingUpload, setPendingUpload] = useState<'excel' | 'offline' | null>(null);
    const [excelUploadFormat, setExcelUploadFormat] = useState<ExcelUploadFormat>('template');
    const [collectMode, setCollectMode] = useState<KanoCollectMode>('file');
    const [offlineFiles, setOfflineFiles] = useState<File[]>([]);
    const [offlineResults, setOfflineResults] = useState<OfflineUploadFileResult[]>([]);
    const [isUploadingOffline, setIsUploadingOffline] = useState(false);
    const excelInputRef = useRef<HTMLInputElement | null>(null);
    const offlineInputRef = useRef<HTMLInputElement | null>(null);

    const handleCreateGoogleForm = async () => {
        setIsCreatingForm(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/kano/create-form`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName }),
            });
            const data = await res.json();
            if (data.needsAuth) {
                const returnUrl = `/project/${projectId}/kano`;
                window.location.href = `/api/auth/google?returnUrl=${encodeURIComponent(returnUrl)}&projectId=${projectId}`;
                return;
            }
            if (!res.ok) throw new Error(data.error);
            setCreatedFormUrl(data.formUrl);
            setCreatedFormId(data.formId);
            showToast(`Google Forms 설문지가 생성되었습니다! (${data.questionCount}개 질문 세트)`, 'success');
        } catch (error: any) {
            showToast(`오류: ${error.message}`, 'error');
        } finally {
            setIsCreatingForm(false);
        }
    };

    const handleImportResponses = async () => {
        if (!createdFormId) {
            showToast('먼저 Google Forms 설문지를 생성하세요.', 'error');
            return;
        }
        setIsImporting(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/kano/form-responses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ formId: createdFormId }),
            });
            const data = await res.json();
            if (data.needsAuth) {
                const returnUrl = `/project/${projectId}/kano`;
                window.location.href = `/api/auth/google?returnUrl=${encodeURIComponent(returnUrl)}&projectId=${projectId}`;
                return;
            }
            if (!res.ok) throw new Error(data.error);
            showToast(data.message, 'success');
            await loadData();
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const handleUploadExcelResponses = async (writePolicy: UploadWritePolicy, replaceExistingRespondents = false) => {
        if (!excelFile) {
            showToast('업로드할 엑셀 파일을 선택하세요.', 'error');
            return;
        }

        setIsUploadingExcel(true);
        try {
            const formData = new FormData();
            formData.append('file', excelFile);
            formData.append('format', collectMode === 'googleForms' ? 'googleForms' : excelUploadFormat);
            formData.append('writePolicy', writePolicy);
            if (replaceExistingRespondents) formData.append('replaceExistingRespondents', 'true');

            const res = await fetch(`/api/projects/${projectId}/kano/upload-excel`, {
                method: 'POST',
                body: formData,
            });
            const data = await readJsonOrThrow(res, '엑셀 업로드에 실패했습니다.');

            showToast(data.message, 'success');
            setExcelFile(null);
            if (excelInputRef.current) excelInputRef.current.value = '';
            await loadData();
        } catch (error: any) {
            const message = error.message || '엑셀 업로드에 실패했습니다.';
            showToast(message, 'error');
        } finally {
            setIsUploadingExcel(false);
            setPendingUpload(null);
        }
    };

    const handleCollectModeChange = (mode: KanoCollectMode) => {
        if (mode === collectMode) return;
        setCollectMode(mode);
        setPendingUpload(null);
        setExcelFile(null);
        if (excelInputRef.current) excelInputRef.current.value = '';
        setOfflineResults([]);
    };

    const handleUploadOfflineResponses = async (writePolicy: UploadWritePolicy, replaceExistingRespondents = false) => {
        if (offlineFiles.length === 0) {
            showToast('업로드할 HTML 응답지를 선택하세요.', 'error');
            return;
        }

        setIsUploadingOffline(true);
        setOfflineResults([]);
        try {
            const formData = new FormData();
            for (const file of offlineFiles) {
                formData.append('files', file);
            }
            formData.append('writePolicy', writePolicy);
            if (replaceExistingRespondents) formData.append('replaceExistingRespondents', 'true');

            const res = await fetch(`/api/projects/${projectId}/kano/upload-offline`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 400 && Array.isArray(data.results)) {
                    setOfflineResults(data.results);
                }
                throw new Error(data.error || '오프라인 응답지 업로드에 실패했습니다.');
            }

            setOfflineResults(data.results || []);
            showToast(data.message, 'success');
            setOfflineFiles([]);
            if (offlineInputRef.current) offlineInputRef.current.value = '';
            await loadData();
        } catch (error: any) {
            showToast(error.message || '오프라인 응답지 업로드에 실패했습니다.', 'error');
        } finally {
            setIsUploadingOffline(false);
            setPendingUpload(null);
        }
    };

    const cancelPendingUpload = () => {
        if (pendingUpload === 'excel') {
            setExcelFile(null);
            if (excelInputRef.current) excelInputRef.current.value = '';
        } else {
            setOfflineFiles([]);
            if (offlineInputRef.current) offlineInputRef.current.value = '';
        }
        setPendingUpload(null);
    };

    /** 응답을 리셋하면 만들어 둔 Google Forms 연결도 버린다. 옛 설문지의 응답을 다시 가져오면 안 된다. */
    const forgetCreatedForm = () => {
        setCreatedFormId('');
        setCreatedFormUrl('');
    };

    return {
        collectMode, handleCollectModeChange,
        isCreatingForm, createdFormUrl, createdFormId, isImporting, handleCreateGoogleForm, handleImportResponses, forgetCreatedForm,
        excelFile, setExcelFile, excelUploadFormat, setExcelUploadFormat, isUploadingExcel, excelInputRef, handleUploadExcelResponses,
        offlineFiles, setOfflineFiles, offlineResults, isUploadingOffline, offlineInputRef, handleUploadOfflineResponses,
        pendingUpload, setPendingUpload, cancelPendingUpload,
    };
}

export type KanoResponseCollectionState = ReturnType<typeof useKanoResponseCollection>;
