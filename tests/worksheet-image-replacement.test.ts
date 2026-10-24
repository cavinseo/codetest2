// 그림만 갱신할 때 보고서 교정 내용과 각 그림 위치가 보존되는지 검증한다.
import { describe, expect, it } from 'vitest';
import {
    CAPTURED_WORKSHEET_TITLES,
    hasWorksheetImageSlot,
    replaceWorksheetImages,
    type CapturedWorksheetImage,
    type FinalReportBlock,
    type FinalReportModel,
} from '../lib/final-report-document';

const images = Object.entries(CAPTURED_WORKSHEET_TITLES).map(([worksheetId, title]) => ({
    worksheetId, title, pngDataUrl: `data:image/png;base64,${worksheetId}`, widthPx: 2000, heightPx: 900,
})) as CapturedWorksheetImage[];

function model(): FinalReportModel {
    return {
        title: '교정한 제목', fileName: '보고서.docx', blocks: [
            { kind: 'paragraph', text: '직접 작성한 분석입니다.' },
            { kind: 'dataTable', headers: ['수정한 표'], rows: [['123']] },
            ...images.flatMap(image => [
                { kind: 'heading' as const, text: image.title, level: 2 as const },
                { kind: 'paragraph' as const, text: '그림을 캡처하지 못했습니다' },
            ]),
        ],
    };
}

it('기존 누락 그림의 세 위치에 실제 이미지를 넣고 교정한 문구와 표를 유지한다', () => {
    const original = model();
    const result = replaceWorksheetImages(original, images);
    expect(result.blocks.slice(0, 2)).toEqual(original.blocks.slice(0, 2));
    expect(result.title).toBe(original.title);
    expect(result.blocks.filter(block => block.kind === 'image').map(block => block.pngDataUrl)).toEqual(images.map(image => image.pngDataUrl));
    expect(original.blocks.filter(block => block.kind === 'image')).toHaveLength(0);
    for (const index of [3, 5, 7]) expect(result.blocks[index]).toMatchObject({ kind: 'image', landscape: true });
});

it('이미지가 있는 보고서는 절 제목을 교정해도 기존 그림 위치를 갱신한다', () => {
    const original = replaceWorksheetImages(model(), images);
    original.blocks[2] = { kind: 'heading', text: '교정한 적합도 제목', level: 2 };
    const updated = images.map(image => ({ ...image, pngDataUrl: 'data:image/png;base64,new' }));
    const result = replaceWorksheetImages(original, updated);
    expect(result.blocks[2]).toEqual(original.blocks[2]);
    expect(result.blocks[3]).toMatchObject({ kind: 'image', pngDataUrl: updated[0].pngDataUrl });
    expect(original.blocks[3]).toMatchObject({ pngDataUrl: images[0].pngDataUrl });
});

it('그림 위치가 없으면 다른 문단을 덮어쓰지 않고 전체 갱신을 중단한다', () => {
    const original = model();
    original.blocks[7] = { kind: 'paragraph', text: '사용자가 작성한 내용' };
    expect(() => replaceWorksheetImages(original, images)).toThrow('고객수요기반 기술스펙 관계도 그림 위치');
    expect(original.blocks[3].kind).toBe('paragraph');
    expect(original.blocks[7]).toEqual({ kind: 'paragraph', text: '사용자가 작성한 내용' });
});

it('WS-4 누락 안내를 교정해도 분석과 다음 절을 보존하며 그림을 한 번만 복구한다', () => {
    const original: FinalReportModel = { ...model(), blocks: [
        { kind: 'cover', title: '보고서', projectName: '장비', companyName: '회사', coachName: '멘토', outputDate: '2026.10.04' },
        { kind: 'heading', text: '제품/서비스 속성 적합도 (WS-4)', level: 2 },
        { kind: 'paragraph', text: '교정한 분석과 안내 문구', tone: 'notice' },
        { kind: 'heading', text: '제품/서비스 진단표', level: 2 },
    ] };
    const restored = replaceWorksheetImages(original, [images[0]]);
    expect(restored.blocks.slice(0, 3)).toEqual(original.blocks.slice(0, 3));
    expect(restored.blocks[3]).toMatchObject({ kind: 'image', title: images[0].title, landscape: false });
    expect(restored.blocks[4]).toEqual(original.blocks[3]);
    expect(replaceWorksheetImages(restored, [images[0]])).toEqual(restored);
    expect(original.blocks).toHaveLength(4);
});

