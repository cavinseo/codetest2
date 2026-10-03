// 개요 저장 시 미편집 null과 사용자가 지운 빈 문자열을 실제 입력 흐름에서 구분한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProjectDetailPage from '../app/project/[id]/page';
import { hasProductOverviewSource } from '../lib/final-report-document';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'project' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: (props: any) => createElement('a', props) }));
vi.mock('../components/ThemeToggle', () => ({ default: () => null }));
vi.mock('../components/project/WorksheetComments', () => ({ default: () => null }));
vi.mock('../components/project/MentorWorksheetAnalysis', () => ({ default: () => null }));

const empty = { productName: null, marketDefinition: null, targetCustomer: null, productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null };
let project: Record<string, unknown>;
let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const optimizeImage = vi.hoisted(() => vi.fn());
vi.mock('../lib/final-report-image', () => ({ optimizeReportImage: optimizeImage }));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1cAAAAASUVORK5CYII=';
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    optimizeImage.mockResolvedValue({ dataUrl: png, widthPx: 1, heightPx: 1 });
    project = { id: 'project', name: '기존 프로젝트', description: '기존 설명', createdAt: '2026-09-01', role: 'OWNER', ...empty };
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url === '/api/projects') return json({ projects: [project] });
        if (url.endsWith('/overview')) {
            if (options?.method === 'PATCH') project = { ...project, ...JSON.parse(String(options.body)) };
            return json({ project });
        }
        return json({ requirements: [], specFunctions: [], analysis: [], totalResponses: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});
