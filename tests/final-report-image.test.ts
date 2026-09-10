// 보고서 이미지 최적화의 크기 한도와 실패 시 임시 URL 정리를 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { optimizeReportImage } from '../lib/final-report-image';

let width: number;
let height: number;
let failLoad: boolean;
let loadedSource: string;
const png = 'data:image/png;base64,' + 'A'.repeat(100);
const jpeg = 'data:image/jpeg;base64,' + 'A'.repeat(40);
const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
const canvas = { width: 0, height: 0, getContext: vi.fn(), toDataURL: vi.fn() };
const createElement = vi.fn();
const imageCreated = vi.fn();

class MockImage {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { imageCreated(); }
    set src(value: string) {
        loadedSource = value;
        if (failLoad) this.onerror?.();
        else this.onload?.();
    }
}

beforeEach(() => {
    vi.resetAllMocks();
    width = 800;
    height = 600;
    failLoad = false;
    loadedSource = '';
    canvas.width = 0;
    canvas.height = 0;
    context.fillStyle = '';
    canvas.getContext.mockReturnValue(context);
    canvas.toDataURL.mockImplementation((type: string) => type === 'image/png' ? png : jpeg);
    createElement.mockReturnValue(canvas);
    vi.stubGlobal('document', { createElement });
    vi.stubGlobal('Image', MockImage);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report-test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('보고서 이미지 최적화', () => {
    it('작은 이미지는 확대하지 않고 PNG·JPEG 중 짧은 결과를 선택한다', async () => {
        expect(await optimizeReportImage(png)).toEqual({ dataUrl: jpeg, widthPx: 800, heightPx: 600 });
        expect(loadedSource).toBe(png);
        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        expect(createElement).toHaveBeenCalledWith('canvas');
        expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
        expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
    });

    it('글자나 선이 많아 PNG가 더 작으면 PNG를 보존한다', async () => {
        const smallPng = 'data:image/png;base64,AAAA';
        canvas.toDataURL.mockImplementation((type: string) => type === 'image/png' ? smallPng : jpeg);
        expect((await optimizeReportImage(png)).dataUrl).toBe(smallPng);
    });

    it.each([
        [4000, 2000, 2000, 1000],
        [100, 16000, 50, 8000],
        [2000, 4000, 2000, 4000],
        [1, 1, 1, 1],
    ])('%i×%i 입력을 %i×%i 범위로 맞춘다', async (inputWidth, inputHeight, expectedWidth, expectedHeight) => {
        width = inputWidth;
        height = inputHeight;
        const result = await optimizeReportImage(png);
        expect(result.widthPx).toBe(expectedWidth);
        expect(result.heightPx).toBe(expectedHeight);
        expect(context.drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, expectedWidth, expectedHeight);
    });

    it('폭·높이 개별 한도 안의 긴 캡처도 총 8백만 픽셀 이하로 줄인다', async () => {
        width = 2000;
        height = 8000;
        const result = await optimizeReportImage(png);
        expect(result.widthPx * result.heightPx).toBeLessThanOrEqual(8_000_000);
        expect(result.widthPx).toBeLessThan(2000);
        expect(result.heightPx).toBeLessThan(8000);
        expect(Math.abs(result.widthPx / result.heightPx - width / height)).toBeLessThan(0.001);
    });

    it('JPEG에서 투명 영역이 검게 보이지 않도록 흰 배경을 먼저 칠한다', async () => {
        await optimizeReportImage(png);
        expect(context.fillStyle).toBe('#ffffff');
        expect(context.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
        expect(context.fillRect.mock.invocationCallOrder[0]).toBeLessThan(context.drawImage.mock.invocationCallOrder[0]);
    });

    it('파일을 읽은 임시 URL은 최적화가 끝난 뒤 해제한다', async () => {
        const file = new File(['image fixture'], 'report.png', { type: 'image/png' });
        expect((await optimizeReportImage(file)).dataUrl).toBe(jpeg);
        expect(URL.createObjectURL).toHaveBeenCalledWith(file);
        expect(loadedSource).toBe('blob:report-test');
        expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:report-test');
    });

    it('20MB를 초과한 파일은 이미지나 임시 URL을 만들기 전에 거절한다', async () => {
        const file = new File([new Uint8Array(20_000_001)], 'large.png', { type: 'image/png' });
        await expect(optimizeReportImage(file)).rejects.toThrow('20MB');
        expect(imageCreated).not.toHaveBeenCalled();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('정확히 20MB인 파일은 최적화를 시도하고 URL을 해제한다', async () => {
        const file = new File([new Uint8Array(20_000_000)], 'boundary.png', { type: 'image/png' });
        expect((await optimizeReportImage(file)).widthPx).toBe(800);
        expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:report-test');
    });
});

describe('이미지 최적화 실패', () => {
    it.each(['이미지 로드', '빈 치수', '캔버스 컨텍스트', '캔버스 직렬화', '잘못된 데이터 URL', '이미지 그리기'])('%s 실패를 알리고 임시 URL을 해제한다', async (failure) => {
        if (failure === '이미지 로드') failLoad = true;
        if (failure === '빈 치수') width = 0;
        if (failure === '캔버스 컨텍스트') canvas.getContext.mockReturnValue(null);
        if (failure === '캔버스 직렬화') canvas.toDataURL.mockImplementation(() => { throw new Error('canvas encoding failed'); });
        if (failure === '잘못된 데이터 URL') canvas.toDataURL.mockReturnValue('data:,');
        if (failure === '이미지 그리기') context.drawImage.mockImplementation(() => { throw new Error('canvas drawing failed'); });
        const file = new File(['broken fixture'], 'broken.png', { type: 'image/png' });
        await expect(optimizeReportImage(file)).rejects.toThrow();
        expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:report-test');
    });

    it('캡처 문자열을 읽지 못해도 임시 파일 URL을 임의로 해제하지 않는다', async () => {
        failLoad = true;
        await expect(optimizeReportImage(png)).rejects.toThrow('이미지를 읽지 못했습니다');
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });
});
