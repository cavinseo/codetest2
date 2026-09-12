'use client';
// 결과보고서(.docx) 생성 화면이다.
//
// 표 절은 기존 워크시트 API 값을 그대로 쓰고, 표로 재현하기 어려운 세 곳
// (WS-4 적합도·WS-7 산점도·WS-9 QFD 관계도)만 화면을 그려 두었다가 그림으로 캡처한다.
// 모델 조립(워크시트 캡처·교정)은 화면에서 하지만, .docx 직렬화는
// POST /api/projects/[id]/report/docx 로 넘겨 서버에서 한다 — docx 패키지가
// 브라우저 번들에서 깨지기 때문이다(클래스 필드가 SWC 다운레벨에서 'super'
// 파싱 오류를 낸다). 그림은 캡처 시점에 이미 압축된 PNG data URL이라 본문
// 한도 위험은 낮다.
import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import HeaderToast from '@/components/HeaderToast';
import { useToast } from '@/components/useToast';
import FinalReportPreview from '@/components/project/FinalReportPreview';
import FinalReportFreeInputs, { EMPTY_FREE_INPUT } from '@/components/project/FinalReportFreeInputs';
import FinalReportCaptureStage from '@/components/project/FinalReportCaptureStage';
import { useWorksheetPayloads, WORKSHEET_ROUTE_COUNT } from '@/components/project/useWorksheetPayloads';
import { buildWorksheetData, pickCoachName, toKanoChartPoints, type WorksheetPayloads } from '@/lib/final-report-inputs';
import {
    buildFinalReportModel,
    CAPTURED_WORKSHEET_TITLES,
    type CapturedWorksheetImage,
    type FinalReportFreeInput,
    type FinalReportModel,
    type FinalReportOverviewInput,
} from '@/lib/final-report-document';
import { applyBlockEdit, countEditedBlocks, withEditedBlocks, type BlockEdit } from '@/lib/final-report-edit';
import { captureWorksheetNode } from '@/lib/worksheet-capture';
import { downloadBlobAsFile } from '@/lib/file-download';

/** 캡처할 화면과 그 절 제목. 제목은 문서 쪽과 같은 표를 본다. */
const CAPTURE_TARGETS = (Object.keys(CAPTURED_WORKSHEET_TITLES) as Array<CapturedWorksheetImage['worksheetId']>)
    .map((worksheetId) => ({ id: worksheetId, title: CAPTURED_WORKSHEET_TITLES[worksheetId] }));

/** 표지에 찍히는 값만 워크시트 응답에서 꺼낸다. */
function buildOverviewInput(payloads: Record<string, unknown>): FinalReportOverviewInput {
    const project = (payloads.overview as { project?: { name?: string; description?: string | null } } | null)?.project;
    return {
        projectName: project?.name ?? '프로젝트',
        description: project?.description ?? null,
        coachName: pickCoachName(payloads.mentors),
        // 문서에 그대로 찍히는 값이라 ISO 가 아니라 사람이 읽는 날짜로 넘긴다.
        generatedAt: new Date().toLocaleDateString('ko-KR'),
    };
}

/** 세 화면을 차례로 찍는다. 한 곳이라도 없으면 그 자리를 빈 그림으로 넘기지 않고 멈춘다. */
async function captureWorksheetImages(onProgress: (message: string) => void): Promise<CapturedWorksheetImage[]> {
    const images: CapturedWorksheetImage[] = [];
    for (const [index, target] of CAPTURE_TARGETS.entries()) {
        onProgress(`${index}/${CAPTURE_TARGETS.length} 캡처 중...`);
        const node = document.querySelector<HTMLElement>(`[data-worksheet-id="${target.id}"]`);
        if (!node) throw new Error(`${target.title} 화면을 찾지 못했습니다.`);
        const captured = await captureWorksheetNode(node);
        images.push({ worksheetId: target.id, title: target.title, ...captured });
    }
    return images;
}

/**
 * .docx 직렬화는 서버에서 한다 — docx 패키지를 브라우저 번들에 넣으면
 * 빌드가 깨진다(클래스 필드가 SWC 다운레벨에서 'super' 파싱 오류를 낸다).
 */