async function click(text: string) {
    const button = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === text);
    expect(button).toBeDefined();
    await act(async () => button!.click());
}
async function input(element: HTMLInputElement | HTMLTextAreaElement, text: string) {
    await act(async () => {
        const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, text);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
function savedBody() {
    return JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')![1].body));
}

it('프로젝트명만 고쳐 저장해도 개요 null을 보존하며 보고서는 개요의 미입력 상태를 따른다', async () => {
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    const name = [...container.querySelectorAll('input')].find(element => element.value === '기존 프로젝트')!;
    await input(name, '새 프로젝트명');
    await click('저장');
    expect(savedBody()).toMatchObject({ ...empty, name: '새 프로젝트명' });
    expect(hasProductOverviewSource(savedBody())).toBe(true);
});

it('제품 정보를 입력했다 직접 지우면 빈 문자열로 저장해 보고서의 명시적 삭제를 보존한다', async () => {
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    const fields = ['제품(서비스) 명', '시장정의', '목표 고객'];
    for (const field of fields) {
        const label = [...container.querySelectorAll('label')].find(node => node.textContent?.trim() === field)!;
        const textarea = label.querySelector('textarea')!;
        await input(textarea, '임시 입력');
        await input(textarea, '');
    }
    await click('저장');
    expect(savedBody()).toMatchObject({ productName: '', marketDefinition: '', targetCustomer: '' });
    expect(hasProductOverviewSource(savedBody())).toBe(true);
});

async function chooseImages(count: number, type = 'image/png') {
    const picker = container.querySelector<HTMLInputElement>('input[accept="image/png,image/jpeg"]')!;
    expect(picker.multiple).toBe(true);
    await act(async () => {
        Object.defineProperty(picker, 'files', { configurable: true, value: Array.from({ length: count }, (_, i) => new File(['image'], `${i}.png`, { type })) });
        picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
const shownImages = () => container.querySelectorAll('img[alt^="관련이미지 "]');

it('기존 제품 이미지에 두 장을 추가해 저장하면 세 장을 유지하고 개별 삭제 후 다시 추가할 수 있다', async () => {
    project = { ...project, productImageDataUrl: png, productImageWidthPx: 1, productImageHeightPx: 1 };
    await act(async () => root.render(createElement(ProjectDetailPage)));
    expect(container.textContent).toContain('관련이미지 올리기');
    expect(container.textContent).toContain('제품 이미지와 BM(비즈니스 모델) 이미지를 최대 3개까지 올려 주세요.');
    expect(shownImages()).toHaveLength(1);
    await click('수정');
    await chooseImages(2);
    expect(shownImages()).toHaveLength(3);
    expect(container.querySelector<HTMLInputElement>('input[accept="image/png,image/jpeg"]')?.disabled).toBe(true);
    await click('저장');
    expect(savedBody().relatedImages).toHaveLength(3);
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(createElement(ProjectDetailPage)));
    expect(shownImages()).toHaveLength(3);
    await click('수정');
    await click('관련이미지 2 삭제');
    expect(shownImages()).toHaveLength(2);
    await chooseImages(1);
    expect(shownImages()).toHaveLength(3);
});

it('최대 개수를 넘거나 잘못된 파일을 선택하면 기존 이미지를 유지한다', async () => {
    project = { ...project, productImageDataUrl: png, productImageWidthPx: 1, productImageHeightPx: 1 };
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    await chooseImages(3);
    expect(container.textContent).toContain('관련이미지는 최대 3개까지 올릴 수 있습니다.');
    expect(optimizeImage).not.toHaveBeenCalled();
    expect(shownImages()).toHaveLength(1);
    await chooseImages(1, 'image/svg+xml');
    expect(container.textContent).toContain('PNG 또는 JPEG 이미지를 선택하세요.');
    expect(shownImages()).toHaveLength(1);
    optimizeImage.mockRejectedValueOnce(new Error('이미지 읽기 실패'));
    await chooseImages(2);
    expect(container.textContent).toContain('이미지 읽기 실패');
    expect(shownImages()).toHaveLength(1);
});

it('관련이미지를 모두 삭제해 저장하고 다시 열어도 기존 이미지가 되살아나지 않는다', async () => {
    project = { ...project, productImageDataUrl: png, productImageWidthPx: 1, productImageHeightPx: 1 };
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    await click('관련이미지 1 삭제');
    await click('저장');
    expect(savedBody()).toMatchObject({ relatedImages: [], productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null });
    expect(shownImages()).toHaveLength(0);
    await click('수정');
    expect(shownImages()).toHaveLength(0);
});

it('읽기 전용 사용자에게는 관련이미지 선택과 삭제 버튼이 없다', async () => {
    project = { ...project, role: 'VIEWER', relatedImages: [{ dataUrl: png, widthPx: 1, heightPx: 1 }] };
    await act(async () => root.render(createElement(ProjectDetailPage)));
    expect(shownImages()).toHaveLength(1);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.textContent).not.toContain('관련이미지 1 삭제');
});

async function pressDetailEnter(textarea: HTMLTextAreaElement, options: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options });
    await act(async () => { textarea.dispatchEvent(event); });
    return event;
}

it('상세 제품개요의 글머리 적용·자동 이어쓰기·종료 후 저장하고 다시 열어도 내용을 보존한다', async () => {
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    let textarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="상세 제품개요"]')!;
    await input(textarea, '고객 문제\n핵심 기능');
    textarea.setSelectionRange(0, textarea.value.length);
    await click('• 점');
    expect(textarea.value).toBe('• 고객 문제\n• 핵심 기능');
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await pressDetailEnter(textarea);
    expect(textarea.value.endsWith('\n• ')).toBe(true);
    await input(textarea, textarea.value + 'BM 검증');
    await pressDetailEnter(textarea);
    await pressDetailEnter(textarea);
    expect(textarea.value.endsWith('BM 검증\n')).toBe(true);
    await input(textarea, textarea.value + '추가 설명');
    const expected = '• 고객 문제\n• 핵심 기능\n• BM 검증\n추가 설명';
    await click('저장');
    expect(savedBody().detailedDescription).toBe(expected);
    expect(container.textContent).toContain(expected);
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    textarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="상세 제품개요"]')!;
    expect(textarea.value).toBe(expected);
});

