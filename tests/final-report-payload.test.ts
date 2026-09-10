// 결과보고서 저장 입력의 문서 구조와 이미지·버전 경계를 검증한다.
import { describe, expect, it } from 'vitest';
import { completeReportSchema, REPORT_MAX_BYTES, reportDraftSchema, saveReportSchema } from '../lib/final-report-payload';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2Q==';
const free = () => ({
    productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null,
    marketDefinition: '', targetCustomer: '', finalSpecExplanation: '', improvedProductName: '', improvedProductDescription: '',
});
const document = (blocks: unknown[] = [{ kind: 'paragraph', text: '작성 본문' }]) => ({ title: '결과보고서', fileName: '결과보고서.docx', blocks });
const draft = (blocks?: unknown[]) => ({ free: free(), document: document(blocks) });
const imageBlock = (url: string = png) => ({ kind: 'image', title: '캡처', pngDataUrl: url, widthMm: 120, heightMm: 80, landscape: false });

describe('결과보고서 초안 형식', () => {
    it('생성 전 자유 입력과 null 문서를 저장할 수 있고 미리보기 갱신 여부는 false가 기본이다', () => {
        const parsed = reportDraftSchema.parse({ free: free(), document: null });
        expect(parsed.document).toBeNull();
        expect(parsed.previewNeedsRefresh).toBe(false);
    });

    it('빈 블록의 문서도 초안으로 보존할 수 있다', () => {
        expect(reportDraftSchema.safeParse(draft([])).success).toBe(true);
    });

    it('이미 생성된 교정 문서와 미리보기 갱신 필요 상태를 함께 보존한다', () => {
        const input = { ...draft(), previewNeedsRefresh: true };
        expect(reportDraftSchema.parse(input)).toEqual(input);
    });

    it('모든 지원 블록과 표를 저장할 수 있다', () => {
        const input = draft([
            { kind: 'heading', text: '큰 제목', level: 1 },
            { kind: 'heading', text: '작은 제목', level: 2 },
            { kind: 'paragraph', text: '' },
            { kind: 'keyValueTable', rows: [{ label: '멘토', value: '작성자' }] },
            { kind: 'dataTable', headers: ['항목', '값'], rows: [['스펙', '내용']] },
            imageBlock(),
        ]);
        expect(reportDraftSchema.safeParse(input).success).toBe(true);
    });

    it.each([
        ['문자열 대신 숫자', { ...free(), marketDefinition: 123 }],
        ['자유 입력 누락', { marketDefinition: '시장' }],
        ['사진 너비 음수', { ...free(), productImageDataUrl: png, productImageWidthPx: -1, productImageHeightPx: 1 }],
        ['사진 높이 0', { ...free(), productImageDataUrl: png, productImageWidthPx: 1, productImageHeightPx: 0 }],
    ])('%s 입력은 거절한다', (_name, input) => {
        expect(reportDraftSchema.safeParse({ free: input, document: null }).success).toBe(false);
    });

    it.each([
        ['알 수 없는 블록', { kind: 'script', text: '실행' }],
        ['지원하지 않는 제목 단계', { kind: 'heading', text: '제목', level: 3 }],
        ['문자열이 아닌 본문', { kind: 'paragraph', text: 7 }],
        ['값 누락', { kind: 'keyValueTable', rows: [{ label: '항목' }] }],
        ['빈 표 머리글', { kind: 'dataTable', headers: [], rows: [] }],
        ['표의 열 수 불일치', { kind: 'dataTable', headers: ['항목', '값'], rows: [['항목만']] }],
        ['표 안의 객체', { kind: 'dataTable', headers: ['항목'], rows: [[{ text: '값' }]] }],
        ['이미지 너비 0', { ...imageBlock(), widthMm: 0 }],
        ['이미지 무한 높이', { ...imageBlock(), heightMm: Infinity }],
        ['문자열 방향값', { ...imageBlock(), landscape: 'false' }],
    ])('%s 문서 블록은 거절한다', (_name, block) => {
        expect(reportDraftSchema.safeParse(draft([block])).success).toBe(false);
    });

    it.each([
        { title: 12, fileName: 'report.docx', blocks: [] },
        { title: '보고서', fileName: 12, blocks: [] },
        { title: '보고서', fileName: 'report.docx', blocks: '본문' },
    ])('잘못된 문서 최상위 필드는 거절한다', (input) => {
        expect(reportDraftSchema.safeParse({ free: free(), document: input }).success).toBe(false);
    });

    it('문자열 100,000자와 500개 블록까지 허용하고 초과하면 거절한다', () => {
        expect(reportDraftSchema.safeParse(draft([{ kind: 'paragraph', text: '가'.repeat(100_000) }])).success).toBe(true);
        expect(reportDraftSchema.safeParse(draft([{ kind: 'paragraph', text: '가'.repeat(100_001) }])).success).toBe(false);
        const blocks = Array.from({ length: 500 }, () => ({ kind: 'paragraph', text: '본문' }));
        expect(reportDraftSchema.safeParse(draft(blocks)).success).toBe(true);
        expect(reportDraftSchema.safeParse(draft([...blocks, blocks[0]])).success).toBe(false);
    });

    it('표는 100열과 5,000행까지 허용하고 구조 상한을 넘으면 거절한다', () => {
        const headers = Array.from({ length: 100 }, () => '열');
        expect(reportDraftSchema.safeParse(draft([{ kind: 'dataTable', headers, rows: [headers] }])).success).toBe(true);
        expect(reportDraftSchema.safeParse(draft([{ kind: 'dataTable', headers: [...headers, '열'], rows: [[...headers, '열']] }])).success).toBe(false);
        const rows = Array.from({ length: 5000 }, () => ['값']);
        expect(reportDraftSchema.safeParse(draft([{ kind: 'dataTable', headers: ['열'], rows }])).success).toBe(true);
        expect(reportDraftSchema.safeParse(draft([{ kind: 'dataTable', headers: ['열'], rows: [...rows, ['값']] }])).success).toBe(false);
    });

    it.each(['../report.docx', 'folder/report.docx', 'folder\\report.docx', 'report.txt', 'report\u0000.docx'])('경로나 잘못된 확장자·제어 문자가 있는 파일명 %s는 거절한다', (fileName) => {
        expect(reportDraftSchema.safeParse({ free: free(), document: { ...document(), fileName } }).success).toBe(false);
    });

    it('알려지지 않은 저장 필드를 조용히 받아들이지 않는다', () => {
        expect(reportDraftSchema.safeParse({ ...draft(), published: document() }).success).toBe(false);
        expect(saveReportSchema.safeParse({ version: 0, draft: draft(), updatedById: 'other-author' }).success).toBe(false);
        expect(completeReportSchema.safeParse({ version: 0, document: document() }).success).toBe(false);
    });

    it('행이 없는 키·값 표는 Word가 표시할 수 없으므로 거절한다', () => {
        expect(reportDraftSchema.safeParse(draft([{ kind: 'keyValueTable', rows: [] }])).success).toBe(false);
    });
});

