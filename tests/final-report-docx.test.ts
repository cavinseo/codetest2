// 직렬화 결과를 직접 풀어 블록 누락과 가로 구역의 세로 복귀 오류를 검출한다.
import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderFinalReportDocx } from '../lib/final-report-docx';
import { buildFinalReportModel, type FinalReportBlock, type FinalReportModel, type FinalReportWorksheetData } from '../lib/final-report-document';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const picture: FinalReportBlock = { kind: 'image', title: '검증 그림', pngDataUrl: `data:image/png;base64,${png}`, widthMm: 25.4, heightMm: 50.8, landscape: false };
const model = (blocks: FinalReportBlock[]): FinalReportModel => ({ title: '결과보고서', fileName: '결과보고서.docx', blocks });

async function unpack(input: FinalReportModel) {
    const blob = await renderFinalReportDocx(input);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('word/document.xml')!.async('string');
    return { zip, xml };
}

it('renders a normal report as a Word Blob preserving text order', async () => {
    const { xml, zip } = await unpack(model([
        { kind: 'heading', text: 'Ⅰ. 제품 개요', level: 1 },
        { kind: 'paragraph', text: '제품 설명 & 고객 <요구>' },
        { kind: 'dataTable', headers: ['항목', '금액'], rows: [['개발비', '1,000']] },
    ]));
    expect(xml.indexOf('Ⅰ. 제품 개요')).toBeLessThan(xml.indexOf('제품 설명'));
    expect(xml).toContain('제품 설명 &amp; 고객 &lt;요구&gt;');
    expect(xml).toContain('1,000');
    expect(await zip.file('word/styles.xml')!.async('string')).toContain('맑은 고딕');
});

it('renders an empty block list without adding report wording', async () => {
    const { xml } = await unpack(model([]));
    expect(xml).not.toContain('<w:t');
    expect(xml.match(/<w:sectPr>/g)).toHaveLength(1);
    expect(xml).toContain('w:orient="portrait"');
});

it('renders every kind with heading levels, table headers and embedded image dimensions', async () => {
    const { xml, zip } = await unpack(model([
        { kind: 'heading', text: '큰 제목', level: 1 },
        { kind: 'heading', text: '작은 제목', level: 2 },
        { kind: 'paragraph', text: '본문' },
        { kind: 'keyValueTable', rows: [{ label: '코치명', value: '미배정' }] },
        { kind: 'dataTable', headers: ['핵심스펙', '기술적특성'], rows: [['속도', '빠름'], ['용량', '큼']] },
        picture,
    ]));
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:val="Heading2"');
    for (const text of ['본문', '코치명', '미배정', '핵심스펙', '기술적특성', '속도', '빠름', '용량', '큼']) expect(xml).toContain(text);
    expect(xml.match(/<w:tbl>/g)).toHaveLength(2);
    expect(xml.match(/<w:tblW[^>]+\/>/g)).toEqual([
        expect.stringContaining('w:w="100%"'), expect.stringContaining('w:w="100%"'),
    ]);
    const header = xml.match(/<w:tr><w:trPr><w:tblHeader\/>.*?<\/w:tr>/)?.[0];
    expect(header).toBeDefined();
    expect(header).toContain('<w:b/>');
    expect(header).toContain('<w:jc w:val="center"/>');
    expect(xml).toContain('<wp:extent cx="914400" cy="1828800"/>');
    expect(xml).toContain('descr="검증 그림"');
    const images = zip.file(/^word\/media\/.*\.png$/);
    expect(images).toHaveLength(1);
    expect(await images[0].async('base64')).toBe(png);
});

it('isolates landscape images and restores portrait for following blocks', async () => {
    const { xml } = await unpack(model([
        { kind: 'paragraph', text: '이전 본문' },
        { ...picture, landscape: true },
        { kind: 'paragraph', text: '다음 본문' },
    ]));
    const sections = xml.match(/<w:sectPr>.*?<\/w:sectPr>/g)!;
    expect(sections).toHaveLength(3);
    expect(sections.map(section => section.match(/w:orient="(.*?)"/)?.[1])).toEqual(['portrait', 'landscape', 'portrait']);
    expect(sections[1]).toContain('w:w="16837" w:h="11905"');
    expect(sections[1]).toContain('w:top="1133" w:right="1133" w:bottom="1133" w:left="1133"');
    expect(xml.indexOf('이전 본문')).toBeLessThan(xml.indexOf('<w:drawing>'));
    expect(xml.indexOf('<w:drawing>')).toBeLessThan(xml.indexOf('다음 본문'));
});

