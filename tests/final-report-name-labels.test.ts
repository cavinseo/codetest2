// 보고서 이름 라벨이 기존 문서와 새 문서의 화면·PDF·Word에 동일하게 반영되는지 검증한다.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { expect, it } from 'vitest';
import FinalReportPreview from '../components/project/FinalReportPreview';
import FinalReportPages from '../components/project/FinalReportPages';
import { normalizeReportLabels } from '../lib/final-report-labels';
import { buildFinalReportModel, replaceWorksheetImages, type FinalReportBlock, type FinalReportModel, type FinalReportWorksheetData } from '../lib/final-report-document';
import { renderFinalReportDocx } from '../lib/final-report-docx';
import { EMPTY_REPORT_FREE_INPUT } from '../lib/final-report-payload';

const cover: FinalReportBlock = { kind: 'cover', title: '결과보고서', projectName: '정밀장비', companyName: '회사', coachName: '멘토', outputDate: '2026.10.04' };
const paragraphs: FinalReportBlock[] = [
    { kind: 'paragraph', text: '프로젝트명 · 정밀장비' },
    { kind: 'paragraph', text: '제품명 · 측정기\n개요의 간단 설명 · 교정한 설명' },
    { kind: 'paragraph', text: '워크시트 제품명 · 검사기' },
    { kind: 'paragraph', text: '본문 중 제품명 · 이 문장은 유지한다.' },
];

it('기존 라벨만 바꾸고 이름 값, 줄바꿈, 교정 문단, 블록 순서를 보존한다', () => {
    const before = JSON.stringify(paragraphs);
    const normalized = normalizeReportLabels(paragraphs);
    expect(normalized).toEqual([
        { kind: 'paragraph', text: '프로젝트명 : 정밀장비' },
        { kind: 'paragraph', text: '제품(서비스) 명 : 측정기\n개요의 간단 설명 · 교정한 설명' },
        { kind: 'paragraph', text: '제품(서비스) 명 : 검사기' },
        paragraphs[3],
    ]);
    expect(normalizeReportLabels(normalized)).toEqual(normalized);
    expect(JSON.stringify(paragraphs)).toBe(before);
});

it.each([false, true])('저장된 보고서 화면과 PDF용 페이지의 이름 라벨을 통일한다 (표지 %s)', hasCover => {
    const blocks = hasCover ? [cover, ...paragraphs] : paragraphs;
    for (const component of [FinalReportPreview, FinalReportPages]) {
        const html = renderToStaticMarkup(React.createElement(component, { blocks, readOnly: true }));
        expect(html).toContain('프로젝트명 : 정밀장비');
        expect(html).toContain('제품(서비스) 명 : 측정기');
        expect(html).toContain('제품(서비스) 명 : 검사기');
        expect(html).toContain('교정한 설명');
        expect(html).not.toContain('프로젝트명 ·');
        expect(html).not.toContain('워크시트 제품명 ·');
    }
});

it('새 보고서의 프로젝트명과 개요·WS-3 제품명을 요청한 형식으로 생성한다', () => {
    const worksheets: FinalReportWorksheetData = {
        salesEstimates: [], specFunctions: [], productAttributes: [{ productName: '검사기', customerName: null, marketSegment: null, customerNeed: null, benefit: null, attribute: null, techCapability: null }],
        requirements: [], kanoAggregation: [], competitiveAssessment: [], improvementNeeds: [], improvementFeatures: [],
        techTree: [], targetSpecs: [], improvementDirections: [], assets: [], fundingPlans: [], fundingSources: [],
    };
    const model = buildFinalReportModel({ projectName: '정밀장비', productName: '측정기', description: null, coachName: null, generatedAt: '2026.10.04' }, worksheets, EMPTY_REPORT_FREE_INPUT, []);
    expect(model.blocks).toContainEqual({ kind: 'paragraph', text: '프로젝트명 : 정밀장비' });
    expect(model.blocks).toContainEqual(expect.objectContaining({ text: expect.stringContaining('제품(서비스) 명 : 측정기') }));
    expect(model.blocks).toContainEqual({ kind: 'paragraph', text: '제품(서비스) 명 : 검사기' });
});

it('복구된 WS-4 그림과 이름을 Word에 넣고 WS-4 분석은 원본에만 보존한다', async () => {
    const original: FinalReportModel = { title: '보고서', fileName: '보고서.docx', blocks: [cover, ...paragraphs,
        { kind: 'heading', text: '제품/서비스 속성 적합도 (WS-4)', level: 2 },
        { kind: 'paragraph', text: 'WS-4 교정 분석 유지' },
        { kind: 'paragraph', tone: 'notice', text: '속성 적합도 행렬이 저장되어 있지 않습니다. 평가 결과 그림은 미작성 상태입니다.' },
    ] };
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const restored = replaceWorksheetImages(original, [{ worksheetId: 'fitness', title: '제품/서비스 속성 적합도', pngDataUrl: `data:image/png;base64,${png}`, widthPx: 1280, heightPx: 800 }]);
    const blob = await renderFinalReportDocx(restored);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    for (const text of ['프로젝트명 : 정밀장비', '제품(서비스) 명 : 측정기', '제품(서비스) 명 : 검사기']) expect(xml).toContain(text);
    expect(xml).not.toContain('WS-4 교정 분석 유지');
    expect(JSON.stringify(restored)).toContain('WS-4 교정 분석 유지');
    expect(xml).not.toContain('그림은 미작성');
    expect(xml).toContain('descr="제품/서비스 속성 적합도"');
    const images = zip.file(/^word\/media\/.*\.png$/);
    expect(images).toHaveLength(1);
    expect(await images[0].async('base64')).toBe(png);
});