it.each([{ isComposing: true }, { keyCode: 229 }, { shiftKey: true }, { ctrlKey: true }])('한글 조합 확정과 보조키 Enter를 가로채지 않는다 %j', async options => {
    project.detailedDescription = '• 작성 중';
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="상세 제품개요"]')!;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    const event = await pressDetailEnter(textarea, options);
    expect(event.defaultPrevented).toBe(false);
    expect(textarea.value).toBe('• 작성 중');
});

it('여러 줄의 기호를 바꾸거나 제거한 뒤 취소하면 원래 상세 설명을 유지한다', async () => {
    project.detailedDescription = '• 첫 항목\n- 두 번째 항목';
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="상세 제품개요"]')!;
    textarea.setSelectionRange(0, textarea.value.length);
    await click('○ 동그라미');
    expect(textarea.value).toBe('○ 첫 항목\n○ 두 번째 항목');
    await click('글머리 제거');
    expect(textarea.value).toBe('첫 항목\n두 번째 항목');
    await click('취소');
    await click('수정');
    expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="상세 제품개요"]')?.value).toBe(project.detailedDescription);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
});

it('상세 제품개요와 시장정의에 Markdown·HTML을 입력해 미리보고 원문을 저장·재편집한다', async () => {
    await act(async () => root.render(createElement(ProjectDetailPage)));
    await click('수정');
    const detail = '# 제품 소개\n\n**핵심 기능**\n\n- 첫째\n- 둘째\n\n<p>HTML <em>설명</em></p>';
    const market = '## 시장 분석\n\n| 구분 | 규모 |\n| --- | --- |\n| 국내 | 100 |\n\n<p><strong>성장 시장</strong></p>';
    const detailInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="상세 제품개요"]')!;
    const marketInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="시장정의"]')!;
    expect(marketInput.maxLength).toBe(20_000);
    await input(detailInput, detail);
    await input(marketInput, market);
    for (const label of ['상세 제품개요', '시장정의']) {
        const previewButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${label} 미리보기"]`);
        expect(previewButton).not.toBeNull();
        await act(async () => previewButton!.click());
    }
    const detailPreview = container.querySelector('[role="region"][aria-label="상세 제품개요 미리보기"]');
    expect(detailPreview?.querySelector('h1')?.textContent).toBe('제품 소개');
    expect(detailPreview?.querySelector('strong')?.textContent).toBe('핵심 기능');
    expect(detailPreview?.querySelectorAll('li')).toHaveLength(2);
    expect(detailPreview?.querySelector('em')?.textContent).toBe('설명');
    const marketPreview = container.querySelector('[role="region"][aria-label="시장정의 미리보기"]');
    expect(marketPreview?.querySelector('h2')?.textContent).toBe('시장 분석');
    expect(marketPreview?.querySelector('td')?.textContent).toBe('국내');
    expect(marketPreview?.querySelector('strong')?.textContent).toBe('성장 시장');
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="상세 제품개요 편집으로 돌아가기"]')!.click());
    expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="상세 제품개요"]')?.value).toBe(detail);
    await click('저장');
    expect(savedBody()).toMatchObject({ detailedDescription: detail, marketDefinition: market });
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(createElement(ProjectDetailPage)));
    expect([...container.querySelectorAll('h1')].map(heading => heading.textContent)).toContain('제품 소개');
    expect(container.querySelector('td')?.textContent).toBe('국내');
    await click('수정');
    expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="상세 제품개요"]')?.value).toBe(detail);
    expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="시장정의"]')?.value).toBe(market);
});

