'use client';
// 프로젝트 홈의 제품개요 편집(입력값·사업계획 첨부·양식 자동 채움·저장)을 맡는다.
//
// 프로젝트 홈(app/project/[id]/page.tsx)이 탭 전환·워크시트·Kano 분석과 함께 이 상태 9개와
// 처리 함수 6개를 모두 들고 있어 1000줄을 넘었다(2026-10-25 코드 리뷰 L5). 개요 편집은 다른 탭과
// 공유하는 상태가 없어 그대로 떼어 낸다. 화면(JSX)은 홈에 남는다.
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { ProductOverview } from '@/lib/product-overview';
import {
    getBusinessPlanFileValidationError,
    parseBusinessPlanFile,
    readAndSerializeBusinessPlanFile,
} from '@/lib/business-plan-file';
import { isExcelFileName } from '@/lib/upload-guard';

/** 개요 편집이 읽고 고치는 프로젝트 필드 */
export interface OverviewEditableProject extends ProductOverview {
    name: string;
    description?: string;
    detailedDescription?: string;
    businessPlanFile?: string;
}

type OverviewForm = ProductOverview & { name: string; description: string; detailedDescription: string; businessPlanFile: string };

export function useProjectOverviewEditor<P extends OverviewEditableProject>(
    projectId: string,
    project: P | null,
    setProject: (project: P) => void,
) {
    const [isOverviewEditing, setIsOverviewEditing] = useState(false);
    const [isOverviewSaving, setIsOverviewSaving] = useState(false);
    const [isProductImageReading, setIsProductImageReading] = useState(false);
    const [isOverviewFileReading, setIsOverviewFileReading] = useState(false);
    const [isOverviewFileDirty, setIsOverviewFileDirty] = useState(false);
    const [overviewError, setOverviewError] = useState('');
    // 사업계획 양식에서 어떤 항목이 자동으로 채워졌는지 알려주는 안내 문구
    const [overviewAutoFillNotice, setOverviewAutoFillNotice] = useState('');
    const overviewFileSelectionRef = useRef(0);
    const [overviewForm, setOverviewForm] = useState<OverviewForm>({
        name: '',
        description: '',
        detailedDescription: '',
        businessPlanFile: '',
    });

    useEffect(() => {
        if (!project) return;
        setOverviewForm({
            ...project,
            name: project.name || '',
            description: project.description || '',
            detailedDescription: project.detailedDescription || '',
            businessPlanFile: project.businessPlanFile || '',
        });
        setIsOverviewFileDirty(false);
    }, [project]);

    const projectBusinessPlanFile = useMemo(
        () => parseBusinessPlanFile(project?.businessPlanFile),
        [project?.businessPlanFile]
    );
    const formBusinessPlanFile = useMemo(
        () => parseBusinessPlanFile(overviewForm.businessPlanFile),
        [overviewForm.businessPlanFile]
    );

    const handleOverviewCancel = () => {
        if (!project) return;
        overviewFileSelectionRef.current += 1;
        setIsOverviewFileReading(false);
        setIsOverviewFileDirty(false);
        setOverviewForm({
            ...project,
            name: project.name || '',
            description: project.description || '',
            detailedDescription: project.detailedDescription || '',
            businessPlanFile: project.businessPlanFile || '',
        });
        setOverviewError('');
        setOverviewAutoFillNotice('');
        setIsOverviewEditing(false);
    };

    const handleOverviewFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        const validationError = getBusinessPlanFileValidationError(file);
        if (validationError) {
            setOverviewError(validationError);
            return;
        }

        const selectionVersion = ++overviewFileSelectionRef.current;
        setOverviewError('');
        setOverviewAutoFillNotice('');
        setIsOverviewFileReading(true);
        try {
            const businessPlanFile = await readAndSerializeBusinessPlanFile(file);
            if (selectionVersion !== overviewFileSelectionRef.current) return;
            setOverviewForm((current) => ({ ...current, businessPlanFile }));
            setIsOverviewFileDirty(true);

            if (isExcelFileName(file.name)) {
                await autoFillFromBusinessPlan(file, selectionVersion);
            }
        } catch (error) {
            if (selectionVersion !== overviewFileSelectionRef.current) return;
            setOverviewError(error instanceof Error ? error.message : '사업계획 파일을 읽지 못했습니다.');
        } finally {
            if (selectionVersion === overviewFileSelectionRef.current) setIsOverviewFileReading(false);
        }
    };

    // 양식을 읽어 개요 입력칸을 채운다. 첨부 자체는 이미 위에서 반영됐고,
    // 여기서 실패해도 첨부는 유지한다.
    const autoFillFromBusinessPlan = async (file: File, selectionVersion: number) => {
        const body = new FormData();
        body.append('file', file);

        const res = await fetch(`/api/projects/${projectId}/business-plan/parse`, {
            method: 'POST',
            body,
        });
        if (selectionVersion !== overviewFileSelectionRef.current) return;

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            setOverviewError(data?.error || '사업계획 양식을 읽지 못했습니다. 첨부는 그대로 유지됩니다.');
            return;
        }

        const overview = data?.overview ?? {};
        const filledLabels: string[] = Array.isArray(data?.filledLabels) ? data.filledLabels : [];
        if (filledLabels.length === 0) {
            setOverviewError('양식에서 읽을 수 있는 항목이 없습니다. [내용] 칸에 입력했는지 확인하세요.');
            return;
        }

        // 양식에서 비워 둔 항목은 건너뛰어, 기존에 적어 둔 내용을 지우지 않는다.
        setOverviewForm((current) => ({
            ...current,
            name: overview.name?.trim() ? overview.name.trim() : current.name,
            description: overview.description?.trim() ? overview.description.trim() : current.description,
            detailedDescription: overview.detailedDescription?.trim()
                ? overview.detailedDescription.trim()
                : current.detailedDescription,
        }));
        setOverviewAutoFillNotice(
            `양식에서 ${filledLabels.join(', ')} 항목을 불러왔습니다. 확인 후 저장하세요.`
        );
    };

    const handleTemplateDownload = () => {
        window.location.href = `/api/projects/${projectId}/business-plan/template`;
    };

    const handleOverviewFileRemove = () => {
        overviewFileSelectionRef.current += 1;
        setIsOverviewFileReading(false);
        setIsOverviewFileDirty(true);
        setOverviewError('');
        setOverviewAutoFillNotice('');
        setOverviewForm((current) => ({ ...current, businessPlanFile: '' }));
    };

    const handleOverviewSave = async () => {
        if (!project) return;
        setOverviewError('');
        if (!overviewForm.name.trim()) {
            setOverviewError('프로젝트명을 입력하세요.');
            return;
        }

        setIsOverviewSaving(true);
        try {
            const payload = {
                name: overviewForm.name,
                productName: overviewForm.productName,
                relatedImages: overviewForm.relatedImages,
                productImageDataUrl: overviewForm.productImageDataUrl,
                productImageWidthPx: overviewForm.productImageWidthPx,
                productImageHeightPx: overviewForm.productImageHeightPx,
                marketDefinition: overviewForm.marketDefinition,
                targetCustomer: overviewForm.targetCustomer,
                additionalMarketData: overviewForm.additionalMarketData,
                description: overviewForm.description,
                detailedDescription: overviewForm.detailedDescription,
                ...(isOverviewFileDirty ? { businessPlanFile: overviewForm.businessPlanFile } : {}),
            };
            const res = await fetch(`/api/projects/${projectId}/overview`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || '제품개요 저장에 실패했습니다.');
            }

            setProject({
                ...project,
                productName: data.project.productName,
                relatedImages: data.project.relatedImages,
                productImageDataUrl: data.project.productImageDataUrl,
                productImageWidthPx: data.project.productImageWidthPx,
                productImageHeightPx: data.project.productImageHeightPx,
                marketDefinition: data.project.marketDefinition,
                targetCustomer: data.project.targetCustomer,
                additionalMarketData: data.project.additionalMarketData,
                name: data.project.name,
                description: data.project.description || '',
                detailedDescription: data.project.detailedDescription || '',
                businessPlanFile: isOverviewFileDirty ? overviewForm.businessPlanFile : project.businessPlanFile || '',
            });
            setIsOverviewFileDirty(false);
            setIsOverviewEditing(false);
        } catch (error) {
            setOverviewError(error instanceof Error ? error.message : '제품개요 저장에 실패했습니다.');
        } finally {
            setIsOverviewSaving(false);
        }
    };

    return {
        overviewForm, setOverviewForm, isOverviewEditing, setIsOverviewEditing, isOverviewSaving,
        isProductImageReading, setIsProductImageReading, isOverviewFileReading, overviewError, setOverviewError,
        overviewAutoFillNotice, projectBusinessPlanFile, formBusinessPlanFile,
        handleOverviewCancel, handleOverviewFileSelect, handleTemplateDownload, handleOverviewFileRemove, handleOverviewSave,
    };
}
