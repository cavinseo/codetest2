'use client';
// 결과보고서(.docx) 생성 화면이다.
//
// 표 절은 기존 워크시트 API 값을 그대로 쓰고, 표로 재현하기 어려운 세 곳
// (WS-4 적합도·WS-7 산점도·WS-9 QFD 관계도)만 화면을 그려 두었다가 그림으로 캡처한다.
// 문서 조립과 직렬화까지 브라우저에서 끝낸다 — 그림이 브라우저에만 있고, 서버로
// 올리면 요청 본문 한도에 걸릴 수 있기 때문이다. 새 서버 라우트는 쓰지 않는다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import HeaderToast from '@/components/HeaderToast';
import { useToast } from '@/components/useToast';
import FitnessWrapper from '@/components/project/FitnessWrapper';
import KanoSatisfactionGraph from '@/components/project/KanoSatisfactionGraph';
import QFDMatrix from '@/components/project/QFDMatrix';
import { buildWorksheetData, pickCoachName, toKanoChartPoints, type WorksheetPayloads } from '@/lib/final-report-inputs';
import FinalReportPreview from '@/components/project/FinalReportPreview';
import { buildFinalReportModel, type CapturedWorksheetImage, type FinalReportFreeInput, type FinalReportModel } from '@/lib/final-report-document';
import { applyBlockEdit, countEditedBlocks, withEditedBlocks, type BlockEdit } from '@/lib/final-report-edit';
import { renderFinalReportDocx } from '@/lib/final-report-docx';
import { captureWorksheetNode } from '@/lib/worksheet-capture';

/** 캡처 컨테이너의 고정 폭. 화면 폭에 따라 캡처 결과가 달라지지 않게 한다. */
const CAPTURE_WIDTH_PX = 1280;

const CAPTURE_TARGETS: Array<{ id: CapturedWorksheetImage['worksheetId']; title: string }> = [
    { id: 'fitness', title: '제품/서비스 속성 적합도' },
    { id: 'kano-aggregation', title: 'Kano 2D 산점도' },
    { id: 'qfd', title: '고객수요기반 기술스펙 관계도' },
];

const EMPTY_FREE_INPUT: FinalReportFreeInput = {
    productImageDataUrl: null,
    productImageWidthPx: null,
    productImageHeightPx: null,
    marketDefinition: '',
    targetCustomer: '',
    finalSpecExplanation: '',
    improvedProductName: '',
    improvedProductDescription: '',
};

const FREE_FIELDS: Array<{ key: keyof FinalReportFreeInput; label: string; placeholder: string }> = [
    { key: 'marketDefinition', label: '시장정의', placeholder: '어떤 시장을 대상으로 하는지 서술하세요.' },
    { key: 'targetCustomer', label: '목표고객', placeholder: '핵심 목표고객을 서술하세요.' },
    { key: 'finalSpecExplanation', label: '최종 목표 스펙 항목별 설명', placeholder: '스펙별로 무엇이 달라지는지 서술하세요.' },
    { key: 'improvedProductName', label: '개선 제품(서비스)명', placeholder: '개선 후 제품명' },
    { key: 'improvedProductDescription', label: '개선 제품설명', placeholder: '개선 후 제품 설명' },
];

/**
 * 한 라우트가 늦어도 화면 전체가 멈추지 않도록 끊는 시간.
 * 넉넉히 잡은 이유는 dev 서버가 이 화면에서 처음 열두 라우트를 그 자리에서
 * 컴파일하기 때문이다. 짧게 끊으면 첫 진입에서 모든 절이 빈 채로 그려진다.
 * 컴파일이 끝난 뒤와 배포판에서는 이 시간까지 갈 일이 없다.
 */
const FETCH_TIMEOUT_MS = 60000;

