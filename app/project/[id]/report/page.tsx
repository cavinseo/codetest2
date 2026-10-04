'use client';
// 배정 멘토의 보고서 초안을 저장하고 완료한 문서만 참여자에게 공개한다.
// 화면의 문서 모델을 서버에 보내 Word 파일로 직렬화한다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import HeaderToast from '@/components/HeaderToast';
import { useToast } from '@/components/useToast';
import FinalReportCaptureStage from '@/components/project/FinalReportCaptureStage';
import FinalReportPreview from '@/components/project/FinalReportPreview';
import FinalReportPages from '@/components/project/FinalReportPages';
import { buildWorksheetData, toKanoChartPoints, type WorksheetPayloads } from '@/lib/final-report-inputs';
import { buildFinalReportModel, hasProductOverviewSource, hasWorksheetImageSlot, replaceWorksheetImages, CAPTURED_WORKSHEET_TITLES, type CapturedWorksheetImage, type FinalReportFreeInput, type FinalReportModel, type FinalReportOverviewInput, type FinalReportWorksheetData } from '@/lib/final-report-document';
import { applyBlockEdit, countEditedBlocks, withEditedBlocks, type BlockEdit } from '@/lib/final-report-edit';
import { REPORT_MAX_BYTES, type ReportDraft } from '@/lib/final-report-payload';
import { optimizeReportImage } from '@/lib/final-report-image';
import { captureWorksheetNode, waitForWorksheetReady } from '@/lib/worksheet-capture';
import { reportOutputDate, withReportOutputDate } from '@/lib/final-report-layout';
import { refreshWorksheetTables } from '@/lib/final-report-table-refresh';

const CAPTURE_TARGETS = Object.entries(CAPTURED_WORKSHEET_TITLES) as Array<[CapturedWorksheetImage['worksheetId'], string]>;
const EMPTY_FREE_INPUT: FinalReportFreeInput = {
    productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null,
    marketDefinition: '', targetCustomer: '', finalSpecExplanation: '', improvedProductName: '', improvedProductDescription: '',
};
const FREE_FIELDS: Array<{ key: keyof FinalReportFreeInput; label: string; placeholder: string }> = [
    { key: 'marketDefinition', label: '시장정의', placeholder: '어떤 시장을 대상으로 하는지 서술하세요.' },
    { key: 'targetCustomer', label: '목표고객', placeholder: '핵심 목표고객을 서술하세요.' },
    { key: 'finalSpecExplanation', label: '최종 목표 스펙 항목별 설명', placeholder: '스펙별로 무엇이 달라지는지 서술하세요.' },
    { key: 'improvedProductName', label: '개선 제품(서비스)명', placeholder: '개선 후 제품명' },
    { key: 'improvedProductDescription', label: '개선 제품설명', placeholder: '개선 후 제품 설명' },
];
interface ReportMetadata {
    version: number;
    hasPublishedReport: boolean;
    hasUnpublishedChanges: boolean;
    publishedAt: string | null;
    updatedAt: string | null;
}
interface ReportResponse extends ReportMetadata {
    canEdit: boolean;
    mentorName: string | null;
    companyName?: string | null;
    view: 'draft' | 'published';
    draft?: ReportDraft | null;
    document?: FinalReportModel | null;
}
interface ReportNavigation extends EventTarget {
    currentEntry: { key: string } | null;
    traverseTo(key: string): { finished: Promise<unknown> };
}
interface ReportNavigateEvent extends Event {
    navigationType: string;
    destination: { key: string; sameDocument: boolean; url: string };
}
type PendingNavigation = { historyKey: string } | { href: string; replace?: boolean };

