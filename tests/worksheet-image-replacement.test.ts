// 그림만 갱신할 때 보고서 교정 내용과 각 그림 위치가 보존되는지 검증한다.
import { describe, expect, it } from 'vitest';
import {
    CAPTURED_WORKSHEET_TITLES, hasWorksheetImageSlot, replaceWorksheetImages,
    type CapturedWorksheetImage, type FinalReportBlock, type FinalReportModel,
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
    // 그림 자리를 잘못 고르면 사용자가 교정한 문단이나 표를 그림이 덮어쓴다.
    const [fitness, kano] = images;
    const KANO = CAPTURED_WORKSHEET_TITLES['kano-aggregation'];
    const FITNESS = CAPTURED_WORKSHEET_TITLES.fitness;
    const WS4 = '제품/서비스 속성 적합도 (WS-4)';
    const MISSING = '그림을 캡처하지 못했습니다';
    const NOTICE = '속성 적합도 행렬이 저장되어 있지 않습니다. 평가 결과 그림은 미작성 상태입니다.';
    const heading = (text: string): FinalReportBlock => ({ kind: 'heading', text, level: 2 });
    const paragraph = (text: string): FinalReportBlock => ({ kind: 'paragraph', text });
    const picture = (title: string): FinalReportBlock => ({ kind: 'image', title, pngDataUrl: 'data:,old', widthMm: 1, heightMm: 1, landscape: false });
    const doc = (blocks: FinalReportBlock[]): FinalReportModel => ({ title: '보고서', fileName: '보고서.docx', blocks });
    const placed = (blocks: FinalReportBlock[], image: CapturedWorksheetImage) => {
        const result = replaceWorksheetImages(doc(blocks), [image]).blocks;
        return { index: result.findIndex(block => block.kind === 'image' && block.pngDataUrl === image.pngDataUrl), length: result.length, result };
    };

    it('WS-4 적합도 표가 있어도 다른 절의 그림 자리는 찾는다', () => {
        const blocks = [{ kind: 'dataTable', title: 'WS-4 제품속성적합도', headers: ['A'], rows: [] } as FinalReportBlock, heading(KANO), paragraph(MISSING)];
        expect(hasWorksheetImageSlot(doc(blocks), 'kano-aggregation')).toBe(true);
        expect(hasWorksheetImageSlot(doc(blocks), 'fitness')).toBe(false);
    });

    it('적합도 그림을 막는 것은 같은 이름의 표뿐이다', () => {
        expect(hasWorksheetImageSlot(doc([heading(FITNESS), picture('WS-4 제품속성적합도')]), 'fitness')).toBe(true);
    });

    it('그림과 같은 제목의 표를 그림으로 오인하지 않는다', () => {
        const table = { kind: 'dataTable', title: KANO, headers: ['A'], rows: [] } as FinalReportBlock;
        const { index, result } = placed([table, heading(KANO), paragraph(MISSING)], kano);
        expect(index).toBe(2);
        expect(result[0]).toEqual(table);
    });

    it('문서 맨 앞의 기존 그림도 갈아 끼운다', () => {
        expect(placed([picture(KANO)], kano)).toMatchObject({ index: 0, length: 1 });
    });

    it('제목과 같은 글의 문단을 절 제목으로 오인하지 않는다', () => {
        expect(placed([paragraph(KANO), heading(KANO), paragraph(MISSING)], kano)).toMatchObject({ index: 2, length: 3 });
    });

    it('절 제목 바로 뒤의 다른 제목 그림을 자리로 쓴다', () => {
        expect(placed([heading(KANO), picture('옛 그림')], kano)).toMatchObject({ index: 1, length: 2 });
    });

    it('맨 앞 절 제목 뒤의 누락 안내를 자리로 쓴다', () => {
        expect(placed([heading(KANO), paragraph(MISSING)], kano)).toMatchObject({ index: 1, length: 2 });
    });

    it.each<[string, FinalReportBlock[]]>([
        ['절 제목이 문서 끝에 있으면', [paragraph('본문'), heading(KANO)]],
        ['누락 안내와 같은 글의 제목은 자리가 아니다', [heading(KANO), heading(MISSING)]],
        ['절 제목이 없으면 맨 앞 그림을 쓰지 않는다', [picture('다른 그림')]],
        ['적합도가 아닌 그림은 WS-4 절로 넘어가지 않는다', [heading(WS4), paragraph(NOTICE)]],
    ])('%s 자리가 없다', (_case, blocks) => {
        expect(hasWorksheetImageSlot(doc(blocks), 'kano-aggregation')).toBe(false);
    });

    it('WS-4 절 제목이 없으면 적합도 그림 자리도 없다', () => {
        expect(hasWorksheetImageSlot(doc([paragraph('본문')]), 'fitness')).toBe(false);
    });

    it('WS-4 절이 문서 끝까지 이어지면 맨 끝에 덧붙인다', () => {
        expect(placed([heading(WS4), paragraph('분석')], fitness)).toMatchObject({ index: 2, length: 3 });
    });

    it('같은 글의 문단이 아니라 WS-4 절 제목을 기준으로 절 끝을 잡는다', () => {
        expect(placed([paragraph(WS4), heading(WS4), paragraph('분석')], fitness)).toMatchObject({ index: 3, length: 4 });
    });

    it('앞 절 제목이 아니라 WS-4 절 제목부터 다음 제목 앞까지를 절로 본다', () => {
        const blocks = [heading('앞 절'), paragraph('앞 내용'), heading(WS4), paragraph('분석'), heading('다음 절')];
        const { index, result } = placed(blocks, fitness);
        expect(index).toBe(4);
        expect(result[5]).toEqual(heading('다음 절'));
    });

    it('쪽 나눔에서도 WS-4 절이 끝난다', () => {
        const blocks = [heading(WS4), paragraph('분석'), { kind: 'pageBreak' } as FinalReportBlock, paragraph('다음 쪽')];
        expect(placed(blocks, fitness)).toMatchObject({ index: 2, length: 5 });
    });

    it('WS-4 절의 행렬 누락 안내는 그림으로 바꿔 끼운다', () => {
        expect(placed([heading(WS4), paragraph(NOTICE), heading('다음 절')], fitness)).toMatchObject({ index: 1, length: 3 });
    });
});