async function getJson(url: string): Promise<unknown> {
    // 타임아웃이 없으면 라우트 하나가 응답하지 않을 때 화면이 영영 로딩 상태로 남는다.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal });
        // 코치명 라우트는 권한이 없으면 403 이다. 그것 하나 때문에 보고서 생성이
        // 막히면 안 되므로 실패는 전부 빈 값으로 떨어뜨린다.
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export default function FinalReportPage() {
    const params = useParams();
    const projectId = String(params.id);

    const [payloads, setPayloads] = useState<Record<string, unknown> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // 어디까지 받았는지 보여 준다. 열두 곳을 한꺼번에 부르므로 멈춘 것과 느린 것을 구별해야 한다.
    const [loadedCount, setLoadedCount] = useState(0);
    const [free, setFree] = useState<FinalReportFreeInput>(EMPTY_FREE_INPUT);
    const [progress, setProgress] = useState<string | null>(null);
    // 원본은 되돌리기와 "몇 곳 고쳤는지"를 위해 그대로 남기고, 편집은 draft 에만 쌓는다.
    const [model, setModel] = useState<FinalReportModel | null>(null);
    const [draft, setDraft] = useState<FinalReportModel | null>(null);
    const { toast, showToast } = useToast();

    useEffect(() => {
        const base = `/api/projects/${projectId}`;
        const urls = {
            overview: `${base}/overview`,
            exportData: `${base}/export`,
            sales: `${base}/sales`,
            kanoAnalysis: `${base}/kano/analysis`,
            qfdAnalysis: `${base}/qfd/analysis`,
            improvements: `${base}/improvements`,
            techTree: `${base}/tech-tree`,
            targetSpec: `${base}/target-spec`,
            techRoadmap: `${base}/tech-roadmap`,
            assets: `${base}/assets`,
            funding: `${base}/funding`,
            mentors: `${base}/mentors`,
        };
        const keys = Object.keys(urls) as Array<keyof typeof urls>;
        Promise.all(keys.map((key) => getJson(urls[key]).then((result) => {
            setLoadedCount((count) => count + 1);
            return result;
        })))
            .then((results) => setPayloads(Object.fromEntries(keys.map((key, i) => [key, results[i]]))))
            .finally(() => setIsLoading(false));
    }, [projectId]);

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

    const updateFree = (key: keyof FinalReportFreeInput, value: string) =>
        setFree((prev) => ({ ...prev, [key]: value }));

    const handleImage = (file: File | undefined) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result);
            // 원본 픽셀 크기를 함께 넘겨야 모델이 비율을 지킨다. 못 구하면 모델이
            // 고정 크기로 떨어뜨리므로 여기서 실패해도 보고서는 나온다.
            const image = new Image();
            image.onload = () => setFree((prev) => ({
                ...prev,
                productImageDataUrl: dataUrl,
                productImageWidthPx: image.naturalWidth,
                productImageHeightPx: image.naturalHeight,
            }));
            image.onerror = () => setFree((prev) => ({
                ...prev, productImageDataUrl: dataUrl, productImageWidthPx: null, productImageHeightPx: null,
            }));
            image.src = dataUrl;
        };
        reader.readAsDataURL(file);
    };

    const handleBuildPreview = useCallback(async () => {
        if (!worksheets || !payloads) return;
        setProgress('0/3 캡처 중...');
        try {
            const images: CapturedWorksheetImage[] = [];
            for (const [index, target] of CAPTURE_TARGETS.entries()) {
                setProgress(`${index}/3 캡처 중...`);
                const node = document.querySelector<HTMLElement>(`[data-worksheet-id="${target.id}"]`);
                if (!node) throw new Error(`${target.title} 화면을 찾지 못했습니다.`);
                const shot = await captureWorksheetNode(node);
                images.push({ worksheetId: target.id, title: target.title, ...shot });
            }
            setProgress('문서 만드는 중...');

            const project = (payloads.overview as { project?: { name?: string; description?: string | null } } | null)?.project;
            const model = buildFinalReportModel(
                {
                    projectName: project?.name ?? '프로젝트',
                    description: project?.description ?? null,
                    coachName: pickCoachName(payloads.mentors),
                    // 문서에 그대로 찍히는 값이라 ISO 가 아니라 사람이 읽는 날짜로 넘긴다.
                    generatedAt: new Date().toLocaleDateString('ko-KR'),
                },
                worksheets,
                free,
                images,
            );

            setModel(model);
            setDraft(model);
            showToast('미리보기를 만들었습니다. 확인하고 고친 뒤 내려받으세요.');
        } catch (error) {
            showToast(error instanceof Error ? error.message : '미리보기 생성에 실패했습니다.', 'error');
        } finally {
            setProgress(null);
        }
    }, [worksheets, payloads, free, showToast]);

    const handleEdit = useCallback((edit: BlockEdit) => {
        setDraft((prev) => (prev ? withEditedBlocks(prev, applyBlockEdit(prev.blocks, edit)) : prev));
    }, []);

    const handleDownload = useCallback(async () => {
        if (!draft) return;
        setProgress('문서 만드는 중...');
        try {
            const blob = await renderFinalReportDocx(draft);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = draft.fileName;
            // 문서에 붙였다가 눌러야 한다. 붙이지 않은 요소의 click 을 무시하는 브라우저가 있다.
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            // 누른 직후 바로 해제하면 내려받기가 시작되기 전에 주소가 무효가 될 수 있다.
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            showToast('결과보고서를 내려받았습니다.');
        } catch (error) {
            showToast(error instanceof Error ? error.message : '문서를 만들지 못했습니다.', 'error');
        } finally {
            setProgress(null);
        }
    }, [draft, showToast]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 p-12">
                <div className="animate-spin h-7 w-7 border-2 border-primary-500 border-t-transparent rounded-full" />
                <p className="text-sm text-gray-500">워크시트 불러오는 중 {loadedCount}/12</p>
                {/* 주소의 프로젝트 식별자를 그대로 보여 준다. 안내문의 자리표시자를 그대로
                    넣어 열었던 일이 있어, 화면만 보고도 그 경우를 가릴 수 있어야 한다. */}
                <p className="text-xs text-gray-600">프로젝트 {projectId}</p>
            </div>
        );
    }

    const requirementCount = worksheets?.requirements.length ?? 0;
    const editedCount = model && draft ? countEditedBlocks(model.blocks, draft.blocks) : 0;

    return (
        <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6">
            {toast && <HeaderToast message={toast.message} type={toast.type} />}

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-white">결과보고서</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        워크시트에 입력한 값으로 KS-QFD 결과보고서를 만듭니다. 아래 세 화면은 그림으로 첨부됩니다.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/project/${projectId}`} className="btn-secondary text-sm">워크시트로</Link>
                    <button onClick={handleBuildPreview} disabled={progress !== null} className="btn-secondary text-sm disabled:opacity-50">
                        {progress ?? (draft ? '미리보기 다시 만들기' : '미리보기 만들기')}
                    </button>
                    <button onClick={handleDownload} disabled={progress !== null || !draft} className="btn-primary text-sm disabled:opacity-50">
                        Word 내려받기
                    </button>
                </div>
            </div>

            <div className="card space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">보고서에만 쓰는 항목</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        워크시트에 저장할 자리가 없는 항목입니다. 저장되지 않으니 생성 전에 채워 주세요.
                    </p>
                </div>
                <label className="block text-sm text-gray-300">
                    제품/서비스 이미지
                    <input type="file" accept="image/*" onChange={(event) => handleImage(event.target.files?.[0])} className="input-field block mt-1" />
                </label>
                {free.productImageDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- 업로드한 dataURL 미리보기라 최적화 대상이 아니다.
                    <img src={free.productImageDataUrl} alt="제품 이미지 미리보기" className="max-h-40 rounded border border-white/10" />
                )}
                {FREE_FIELDS.map((field) => (
                    <label key={field.key} className="block text-sm text-gray-300">
                        {field.label}
                        <textarea
                            value={String(free[field.key] ?? '')}
                            onChange={(event) => updateFree(field.key, event.target.value)}
                            placeholder={field.placeholder}
                            rows={2}
                            className="input-field block w-full mt-1"
                        />
                    </label>
                ))}
            </div>

            {draft && model && (
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
                            onClick={() => setDraft(model)}
                            disabled={editedCount === 0}
                            className="btn-secondary text-sm disabled:opacity-40"
                        >
                            원본으로 되돌리기
                        </button>
                    </div>
                    <FinalReportPreview blocks={draft.blocks} onEdit={handleEdit} />
                </section>
            )}

            <div className="space-y-6">
                <p className="text-sm text-gray-500">
                    아래 세 화면이 그대로 그림으로 들어갑니다. 값이 다 나온 뒤에 「미리보기 만들기」를 누르세요.
                </p>

                <section className="card p-0 overflow-hidden">
                    <h3 className="px-4 py-3 text-sm font-semibold text-white border-b border-white/[0.06]">[WS-4] 제품속성적합도</h3>
                    <div data-worksheet-id="fitness" style={{ width: CAPTURE_WIDTH_PX }} className="p-4">
                        <FitnessWrapper projectId={projectId} />
                    </div>
                </section>

                <section className="card p-0 overflow-hidden">
                    <h3 className="px-4 py-3 text-sm font-semibold text-white border-b border-white/[0.06]">[WS-7] TIMKO/만족계수 그래프</h3>
                    <div data-worksheet-id="kano-aggregation" style={{ width: CAPTURE_WIDTH_PX }} className="p-4">
                        {kanoPoints.length > 0
                            ? <KanoSatisfactionGraph analysis={kanoPoints} />
                            : <p className="text-sm text-gray-500">Kano 응답이 없어 산점도를 그릴 수 없습니다. (요구사항 {requirementCount}개)</p>}
                    </div>
                </section>

                <section className="card p-0 overflow-hidden">
                    <h3 className="px-4 py-3 text-sm font-semibold text-white border-b border-white/[0.06]">[WS-9] QFD</h3>
                    <div data-worksheet-id="qfd" style={{ width: CAPTURE_WIDTH_PX }} className="p-4">
                        <QFDMatrix projectId={projectId} />
                    </div>
                </section>
            </div>
        </div>
    );
}