async function requestReportDocx(projectId: string, model: FinalReportModel): Promise<Blob> {
    const response = await fetch(`/api/projects/${projectId}/report/docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(model),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || '문서를 만들지 못했습니다.');
    }
    return response.blob();
}

function WorksheetLoading({ loadedCount, projectId }: { loadedCount: number; projectId: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 p-12">
            <div className="animate-spin h-7 w-7 border-2 border-primary-500 border-t-transparent rounded-full" />
            <p className="text-sm text-gray-500">워크시트 불러오는 중 {loadedCount}/{WORKSHEET_ROUTE_COUNT}</p>
            {/* 주소의 프로젝트 식별자를 그대로 보여 준다. 안내문의 자리표시자를 그대로
                넣어 열었던 일이 있어, 화면만 보고도 그 경우를 가릴 수 있어야 한다. */}
            <p className="text-xs text-gray-600">프로젝트 {projectId}</p>
        </div>
    );
}

function FailedWorksheetsNotice({ failedKeys, projectId }: { failedKeys: string[]; projectId: string }) {
    return (
        <div className="card border-amber-500/40 bg-amber-500/10">
            <p className="text-sm text-amber-200">
                <span className="font-semibold">{failedKeys.length}개 워크시트를 불러오지 못했습니다.</span>{' '}
                해당 절은 빈 채로 문서에 들어갑니다 — {failedKeys.join(', ')}
            </p>
            <p className="mt-1 text-xs text-amber-200/70">
                프로젝트 {projectId} · 권한이 없거나(코치명 등) 아직 입력하지 않은 워크시트라면 정상입니다.
            </p>
        </div>
    );
}

export default function FinalReportPage() {
    const params = useParams();
    const projectId = String(params.id);

    const { payloads, isLoading, loadedCount, failedKeys } = useWorksheetPayloads(projectId);
    const [freeInput, setFreeInput] = useState<FinalReportFreeInput>(EMPTY_FREE_INPUT);
    const [progressMessage, setProgressMessage] = useState<string | null>(null);
    // 원본은 되돌리기와 "몇 곳 고쳤는지"를 위해 그대로 남기고, 편집은 사본에만 쌓는다.
    const [originalModel, setOriginalModel] = useState<FinalReportModel | null>(null);
    const [editedModel, setEditedModel] = useState<FinalReportModel | null>(null);
    const { toast, showToast } = useToast();

    const worksheets = useMemo(
        () => (payloads ? buildWorksheetData(payloads as unknown as WorksheetPayloads) : null),
        [payloads],
    );

    // WS-7 만 projectId 가 아니라 점 배열을 주입받는다. Kano 분석 응답에는 요구사항
    // 문구가 없어 요구사항 목록과 id 로 이어 붙여야 한다.
    const kanoPoints = useMemo(
        () => (worksheets ? toKanoChartPoints(worksheets.kanoAggregation, worksheets.requirements) : []),
        [worksheets],
    );

    const handleBuildPreview = useCallback(async () => {
        if (!worksheets || !payloads) return;
        setProgressMessage(`0/${CAPTURE_TARGETS.length} 캡처 중...`);
        try {
            const images = await captureWorksheetImages(setProgressMessage);
            setProgressMessage('문서 만드는 중...');
            const built = buildFinalReportModel(buildOverviewInput(payloads), worksheets, freeInput, images);
            setOriginalModel(built);
            setEditedModel(built);
            showToast('미리보기를 만들었습니다. 확인하고 고친 뒤 내려받으세요.');
        } catch (error) {
            showToast(error instanceof Error ? error.message : '미리보기 생성에 실패했습니다.', 'error');
        } finally {
            setProgressMessage(null);
        }
    }, [worksheets, payloads, freeInput, showToast]);

    const handleEdit = useCallback((edit: BlockEdit) => {
        setEditedModel((prev) => (prev ? withEditedBlocks(prev, applyBlockEdit(prev.blocks, edit)) : prev));
    }, []);

    const handleDownload = useCallback(async () => {
        if (!editedModel) return;
        setProgressMessage('문서 만드는 중...');
        try {
            downloadBlobAsFile(await requestReportDocx(projectId, editedModel), editedModel.fileName);
            showToast('결과보고서를 내려받았습니다.');
        } catch (error) {
            showToast(error instanceof Error ? error.message : '문서를 만들지 못했습니다.', 'error');
        } finally {
            setProgressMessage(null);
        }
    }, [editedModel, projectId, showToast]);

    if (isLoading) {
        return <WorksheetLoading loadedCount={loadedCount} projectId={projectId} />;
    }

    const requirementCount = worksheets?.requirements.length ?? 0;
    const editedCount = originalModel && editedModel ? countEditedBlocks(originalModel.blocks, editedModel.blocks) : 0;

    return (
        <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6">
            {toast && <HeaderToast message={toast.message} type={toast.type} />}

            {failedKeys.length > 0 && <FailedWorksheetsNotice failedKeys={failedKeys} projectId={projectId} />}

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-white">결과보고서</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        워크시트에 입력한 값으로 KS-QFD 결과보고서를 만듭니다. 아래 세 화면은 그림으로 첨부됩니다.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/project/${projectId}`} className="btn-secondary text-sm">워크시트로</Link>
                    <button onClick={handleBuildPreview} disabled={progressMessage !== null} className="btn-secondary text-sm disabled:opacity-50">
                        {progressMessage ?? (editedModel ? '미리보기 다시 만들기' : '미리보기 만들기')}
                    </button>
                    <button onClick={handleDownload} disabled={progressMessage !== null || !editedModel} className="btn-primary text-sm disabled:opacity-50">
                        Word 내려받기
                    </button>
                </div>
            </div>

            <FinalReportFreeInputs value={freeInput} onChange={setFreeInput} />

            {editedModel && originalModel && (
                <section className="card space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="text-lg font-semibold text-white">미리보기 · 교정</h2>
                            <p className="mt-1 text-sm text-gray-500">
                                문서에 들어갈 내용입니다. 칸을 눌러 바로 고칠 수 있고, 고친 내용은 워크시트에 저장되지 않습니다.
                                {editedCount > 0 && <span className="ml-1 text-amber-300">{editedCount}곳 교정함</span>}
                            </p>
                        </div>
                        <button
                            onClick={() => setEditedModel(originalModel)}
                            disabled={editedCount === 0}
                            className="btn-secondary text-sm disabled:opacity-40"
                        >
                            원본으로 되돌리기
                        </button>
                    </div>
                    <FinalReportPreview blocks={editedModel.blocks} onEdit={handleEdit} />
                </section>
            )}

            <FinalReportCaptureStage projectId={projectId} kanoPoints={kanoPoints} requirementCount={requirementCount} />
        </div>
    );
}
