// 그림만 갱신할 때 보고서 교정 내용과 각 그림 위치가 보존되는지 검증한다.
import { expect, it } from 'vitest';
import { CAPTURED_WORKSHEET_TITLES, replaceWorksheetImages, type CapturedWorksheetImage, type FinalReportModel } from '../lib/final-report-document';

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