it('읽기 전용 개요에서 HTML 서식을 표시하며 실행 코드·위험한 링크·스타일을 제거한다', async () => {
    project.role = 'VIEWER';
    project.detailedDescription = '<h2>제품 서식</h2><script>alert(1)</script><iframe src="https://example.test"></iframe><p style="position:fixed" onclick="alert(1)"><strong>안전한 설명</strong></p><img src="https://example.test/photo.png" onerror="alert(1)"><a href="javascript:alert(1)">위험 링크</a>';
    project.marketDefinition = '<h3>시장 서식</h3><style>body { display: none }</style><table><tr><td>시장 규모</td></tr></table><a href="https://example.test/market">자료</a>';
    await act(async () => root.render(createElement(ProjectDetailPage)));
    expect([...container.querySelectorAll('h2')].map(heading => heading.textContent)).toContain('제품 서식');
    expect([...container.querySelectorAll('h3')].map(heading => heading.textContent)).toContain('시장 서식');
    expect(container.querySelector('strong')?.textContent).toBe('안전한 설명');
    expect(container.querySelector('td')?.textContent).toBe('시장 규모');
    expect(container.querySelector('script, iframe, style, [onclick], [onerror], [style*="position"]')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('a[href="https://example.test/market"]')).not.toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
});

it('Markdown 코드블록 안의 HTML은 실행하지 않고 원문으로 표시한다', async () => {
    project.detailedDescription = '```html\n<strong>코드 예시</strong>\n```';
    await act(async () => root.render(createElement(ProjectDetailPage)));
    expect(container.querySelector('pre code')?.textContent).toBe('<strong>코드 예시</strong>\n');
    expect(container.querySelector('pre strong')).toBeNull();
});

it('두 항목의 미리보기에서 취소하면 기존 원문을 보존하고 편집 상태로 다시 연다', async () => {
    project.detailedDescription = '• 기존 상세\n둘째 줄';
    project.marketDefinition = '기존 시장\n둘째 줄';
    await act(async () => root.render(createElement(ProjectDetailPage)));
    expect(container.textContent).toContain(project.detailedDescription);
    expect(container.textContent).toContain(project.marketDefinition);
    await click('수정');
    for (const label of ['상세 제품개요', '시장정의']) {
        await input(container.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)!, '# 임시 수정');
        await act(async () => container.querySelector<HTMLButtonElement>(`button[aria-label="${label} 미리보기"]`)!.click());
    }
    await click('취소');
    await click('수정');
    expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="상세 제품개요"]')?.value).toBe(project.detailedDescription);
    expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="시장정의"]')?.value).toBe(project.marketDefinition);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
});

it('추가 시장 자료를 개요 마지막 박스에서 입력·저장·재조회하고 취소와 전체 삭제를 지원한다', async () => {
    const text = '시장 규모 120억원\n출처: 시장 보고서';
    await act(async () => root.render(createElement(ProjectDetailPage)));
    const box = () => container.querySelector('section[aria-labelledby="additional-market-data-title"]')!;
    expect(box().parentElement!.lastElementChild).toBe(box());
    await click('수정');
    await input(box().querySelector('textarea')!, text);
    await click('저장');
    expect(savedBody().additionalMarketData).toBe(text);
    expect(box().textContent).toContain(text);
    expect(box().querySelector('textarea')).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(createElement(ProjectDetailPage)));
    expect(box().textContent).toContain(text);
    await click('수정');
    await input(box().querySelector('textarea')!, '취소할 자료');
    await click('취소');
    expect(box().textContent).toContain(text);
    await click('수정');
    await input(box().querySelector('textarea')!, '');
    await click('저장');
    expect(project.additionalMarketData).toBe('');
    expect(box().textContent).toContain('입력된 추가 시장 자료가 없습니다.');
});

it('읽기 전용 사용자는 추가 시장 자료의 내용을 읽을 수 있고 수정할 수 없다', async () => {
    project = { ...project, role: 'VIEWER', additionalMarketData: '<script>실행하지 않는 자료</script>\n두 번째 줄' };
    await act(async () => root.render(createElement(ProjectDetailPage)));
    const box = container.querySelector('section[aria-labelledby="additional-market-data-title"]')!;
    expect(box.textContent).toContain(project.additionalMarketData);
    expect(box.querySelector('textarea,script')).toBeNull();
    expect([...container.querySelectorAll('button')].some(button => button.textContent?.trim() === '수정')).toBe(false);
});