describe('문서 이미지 저장 제한', () => {
    it.each(['A', 'AAA==', 'AA=A'])('base64 패딩 구조가 잘못된 %s 이미지는 거절한다', (encoded) => {
        expect(reportDraftSchema.safeParse(draft([imageBlock(`data:image/png;base64,${encoded}`)])).success).toBe(false);
    });

    it.each([png, jpeg])('PNG·JPEG dataURL 이미지는 문서와 자유 입력에 저장할 수 있다', (url) => {
        expect(reportDraftSchema.safeParse(draft([imageBlock(url)])).success).toBe(true);
        expect(reportDraftSchema.safeParse({ free: { ...free(), productImageDataUrl: url, productImageWidthPx: 1, productImageHeightPx: 1 }, document: null }).success).toBe(true);
    });

    it.each([
        'https://example.com/private.png',
        'http://127.0.0.1/private.jpg',
        'data:image/svg+xml;base64,PHN2Zy8+',
        'data:image/png,not-base64',
        'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==',
        'data:image/png;base64,!!!!',
        'data:image/jpeg;base64,',
    ])('외부 URL·SVG·지원하지 않거나 깨진 형식 %s는 거절한다', (url) => {
        expect(reportDraftSchema.safeParse(draft([imageBlock(url)])).success).toBe(false);
        expect(reportDraftSchema.safeParse({ free: { ...free(), productImageDataUrl: url }, document: null }).success).toBe(false);
    });
});

describe('보고서 저장·완료 버전 형식', () => {
    it('요청 크기는 3,500,000바이트로 제한한다', () => {
        expect(REPORT_MAX_BYTES).toBe(3_500_000);
    });

    it.each([0, 1, 12])('정수 버전 %i를 저장·완료 요청에 사용할 수 있다', (version) => {
        expect(saveReportSchema.safeParse({ version, draft: draft() }).success).toBe(true);
        expect(completeReportSchema.safeParse({ version }).success).toBe(true);
    });

    it.each([-1, 0.5, '1', null, undefined])('잘못된 버전 %s는 저장·완료 모두 거절한다', (version) => {
        expect(saveReportSchema.safeParse({ version, draft: draft() }).success).toBe(false);
        expect(completeReportSchema.safeParse({ version }).success).toBe(false);
    });

    it('초안이 없는 저장 요청은 거절한다', () => {
        expect(saveReportSchema.safeParse({ version: 0 }).success).toBe(false);
    });
});