it('does not add empty portrait sections around consecutive landscape images', async () => {
    const { xml } = await unpack(model([{ ...picture, landscape: true }, { ...picture, landscape: true }]));
    expect(xml.match(/<w:sectPr>/g)).toHaveLength(2);
    expect(xml.match(/w:orient="landscape"/g)).toHaveLength(2);
    expect(xml).not.toContain('w:orient="portrait"');
    expect(xml.match(/<w:drawing>/g)).toHaveLength(2);
});

it('embeds JPEG report images as JPEG media without mislabeling them as PNG', async () => {
    // 1×1 흰색 JPEG의 실제 바이트로 이미지 최적화 후 Word 저장을 검증한다.
    const jpeg = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==';
    const { zip, xml } = await unpack(model([{ ...picture, pngDataUrl: `data:image/jpeg;base64,${jpeg}` }]));
    const images = zip.file(/^word\/media\/.*\.(?:jpg|jpeg)$/);
    expect(images).toHaveLength(1);
    expect(await images[0].async('base64')).toBe(jpeg);
    expect(zip.file(/^word\/media\/.*\.png$/)).toHaveLength(0);
    expect(xml).toContain('<w:drawing>');
    const contentTypes = await zip.file('[Content_Types].xml')!.async('string');
    expect(contentTypes).toMatch(/<Default(?=[^>]*\bExtension="jpe?g")(?=[^>]*\bContentType="image\/jpeg")[^>]*\/>/);
});

it('serializes overview fields and all eight worksheet analyses into the corresponding Word sections', async () => {
    const worksheets: FinalReportWorksheetData = {
        salesEstimates: [], specFunctions: [], productAttributes: [], requirements: [], kanoAggregation: [],
        competitiveAssessment: [], improvementNeeds: [], improvementFeatures: [], techTree: [], targetSpecs: [],
        improvementDirections: [], assets: [], fundingPlans: [], fundingSources: [],
    };
    const document = buildFinalReportModel({
        projectName: '검수 기업', productName: '검수 제품', description: null, coachName: '담당 멘토', generatedAt: '2026-09-11',
        marketDefinition: '교육 서비스 시장', targetCustomer: '현장 교사',
    }, worksheets, {
        productImageDataUrl: null, productImageWidthPx: null, productImageHeightPx: null,
        marketDefinition: '이전 시장', targetCustomer: '이전 고객', finalSpecExplanation: '이전 통합 설명',
        improvedProductName: '이전 개선 제품명', improvedProductDescription: '이전 개선 설명',
    }, [], {
        spec: { analysis: '기능분석 본문 & <근거>' }, attributes: { analysis: '제품속성 분석 본문' }, fitness: { analysis: '적합도 분석 본문' },
        'target-spec': { items: [{ label: '정확도 항목', explanation: '목표 정확도 근거' }] },
        'tech-roadmap': { productName: '개선 학습지원 서비스', description: '개선 서비스의 구현 방향' },
        assets: { core: '핵심자산 분석 본문', complementary: '보완자산 분석 본문' },
        'funding-plan': { analysis: '소요자금 분석 본문' }, 'funding-source': { analysis: '조달자금 분석 본문' },
    });
    const { xml } = await unpack(document);
    for (const text of ['검수 기업', '검수 제품', '교육 서비스 시장', '현장 교사']) expect(xml).toContain(text);
    const orderedTexts = [
        '(AS-IS) 스펙표', '기능분석 본문 &amp; &lt;근거&gt;',
        '제품속성서', '제품속성 분석 본문', '제품/서비스 속성 적합도', '적합도 분석 본문',
        '최종 제품/서비스 제공 스펙 List', '정확도 항목', '목표 정확도 근거',
        '핵심자산 도출표', '핵심자산 분석 본문', '보완자산 도출표', '보완자산 분석 본문',
        '개선 학습지원 서비스', '개선 서비스의 구현 방향', 'KS-QFD 개선 방향성',
        '자금소요계획표', '소요자금 분석 본문', '자금조달계획표', '조달자금 분석 본문',
    ];
    let previous = -1;
    for (const text of orderedTexts) {
        const index = xml.indexOf(text);
        expect(index, text).toBeGreaterThan(previous);
        previous = index;
    }
    for (const text of ['이전 시장', '이전 고객', '이전 통합 설명', '이전 개선 제품명', '이전 개선 설명']) expect(xml).not.toContain(text);
});