async function requestReport(url: string, method = 'GET', body?: string): Promise<ReportResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
        const response = await fetch(url, {
            method, signal: controller.signal, cache: 'no-store',
            ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body }),
        });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 409) throw new Error('다른 창에서 보고서가 변경되었거나 멘토 배정이 바뀌었습니다. 현재 입력은 유지됩니다. 저장 상태와 배정을 확인한 후 다시 열어 주세요.');
            throw new Error(data.error || '결과보고서를 처리하지 못했습니다.');
        }
        return data;
    } catch (error) {
        if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
            throw new Error('서버 응답을 확인하지 못했습니다. 현재 입력은 유지됩니다. 다시 시도하기 전에 다른 창에서 저장 상태를 확인해 주세요.');
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function getWorksheetJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
        const response = await fetch(url, { signal: controller.signal });
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function reportCaptureTargets(imagesOnly: boolean, document: FinalReportModel | null, worksheets: FinalReportWorksheetData) {
    const usesSampleTemplate = !imagesOnly || document?.blocks.some(block => block.kind === 'cover');
    const targets = CAPTURE_TARGETS.filter(([worksheetId, title]) => {
        if (!usesSampleTemplate) return true;
        if (imagesOnly) return document?.blocks.some(block => block.kind === 'image' && block.title === title)
            || (worksheetId === 'fitness' && Boolean(worksheets.fitnessMatrix) && document && hasWorksheetImageSlot(document, worksheetId));
        if (worksheetId === 'fitness') return Boolean(worksheets.fitnessMatrix);
        if (worksheetId === 'kano-aggregation') return worksheets.kanoAggregation.some(row => row.responseCount > 0);
        return false;
    });
    return { usesSampleTemplate, targets };
}

async function captureReportImage(stage: HTMLDivElement | null, worksheetId: CapturedWorksheetImage['worksheetId'], title: string, graphOnly: boolean): Promise<CapturedWorksheetImage> {
    const node = stage?.querySelector<HTMLElement>(`[data-worksheet-id="${worksheetId}"]`);
    if (!node) throw new Error(`${title} 화면을 찾지 못했습니다.`);
    await waitForWorksheetReady(node, title);
    const chart = graphOnly ? node.querySelector<SVGSVGElement>('.timko-chart') : null;
    const captureNode = chart?.parentElement ?? node;
    const originalStyle = captureNode.getAttribute('style');
    try {
        // 그래프 바깥의 화면 여백이 함께 축소되어 글자가 작아지지 않게 한다.
        if (chart) captureNode.style.width = `${chart.getBoundingClientRect().width}px`;
        const shot = await captureWorksheetNode(captureNode, { pixelRatio: 1.5 });
        const image = await optimizeReportImage(shot.pngDataUrl);
        return { worksheetId, title, pngDataUrl: image.dataUrl, widthPx: image.widthPx, heightPx: image.heightPx };
    } finally {
        if (originalStyle === null) captureNode.removeAttribute('style');
        else captureNode.setAttribute('style', originalStyle);
    }
}

export default function FinalReportPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = String(params.id);
    const reportUrl = `/api/projects/${projectId}/report`;
    const [report, setReport] = useState<ReportResponse | null>(null);
    const [initialError, setInitialError] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<'draft' | 'published'>('published');
    const [publishedDocument, setPublishedDocument] = useState<FinalReportModel | null>(null);
    const [publishedAt, setPublishedAt] = useState<string | null>(null);
    const [payloads, setPayloads] = useState<Record<string, unknown> | null>(null);
    const [worksheetsLoading, setWorksheetsLoading] = useState(false);
    const [captureRevision, setCaptureRevision] = useState(0);
    const [loadedCount, setLoadedCount] = useState(0);
    const [failedKeys, setFailedKeys] = useState<string[]>([]);
    const [free, setFree] = useState<FinalReportFreeInput>(EMPTY_FREE_INPUT);
    const [model, setModel] = useState<FinalReportModel | null>(null);
    const [draft, setDraft] = useState<FinalReportModel | null>(null);
    const [previewNeedsRefresh, setPreviewNeedsRefresh] = useState(false);
    const [hasLocalChanges, setHasLocalChanges] = useState(false);
    const [progress, setProgress] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<'publish' | 'rebuild' | 'leave' | null>(null);
    const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
    const allowNavigation = useRef(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const busy = useRef(false);
    const captureStage = useRef<HTMLDivElement>(null);
    const reportPreview = useRef<HTMLDivElement>(null);
    const legacyPdfPreview = useRef<HTMLDivElement>(null);
    const worksheetLoad = useRef(0);
    const { toast, showToast } = useToast();

    const loadWorksheets = useCallback(async () => {
        const generation = ++worksheetLoad.current;
        setWorksheetsLoading(true);
        setLoadedCount(0);
        const base = `/api/projects/${projectId}`;
        const urls = {
            overview: `${base}/overview`, exportData: `${base}/export`, sales: `${base}/sales`,
            kanoAnalysis: `${base}/kano/analysis`, qfdAnalysis: `${base}/qfd/analysis`,
            improvements: `${base}/improvements`, techTree: `${base}/tech-tree`, targetSpec: `${base}/target-spec`,
            techRoadmap: `${base}/tech-roadmap`, assets: `${base}/assets`, funding: `${base}/funding`,
        };
        const keys = Object.keys(urls) as Array<keyof typeof urls>;
        const results: unknown[] = [];
        // DB 커넥션을 한꺼번에 점유하지 않도록 세 요청씩 불러온다.
        for (let start = 0; start < keys.length; start += 3) {
            if (generation !== worksheetLoad.current) return;
            const done = await Promise.all(keys.slice(start, start + 3).map(async (key) => {
                const value = await getWorksheetJson(urls[key]);
                if (generation === worksheetLoad.current) setLoadedCount(count => count + 1);
                return value;
            }));
            results.push(...done);
        }
        if (generation !== worksheetLoad.current) return;
        const loaded = Object.fromEntries(keys.map((key, index) => [key, results[index]]));
        setPayloads(loaded);
        setFailedKeys(keys.filter((_, index) => results[index] === null));
        setWorksheetsLoading(false);
        return results.some(value => value === null) ? null : loaded;
    }, [projectId]);

    useEffect(() => {
        let cancelled = false;
        setReport(null);
        setInitialError(null);
        setPayloads(null);
        setHasLocalChanges(false);
        void requestReport(reportUrl).then(data => {
            if (cancelled) return;
            setReport(data);
            setActiveView(data.view);
            setPublishedAt(data.publishedAt);
            setPublishedDocument(data.view === 'published' ? data.document ?? null : null);
            setFree(data.draft?.free ?? EMPTY_FREE_INPUT);
            setDraft(data.draft?.document ?? null);
            setModel(data.draft?.document ?? null);
            setPreviewNeedsRefresh(data.draft?.previewNeedsRefresh ?? false);
            if (data.canEdit) void loadWorksheets();
        }).catch(error => {
            if (!cancelled) setInitialError(error instanceof Error ? error.message : '결과보고서를 불러오지 못했습니다.');
        });
        return () => { cancelled = true; worksheetLoad.current += 1; };
    }, [reportUrl, loadWorksheets]);

    useEffect(() => {
        if (confirmation && dialog.current && !dialog.current.open) dialog.current.showModal();
    }, [confirmation]);

    useEffect(() => {
        if (!hasLocalChanges) return;
        allowNavigation.current = false;
        const navigation = (window as Window & { navigation?: ReportNavigation }).navigation;
        const currentUrl = window.location.href;
        const currentHistory = window.history.state;
        const currentKey = navigation?.currentEntry?.key;
        let restoringHistory = false;
        const warn = (event: BeforeUnloadEvent) => { if (!allowNavigation.current) event.preventDefault(); };
        const guardNavigation = (event: Event) => {
            const navigationEvent = event as ReportNavigateEvent;
            if (allowNavigation.current || restoringHistory || event.defaultPrevented || !event.cancelable
                || navigationEvent.navigationType !== 'traverse' || !navigationEvent.destination.sameDocument) return;
            event.preventDefault();
            setPendingNavigation({ historyKey: navigationEvent.destination.key });
            setConfirmation('leave');
        };
        const guardHistory = (event: PopStateEvent) => {
            if (allowNavigation.current) return;
            event.stopImmediatePropagation();
            if (restoringHistory) {
                if (navigation?.currentEntry?.key === currentKey) restoringHistory = false;
                return;
            }
            const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            const destinationKey = navigation?.currentEntry?.key;
            if (navigation && currentKey && destinationKey) {
                // 취소 불가능한 traverse도 기존 이력 항목으로 복귀해 앞으로가기 이력을 보존한다.
                restoringHistory = true;
                void navigation.traverseTo(currentKey).finished.then(() => {
                    setPendingNavigation({ historyKey: destinationKey });
                    setConfirmation('leave');
                }).catch(() => { restoringHistory = false; });
                return;
            }
            // Navigation API가 없는 브라우저에서는 우선 현재 교정을 보존한다.
            window.history.pushState(currentHistory, '', currentUrl);
            setPendingNavigation({ href: destination, replace: true });
            setConfirmation('leave');
        };
        // 공통 메뉴의 Next Link도 보고서 페이지에서 막아 미저장 교정이 사라지지 않게 한다.
        const guardInternalLink = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
            if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download')) return;
            if (link.target && link.target.toLowerCase() !== '_self') return;
            const destination = new URL(link.href, window.location.href);
            if (destination.origin !== window.location.origin) return;
            if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            setPendingNavigation({ href: `${destination.pathname}${destination.search}${destination.hash}` });
            setConfirmation('leave');
        };
        window.addEventListener('beforeunload', warn);
        navigation?.addEventListener('navigate', guardNavigation);
        window.addEventListener('popstate', guardHistory, true);
        document.addEventListener('click', guardInternalLink, true);
        return () => {
            window.removeEventListener('beforeunload', warn);
            navigation?.removeEventListener('navigate', guardNavigation);
            window.removeEventListener('popstate', guardHistory, true);
            document.removeEventListener('click', guardInternalLink, true);
        };
    }, [hasLocalChanges]);

    const worksheets = useMemo(() => payloads ? buildWorksheetData(payloads as unknown as WorksheetPayloads) : null, [payloads]);
    const kanoPoints = useMemo(() => worksheets ? toKanoChartPoints(worksheets.kanoAggregation, worksheets.requirements) : [], [worksheets]);
    const editing = report?.canEdit && activeView === 'draft';
    const overviewSource = (payloads?.overview as { project?: Partial<FinalReportOverviewInput> & { name?: string } } | null)?.project;
    const usesOverview = hasProductOverviewSource(overviewSource ?? {});
    const worksheetAnalysis = report?.draft?.worksheetAnalysis;
    const legacyFields = FREE_FIELDS.filter(field => {
        if (field.key === 'marketDefinition' || field.key === 'targetCustomer') return !usesOverview;
        if (field.key === 'finalSpecExplanation') return worksheetAnalysis?.['target-spec'] === undefined;
        return worksheetAnalysis?.['tech-roadmap'] === undefined;
    });
    const shownDocument = activeView === 'published' ? publishedDocument : draft;
    const editedCount = model && draft ? countEditedBlocks(model.blocks, draft.blocks) : 0;

    function begin(label: string) {
        if (busy.current) return false;
        busy.current = true;
        setProgress(label);
        setActionError(null);
        return true;
    }
    function finish() { busy.current = false; setProgress(null); }
    function fail(error: unknown, fallback: string) { setActionError(error instanceof Error ? error.message : fallback); }
    function updateFree(patch: Partial<FinalReportFreeInput>) {
        if (busy.current) return;
        setFree(previous => ({ ...previous, ...patch }));
        if (draft) setPreviewNeedsRefresh(true);
        setHasLocalChanges(true);
    }
    async function handleImage(file: File | undefined) {
        if (!file || !begin('이미지 최적화 중...')) return;
        try {
            const image = await optimizeReportImage(file);
            setFree(previous => ({ ...previous, productImageDataUrl: image.dataUrl, productImageWidthPx: image.widthPx, productImageHeightPx: image.heightPx }));
            if (draft) setPreviewNeedsRefresh(true);
            setHasLocalChanges(true);
        } catch (error) { fail(error, '이미지를 처리하지 못했습니다.'); }
        finally { finish(); }
    }
    async function handleBuildPreview(imagesOnly = false) {
        if (!worksheets || !payloads || !report?.canEdit || worksheetsLoading || failedKeys.length || !begin('보고서 원본 확인 중...')) return;
        try {
            const latest = await requestReport(reportUrl);
            if (!latest.canEdit || latest.version !== report.version) {
                throw new Error('다른 화면에서 분석 또는 보고서가 변경되었습니다. 워크시트를 다시 불러온 뒤 미리보기를 만들어 주세요. 현재 교정 내용은 유지됩니다.');
            }
            const images: CapturedWorksheetImage[] = [];
            const { usesSampleTemplate, targets } = reportCaptureTargets(imagesOnly, draft, worksheets);
            for (const [index, [id, title]] of targets.entries()) {
                setProgress(`${index + 1}/${targets.length} 그림 만드는 중...`);
                images.push(await captureReportImage(captureStage.current, id, title, Boolean(usesSampleTemplate && id === 'kano-aggregation')));
            }
            if (imagesOnly && draft) {
                const nextDraft = replaceWorksheetImages(draft, images);
                const nextModel = model ? replaceWorksheetImages(model, images) : nextDraft;
                setDraft(nextDraft);
                setModel(nextModel);
                setHasLocalChanges(true);
                showToast('워크시트 그림을 반영했습니다. 문구와 표는 유지됩니다. 초안을 저장해 주세요.');
                return;
            }
            setProgress('문서 만드는 중...');
            const project = overviewSource;
            const next = buildFinalReportModel({
                ...project,
                projectName: project?.name ?? '프로젝트', description: project?.description ?? null,
                companyName: latest.companyName ?? null, coachName: latest.mentorName, generatedAt: reportOutputDate(),
            }, worksheets, free, images, worksheetAnalysis);
            setModel(next);
            setDraft(next);
            setPreviewNeedsRefresh(false);
            setHasLocalChanges(true);
            showToast('미리보기를 만들었습니다. 내용을 확인하고 저장하거나 완료해 주세요.');
        } catch (error) { fail(error, '미리보기 생성에 실패했습니다.'); }
        finally { finish(); }
    }
    async function handleRefreshTables() {
        if (!draft || !report?.canEdit || !begin('워크시트 표 불러오는 중...')) return;
        try {
            const latest = await requestReport(reportUrl);
            if (!latest.canEdit || latest.version !== report.version) throw new Error('다른 화면에서 보고서가 변경되었습니다. 새로 불러온 뒤 표를 반영해 주세요.');
            const loaded = await loadWorksheets();
            if (!loaded) throw new Error('워크시트 일부를 불러오지 못했습니다. 기존 보고서는 유지됩니다.');
            const generated = buildFinalReportModel({ projectName: '', description: null, coachName: null, generatedAt: reportOutputDate() }, buildWorksheetData(loaded as unknown as WorksheetPayloads), free, []);
            setDraft(refreshWorksheetTables(draft, generated));
            setModel(previous => previous ? refreshWorksheetTables(previous, generated) : generated);
            setHasLocalChanges(true);
            showToast('작성용 워크시트의 표를 반영했습니다. 설명 문단은 유지됩니다. 확인 후 초안을 저장해 주세요.');
        } catch (error) { fail(error, '워크시트 표 반영에 실패했습니다.'); }
        finally { finish(); }
    }
    function handleEdit(edit: BlockEdit) {
        if (busy.current || !editing) return;
        setDraft(previous => previous ? withEditedBlocks(previous, applyBlockEdit(previous.blocks, edit)) : previous);
        setHasLocalChanges(true);
    }
    async function saveDraft() {
        if (!report) throw new Error('보고서 정보를 불러온 후 저장해 주세요.');
        const savedDraft: ReportDraft = { free, document: draft, previewNeedsRefresh, ...(worksheetAnalysis ? { worksheetAnalysis } : {}) };
        const body = JSON.stringify({ version: report.version, draft: savedDraft });
        if (new TextEncoder().encode(body).byteLength > REPORT_MAX_BYTES) {
            throw new Error('보고서 저장 용량(3.5MB)을 초과했습니다. 제품 사진의 크기나 보고서 내용을 줄인 뒤 미리보기를 다시 만들어 주세요.');
        }
        const metadata = await requestReport(reportUrl, 'PUT', body);
        setReport(previous => previous ? { ...previous, ...metadata } : previous);
        setHasLocalChanges(false);
        return metadata;
    }
    async function handleSave() {
        if (!editing || !begin('초안 저장 중...')) return;
        try { await saveDraft(); showToast('결과보고서 초안을 저장했습니다.'); }
        catch (error) { fail(error, '초안 저장에 실패했습니다.'); }
        finally { finish(); }
    }
    async function reloadSources() {
        if (hasLocalChanges && !window.confirm('저장하지 않은 보고서 입력과 교정을 버리고 최신 저장본을 불러올까요?')) return;
        if (!begin('최신 분석과 워크시트 불러오는 중...')) return;
        try {
            const latest = await requestReport(reportUrl);
            setReport(latest); setActiveView(latest.view);
            setFree(latest.draft?.free ?? EMPTY_FREE_INPUT);
            setDraft(latest.draft?.document ?? null); setModel(latest.draft?.document ?? null);
            setPublishedDocument(latest.view === 'published' ? latest.document ?? null : publishedDocument);
            setPublishedAt(latest.publishedAt);
            setPreviewNeedsRefresh(Boolean(latest.draft?.document) || (latest.draft?.previewNeedsRefresh ?? false));
            setHasLocalChanges(Boolean(latest.canEdit));
            if (latest.canEdit) {
                setCaptureRevision(revision => revision + 1);
                await loadWorksheets();
            }
        } catch (error) { fail(error, '최신 분석을 불러오지 못했습니다.'); }
        finally { finish(); }
    }
    async function handlePublish() {
        setConfirmation(null);
        if (!editing || !draft || previewNeedsRefresh || !begin('최신 초안 저장 중...')) return;
        try {
            const saved = await saveDraft();
            setProgress('결과보고서 완료 중...');
            const metadata = await requestReport(reportUrl, 'POST', JSON.stringify({ version: saved.version }));
            setReport(previous => previous ? { ...previous, ...metadata } : previous);
            setPublishedDocument(draft);
            setPublishedAt(metadata.publishedAt);
            showToast('결과보고서를 완료했습니다. 멘티가 완료본을 열람할 수 있습니다.');
        } catch (error) { fail(error, '결과보고서 완료에 실패했습니다.'); }
        finally { finish(); }
    }
    async function showPublished() {
        if (!begin('완료본 불러오는 중...')) return;
        try {
            const published = await requestReport(`${reportUrl}?view=published`);
            setPublishedDocument(published.document ?? null);
            setPublishedAt(published.publishedAt);
            setActiveView('published');
        } catch (error) { fail(error, '완료본을 불러오지 못했습니다.'); }
        finally { finish(); }
    }
    async function handleDownload() {
        if (!shownDocument || !begin('Word 문서 만드는 중...')) return;
        try {
            // docx 패키지를 브라우저 번들에 포함하지 않도록 서버에서 직렬화한다.
            const res = await fetch(`/api/projects/${projectId}/report/docx`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(withReportOutputDate(shownDocument)),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || '문서를 만들지 못했습니다.');
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = shownDocument.fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            showToast('결과보고서를 내려받았습니다.');
        } catch (error) { fail(error, 'Word 문서를 만들지 못했습니다.'); }
        finally { finish(); }
    }

    async function handlePdfDownload() {
        if (!shownDocument || !begin('PDF 문서 만드는 중...')) return;
        try {
            const source = shownDocument.blocks.some(block => block.kind === 'cover') ? reportPreview.current : legacyPdfPreview.current;
            if (!source) throw new Error('PDF로 저장할 보고서 페이지가 없습니다.');
            const { createFinalReportPdf } = await import('@/lib/final-report-pdf');
            const blob = await createFinalReportPdf(source);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = shownDocument.fileName?.replace(/\.docx$/i, '.pdf') || '결과보고서.pdf';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            showToast('결과보고서를 내려받았습니다.');
        } catch (error) { fail(error, 'PDF 문서를 만들지 못했습니다.'); }
        finally { finish(); }
    }

    if (!report) return <div className="space-y-4 p-12">
        {initialError ? <p role="alert" className="text-red-400">{initialError}</p> : <p className="text-gray-400">결과보고서와 열람 권한을 확인하고 있습니다.</p>}
        <Link href={`/project/${projectId}`} className="btn-secondary inline-block text-sm">프로젝트로</Link>
    </div>;

    return <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6">
        {toast && <HeaderToast message={toast.message} type={toast.type} />}
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-white">결과보고서</h1>
                <p className="mt-1 text-sm text-gray-400">{activeView === 'published' ? '멘토가 완료한 결과보고서입니다.' : editing ? '배정 멘토가 작성하고 완료하면 멘티에게 공개됩니다.' : '저장된 초안을 열람하고 있습니다. 배정 멘토만 작성·완료할 수 있습니다.'}</p>
                {report.mentorName && <p className="mt-1 text-sm text-gray-400">배정 멘토 {report.mentorName}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Link href={`/project/${projectId}`} className="btn-secondary text-sm">워크시트로</Link>
                {report.view === 'draft' && activeView === 'published' && <button disabled={progress !== null} onClick={() => setActiveView('draft')} className="btn-secondary text-sm">{report.canEdit ? '초안 작성으로' : '초안 보기'}</button>}
                {report.hasPublishedReport && activeView === 'draft' && <button disabled={progress !== null} onClick={() => void showPublished()} className="btn-secondary text-sm">현재 공개본 보기</button>}
                {editing && <>
                    <button disabled={progress !== null} onClick={() => void handleSave()} className="btn-secondary text-sm disabled:opacity-50">초안 저장</button>
                    <button disabled={progress !== null || !draft || previewNeedsRefresh} onClick={() => setConfirmation('publish')} className="btn-primary text-sm disabled:opacity-50">완료</button>
                </>}
                <button disabled={progress !== null || !shownDocument} onClick={() => void handleDownload()} className="btn-secondary text-sm disabled:opacity-50">Word 내려받기</button>
                <button disabled={progress !== null || !shownDocument} onClick={() => void handlePdfDownload()} className="btn-secondary text-sm disabled:opacity-50">PDF 내려받기</button>
            </div>
        </div>

        {progress && <p role="status" className="text-sm text-primary-300">{progress}</p>}
        {actionError && <div role="alert" className="card border-red-500/40 text-sm text-red-300">{actionError}</div>}
        {activeView === 'draft' && <div className="card space-y-1 text-sm text-gray-400">
            <p>{hasLocalChanges ? '아직 저장하지 않은 변경사항이 있습니다.' : report.updatedAt ? `마지막 저장 ${new Date(report.updatedAt).toLocaleString('ko-KR')}` : '아직 저장된 초안이 없습니다.'}</p>
            <p>{report.hasPublishedReport ? (report.hasUnpublishedChanges || hasLocalChanges ? '수정 중에도 기존 완료본은 계속 공개됩니다. 다시 완료하면 새 문서로 교체됩니다.' : '현재 저장한 문서가 멘티에게 공개되어 있습니다.') : '멘토가 완료하기 전에는 멘티에게 보고서가 공개되지 않습니다.'}</p>
        </div>}
        {activeView === 'published' && <p className="text-sm text-gray-400">{publishedDocument ? `완료일 ${publishedAt ? new Date(publishedAt).toLocaleString('ko-KR') : ''}` : '아직 완료된 결과보고서가 없습니다. 멘토가 완료하면 이 화면에서 열람할 수 있습니다.'}</p>}

        {editing && <>
            <fieldset disabled={progress !== null} className="card space-y-4">
                <div><h2 className="text-lg font-semibold text-white">보고서 원본 연결</h2><p className="mt-1 text-sm text-gray-400">제품 정보는 개요에서, 분석은 각 워크시트의 ‘멘토 분석(보고)’에서 불러옵니다. 아래 보완 입력은 연결된 원본이 없는 항목에만 사용됩니다.</p></div>
                <div className="flex flex-wrap gap-3 text-sm text-primary-300">
                    <Link href={`/project/${projectId}`}>개요</Link>
                    {['spec', 'attributes', 'attributes/fitness', 'target-spec', 'tech-roadmap', 'assets', 'funding-plan', 'funding-source'].map((path, index) => <Link key={path} href={`/project/${projectId}/${path}`}>WS-{[2, 3, 4, 12, 13, 14, 15, 16][index]} 분석</Link>)}
                </div>
                {!usesOverview && <label className="block text-sm text-gray-300">제품/서비스 이미지
                    <input type="file" accept="image/*" onChange={event => { void handleImage(event.target.files?.[0]); event.target.value = ''; }} className="input-field mt-1 block" />
                </label>}
                {!usesOverview && free.productImageDataUrl && <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 저장할 dataURL 이미지를 직접 확인한다. */}
                    <img src={free.productImageDataUrl} alt="제품 이미지 미리보기" className="max-h-40 rounded border border-white/10" />
                    <button type="button" className="btn-secondary text-sm" onClick={() => updateFree({ productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null })}>이미지 제거</button>
                </div>}
                {legacyFields.map(field => <label key={field.key} className="block text-sm text-gray-300">{field.label}
                    <textarea value={String(free[field.key] ?? '')} onChange={event => updateFree({ [field.key]: event.target.value })} placeholder={field.placeholder} rows={2} className="input-field mt-1 block w-full" />
                </label>)}
            </fieldset>
            {previewNeedsRefresh && <p role="status" className="text-sm text-amber-300">입력 항목이 변경되었습니다. 미리보기를 다시 만들어야 완료할 수 있습니다. 기존 교정 내용은 재생성 전까지 유지됩니다.</p>}
            <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => draft ? setConfirmation('rebuild') : void handleBuildPreview()} disabled={progress !== null || worksheetsLoading || !worksheets || failedKeys.length > 0} className="btn-secondary text-sm disabled:opacity-50">{draft ? '미리보기 다시 만들기' : '미리보기 만들기'}</button>
                {draft && <button onClick={() => void handleRefreshTables()} disabled={progress !== null || worksheetsLoading} title="표의 교정 내용은 작성용 워크시트의 저장값으로 갱신하고 설명 문단은 유지합니다." className="btn-secondary text-sm disabled:opacity-50">워크시트 표 반영</button>}
                {draft && <button onClick={() => void handleBuildPreview(true)} disabled={progress !== null || worksheetsLoading || !worksheets || failedKeys.length > 0} className="btn-secondary text-sm disabled:opacity-50">워크시트 그림 반영</button>}
                <button disabled={progress !== null || worksheetsLoading} onClick={() => void reloadSources()} className="btn-secondary text-sm disabled:opacity-50">워크시트 다시 불러오기</button>
                {worksheetsLoading && <p role="status" className="text-sm text-gray-400">워크시트 불러오는 중 {loadedCount}/11</p>}
                {failedKeys.length > 0 && !worksheetsLoading && <div role="alert" className="text-sm text-amber-300">
                    <p>워크시트 {failedKeys.length}개를 불러오지 못해 새 문서를 만들 수 없습니다. 저장된 초안은 유지됩니다. ({failedKeys.join(', ')})</p>
                </div>}
            </div>
        </>}

        {shownDocument && <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h2 className="text-lg font-semibold text-white">{editing ? '미리보기 · 교정' : activeView === 'published' ? '완료 보고서' : '저장된 초안'}</h2>
                    {editing && <p className="mt-1 text-sm text-gray-400">문서의 칸을 눌러 교정할 수 있습니다. 교정은 보고서에만 저장됩니다.{editedCount > 0 && <span className="ml-1 text-amber-300">{editedCount}곳 교정함</span>}</p>}
                </div>
                {editing && <button onClick={() => { setDraft(model); setHasLocalChanges(true); }} disabled={progress !== null || editedCount === 0} className="btn-secondary text-sm disabled:opacity-40">미리보기 기준으로 되돌리기</button>}
            </div>
            <div ref={reportPreview}><FinalReportPreview blocks={shownDocument.blocks} onEdit={editing ? handleEdit : undefined} readOnly={!editing} disabled={progress !== null} /></div>
            {!shownDocument.blocks.some(block => block.kind === 'cover') && <div ref={legacyPdfPreview} aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 0, width: '820px', pointerEvents: 'none' }}>
                <FinalReportPages blocks={shownDocument.blocks} readOnly />
            </div>}
        </section>}

        {!report.canEdit && activeView === 'draft' && <section className="card space-y-3">
            <h2 className="text-lg font-semibold text-white">저장된 보고서 입력 항목</h2>
            {previewNeedsRefresh && <p className="text-sm text-amber-300">입력 항목이 변경되어 문서 미리보기를 다시 만들어야 하는 초안입니다.</p>}
            {free.productImageDataUrl && <>
                {/* eslint-disable-next-line @next/next/no-img-element -- 서버에 저장된 보고서 사진을 읽기 전용으로 표시한다. */}
                <img src={free.productImageDataUrl} alt="제품/서비스 이미지" className="max-h-60 max-w-full" />
            </>}
            <dl className="space-y-3">{FREE_FIELDS.map(field => <div key={field.key}><dt className="text-sm font-semibold text-gray-300">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-400">{String(free[field.key] || '입력 없음')}</dd></div>)}</dl>
        </section>}

        {editing && !worksheetsLoading && worksheets && <div ref={captureStage}>
            <FinalReportCaptureStage projectId={projectId} kanoPoints={kanoPoints} requirementCount={worksheets.requirements.length} revision={captureRevision} disabled={progress !== null} />
        </div>}

        {confirmation && <dialog ref={dialog} onCancel={() => { setConfirmation(null); setPendingNavigation(null); }} className="w-full max-w-lg rounded-xl border border-white/10 bg-gray-900 p-6 text-white shadow-xl backdrop:bg-black/60" aria-labelledby="report-confirm-title">
            <h2 id="report-confirm-title" className="text-lg font-semibold">{confirmation === 'leave' ? '저장하지 않고 이동하시겠습니까?' : confirmation === 'publish' ? '결과보고서를 완료하시겠습니까?' : '미리보기를 다시 만드시겠습니까?'}</h2>
            <p className="mt-3 text-sm text-gray-300">{confirmation === 'leave' ? '아직 저장하지 않은 입력과 교정 내용이 사라집니다. 저장된 초안과 기존 완료본은 유지됩니다. 계속 작성하려면 취소해 주세요.' : confirmation === 'publish' ? report.hasPublishedReport ? '현재 문서를 저장하고 기존 완료본을 교체합니다. 멘티에게 새 완료본이 공개됩니다.' : '현재 문서를 저장하고 완료본으로 공개합니다. 멘티가 열람하고 Word 또는 PDF 파일을 내려받을 수 있습니다.' : '최신 워크시트와 위 입력 항목으로 문서를 다시 만듭니다. 현재 미리보기에서 직접 교정한 내용은 교체됩니다. 기존 공개본은 그대로 유지됩니다.'}</p>
            <div className="mt-6 flex justify-end gap-2">
                <button autoFocus onClick={() => { setConfirmation(null); setPendingNavigation(null); }} className="btn-secondary text-sm">취소</button>
                <button onClick={() => {
                    const action = confirmation;
                    setConfirmation(null);
                    if (action === 'leave' && pendingNavigation) {
                        allowNavigation.current = true;
                        setHasLocalChanges(false);
                        setPendingNavigation(null);
                        if ('historyKey' in pendingNavigation) {
                            const navigation = (window as Window & { navigation?: ReportNavigation }).navigation;
                            void navigation?.traverseTo(pendingNavigation.historyKey).finished.catch(() => {
                                allowNavigation.current = false;
                                setHasLocalChanges(true);
                                setActionError('이동하지 못했습니다. 현재 입력은 유지됩니다. 다시 이동해 주세요.');
                            });
                        } else if (pendingNavigation.replace) router.replace(pendingNavigation.href);
                        else router.push(pendingNavigation.href);
                    } else if (action === 'publish') void handlePublish();
                    else if (action === 'rebuild') void handleBuildPreview();
                }} className="btn-primary text-sm">{confirmation === 'leave' ? '저장하지 않고 이동' : confirmation === 'publish' ? '완료하고 공개' : '다시 만들기'}</button>
            </div>
        </dialog>}
    </div>;
}