describe('그림 자리 찾기 경계', () => {
    const [fitness, kano] = images;
    const kanoTitle = CAPTURED_WORKSHEET_TITLES['kano-aggregation'];
    const fitnessTitle = CAPTURED_WORKSHEET_TITLES.fitness;
    const WS4_HEADING = '제품/서비스 속성 적합도 (WS-4)';
    const MISSING_CAPTURE = '그림을 캡처하지 못했습니다';
    const FITNESS_MISSING = '속성 적합도 행렬이 저장되어 있지 않습니다. 평가 결과 그림은 미작성 상태입니다.';
    const heading = (text: string): FinalReportBlock => ({ kind: 'heading', text, level: 2 });
    const paragraph = (text: string): FinalReportBlock => ({ kind: 'paragraph', text });
    const oldImage = (title: string): FinalReportBlock => ({ kind: 'image', title, pngDataUrl: 'data:image/png;base64,old', widthMm: 10, heightMm: 10, landscape: false });
    const withBlocks = (blocks: FinalReportBlock[]): FinalReportModel => ({ title: '보고서', fileName: '보고서.docx', blocks });

    // 새 그림이 들어간 자리를 NEW 로, 나머지는 블록 종류로 적어 배치 전체를 한눈에 비교한다.
    function layoutAfter(blocks: FinalReportBlock[], image: CapturedWorksheetImage): string[] {
        return replaceWorksheetImages(withBlocks(blocks), [image]).blocks
            .map(block => (block.kind === 'image' && block.pngDataUrl === image.pngDataUrl ? 'NEW' : block.kind));
    }

    it('WS-4 표가 있어도 적합도가 아닌 그림은 자기 자리를 찾는다', () => {
        const table: FinalReportBlock = { kind: 'dataTable', title: 'WS-4 제품속성적합도', headers: [], rows: [] };
        expect(layoutAfter([table, heading(kanoTitle), paragraph(MISSING_CAPTURE)], kano)).toEqual(['dataTable', 'heading', 'NEW']);
    });

    it('WS-4 이름이 표가 아닌 그림에 붙어 있으면 적합도 그림 자리를 막지 않는다', () => {
        // 제목이 맨 앞(0번)이고 바로 뒤가 이름을 교정한 그림인 경우도 함께 본다.
        expect(layoutAfter([heading(fitnessTitle), oldImage('WS-4 제품속성적합도')], fitness)).toEqual(['heading', 'NEW']);
    });

    it('그림과 같은 이름의 표는 기존 그림으로 보지 않는다', () => {
        const table: FinalReportBlock = { kind: 'dataTable', title: kanoTitle, headers: [], rows: [] };
        expect(layoutAfter([table, heading(kanoTitle), paragraph(MISSING_CAPTURE)], kano)).toEqual(['dataTable', 'heading', 'NEW']);
    });

    it('맨 앞(0번)에 있는 기존 그림도 갈아 끼운다', () => {
        expect(layoutAfter([oldImage(kanoTitle), paragraph('분석')], kano)).toEqual(['NEW', 'paragraph']);
    });

    it('절 제목과 같은 글의 문단은 절 제목으로 보지 않는다', () => {
        expect(layoutAfter([paragraph(kanoTitle), heading(kanoTitle), paragraph(MISSING_CAPTURE)], kano)).toEqual(['paragraph', 'heading', 'NEW']);
    });

    it.each([
        ['절 제목이 마지막 블록이다', [heading(kanoTitle)]],
        ['제목 뒤가 누락 안내와 같은 글의 제목이다', [heading(kanoTitle), heading(MISSING_CAPTURE)]],
        ['절 제목 없이 다른 그림만 있다', [oldImage('다른 그림')]],
        ['WS-4 절 제목만 있다', [heading(WS4_HEADING)]],
    ])('Kano 그림 자리가 없다: %s', (_, blocks) => {
        expect(hasWorksheetImageSlot(withBlocks(blocks as FinalReportBlock[]), 'kano-aggregation')).toBe(false);
    });

    it('WS-4 절 제목이 없으면 적합도 그림 자리도 없다', () => {
        expect(hasWorksheetImageSlot(withBlocks([paragraph('무관한 문단')]), 'fitness')).toBe(false);
    });

    it('WS-4 절은 같은 글의 문단이나 다른 제목이 아니라 그 절 제목에서 시작한다', () => {
        const blocks = [heading('개요'), paragraph(WS4_HEADING), heading(WS4_HEADING), paragraph('분석'), heading('다음 절')];
        expect(layoutAfter(blocks, fitness)).toEqual(['heading', 'paragraph', 'heading', 'paragraph', 'NEW', 'heading']);
    });

    it('WS-4 절이 문서 맨 앞에서 시작해 끝까지 이어지면 맨 끝에 넣는다', () => {
        expect(layoutAfter([heading(WS4_HEADING), paragraph('분석')], fitness)).toEqual(['heading', 'paragraph', 'NEW']);
    });

    it('WS-4 절은 쪽 나눔에서도 끝난다', () => {
        const blocks: FinalReportBlock[] = [heading(WS4_HEADING), paragraph('분석'), { kind: 'pageBreak' }, paragraph('다음 장')];
        expect(layoutAfter(blocks, fitness)).toEqual(['heading', 'paragraph', 'NEW', 'pageBreak', 'paragraph']);
    });

    it('누락 안내와 같은 글의 제목은 안내로 보지 않고 절의 끝으로 본다', () => {
        expect(layoutAfter([heading(WS4_HEADING), heading(FITNESS_MISSING)], fitness)).toEqual(['heading', 'NEW', 'heading']);
    });

    it('WS-4 절 안의 누락 안내 문단을 그림으로 바꾼다', () => {
        expect(layoutAfter([heading(WS4_HEADING), paragraph('분석'), paragraph(FITNESS_MISSING), heading('다음 절')], fitness))
            .toEqual(['heading', 'paragraph', 'NEW', 'heading']);
    });
});
