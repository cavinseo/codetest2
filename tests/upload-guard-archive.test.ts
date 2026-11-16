// 엑셀 업로드 관문이 SheetJS 가 실제로 읽는 값을 기준으로 막는지 검증한다.
//
// 예전 검사는 ZIP 중앙 디렉터리에 적힌 크기만 봤다. SheetJS 는 로컬 헤더를 믿고
// 스트림 끝까지 풀기 때문에, 선언값을 작게 적은 압축 폭탄이 그대로 통과했다.
import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'zlib';
import * as XLSX from 'xlsx';
import {
    MAX_EXCEL_UNCOMPRESSED_BYTES,
    MAX_SHEET_CELLS,
    MAX_SHEET_COLUMNS,
    MAX_SHEET_ROWS,
    checkExcelArchiveSafety,
    checkWorkbookSheetRanges,
} from '../lib/upload-guard';
import { parseExcelFile } from '../lib/excel-parser';
import { BusinessPlanTemplateError, parseBusinessPlanWorkbook } from '../lib/business-plan-template';
import { parseKanoInviteWorkbook } from '../lib/kano-invite-template';

interface ZipEntry {
    name?: string;
    /** 압축 전 내용. */
    content: Buffer;
    method?: number;
    /** 로컬 헤더에 적을 압축 해제 크기. 기본은 실제 크기. */
    localUncompressed?: number;
    /** 중앙 디렉터리에 적을 크기. 기본은 실제 크기. */
    centralUncompressed?: number;
    centralCompressed?: number;
    localExtra?: Buffer;
    centralExtra?: Buffer;
}

function buildZip(entries: ZipEntry[], trailer: Buffer = Buffer.alloc(0)): Uint8Array {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
        const name = Buffer.from(entry.name ?? 'xl/worksheets/sheet1.xml');
        const method = entry.method ?? 8;
        const data = method === 8 ? deflateRawSync(entry.content) : entry.content;
        const localExtra = entry.localExtra ?? Buffer.alloc(0);
        const centralExtra = entry.centralExtra ?? Buffer.alloc(0);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(method, 8);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(entry.localUncompressed ?? entry.content.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(localExtra.length, 28);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(method, 10);
        central.writeUInt32LE(entry.centralCompressed ?? data.length, 20);
        central.writeUInt32LE(entry.centralUncompressed ?? entry.content.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(centralExtra.length, 30);
        central.writeUInt32LE(offset, 42);

        locals.push(local, name, localExtra, data);
        centrals.push(central, name, centralExtra);
        offset += 30 + name.length + localExtra.length + data.length;
    }
    const centralDirectory = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDirectory.length, 12);
    eocd.writeUInt32LE(offset, 16);
    return new Uint8Array(Buffer.concat([...locals, centralDirectory, eocd, trailer]));
}

const ZIP64_EXTRA = (() => {
    const extra = Buffer.alloc(20);
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(16, 2);
    return extra;
})();

const BOMB_BYTES = MAX_EXCEL_UNCOMPRESSED_BYTES + 1024;

function workbookBytes(): Buffer {
    const sheet = XLSX.utils.aoa_to_sheet([['이름', '이메일'], ['홍길동', 'hong@example.com']]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '명단');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * 셀은 그대로 두고 시트가 선언한 범위만 바꾼 xlsx.
 * `!ref` 를 바꿔 XLSX.write 로 쓰면 SheetJS 가 그 범위 전체를 실제로 훑으므로
 * 공격 파일을 그렇게는 만들 수 없다. 완성된 파일의 dimension 태그만 고친다.
 */
function workbookBytesWithDimension(ref: string): Buffer {
    const archive = XLSX.CFB.read(workbookBytes(), { type: 'buffer' });
    const sheetXml = archive.FileIndex[archive.FullPaths.findIndex((path: string) => path.endsWith('xl/worksheets/sheet1.xml'))];
    if (!sheetXml) throw new Error('sheet1.xml 을 찾지 못했다');
    const xml = Buffer.from(sheetXml.content as Uint8Array).toString('utf8');
    if (!/<dimension ref="[^"]*"\/>/.test(xml)) throw new Error('dimension 태그를 찾지 못했다');
    sheetXml.content = Buffer.from(xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="${ref}"/>`), 'utf8');
    return XLSX.CFB.write(archive, { fileType: 'zip', type: 'buffer' }) as Buffer;
}

describe('checkExcelArchiveSafety — 실제 압축 해제 기준', () => {
    it('SheetJS 가 만든 정상 xlsx 는 통과시킨다', () => {
        expect(checkExcelArchiveSafety('명단.xlsx', new Uint8Array(workbookBytes()))).toBeNull();
    });

    it('직접 만든 정상 ZIP(압축·무압축 항목)은 통과시킨다', () => {
        const zip = buildZip([
            { content: Buffer.from('<worksheet/>') },
            { name: 'docProps/app.xml', content: Buffer.from('<Properties/>'), method: 0 },
        ]);

        expect(checkExcelArchiveSafety('safe.xlsx', zip)).toBeNull();
    });

    it('스트리밍으로 써서 로컬 헤더 크기가 0 인 정상 항목은 통과시킨다', () => {
        const zip = buildZip([{ content: Buffer.from('<worksheet/>'), localUncompressed: 0 }]);

        expect(checkExcelArchiveSafety('streamed.xlsx', zip)).toBeNull();
    });

    it('선언 크기를 작게 속인 압축 폭탄을 막는다', () => {
        // 중앙 디렉터리는 100바이트라고 하고 로컬 헤더는 0 이라 SheetJS 가 끝없이 키운다.
        const zip = buildZip([{
            content: Buffer.alloc(BOMB_BYTES), localUncompressed: 0, centralUncompressed: 100, centralCompressed: 100,
        }]);

        const result = checkExcelArchiveSafety('bomb.xlsx', zip);

        expect(result).toMatchObject({ status: 413 });
        expect(result?.error).toContain('압축 해제 크기');
    });

    it('여러 항목의 합이 한도를 넘어도 막는다', () => {
        const half = Buffer.alloc(Math.floor(BOMB_BYTES / 2) + 1);
        const zip = buildZip([
            { name: 'a.xml', content: half, localUncompressed: 0, centralUncompressed: 1, centralCompressed: 1 },
            { name: 'b.xml', content: half, localUncompressed: 0, centralUncompressed: 1, centralCompressed: 1 },
        ]);

        expect(checkExcelArchiveSafety('split.xlsx', zip)).toMatchObject({ status: 413 });
    });

    it('ZIP 을 .xls 로 이름 붙여도 검사를 건너뛰지 못한다', () => {
        // SheetJS 는 확장자가 아니라 매직 바이트로 ZIP 을 알아본다.
        const zip = buildZip([{
            content: Buffer.alloc(BOMB_BYTES), localUncompressed: 0, centralUncompressed: 100, centralCompressed: 100,
        }]);

        expect(checkExcelArchiveSafety('bomb.xls', zip)).toMatchObject({ status: 413 });
    });

    it('로컬 헤더의 선언 크기가 실제와 다르면 막는다', () => {
        // SheetJS 는 0 이 아닌 선언 크기를 그대로 할당한다. 4GB 를 적어 둘 수 있다.
        const zip = buildZip([{ content: Buffer.from('<worksheet/>'), localUncompressed: 0xfffffff0 }]);

        expect(checkExcelArchiveSafety('lying.xlsx', zip)).toMatchObject({ status: 400 });
    });

    it('ZIP64 확장 필드가 있으면 막는다', () => {
        // SheetJS 는 이 필드의 크기로 헤더 값을 덮어쓴다.
        const content = Buffer.from('<worksheet/>');

        expect(checkExcelArchiveSafety('local64.xlsx', buildZip([{ content, localExtra: ZIP64_EXTRA }])))
            .toMatchObject({ status: 413 });
        expect(checkExcelArchiveSafety('central64.xlsx', buildZip([{ content, centralExtra: ZIP64_EXTRA }])))
            .toMatchObject({ status: 413 });
    });

    it('지원하지 않는 압축 방식과 깨진 스트림을 막는다', () => {
        expect(checkExcelArchiveSafety('lzma.xlsx', buildZip([{ content: Buffer.from('x'), method: 14 }])))
            .toMatchObject({ status: 400 });

        const broken = buildZip([{ content: Buffer.from('<worksheet/>') }]);
        const nameLength = 'xl/worksheets/sheet1.xml'.length;
        broken.fill(0xff, 30 + nameLength, 30 + nameLength + 6);

        expect(checkExcelArchiveSafety('broken.xlsx', broken)).toMatchObject({ status: 400 });
    });

    it('로컬 헤더 위치가 파일 밖을 가리키면 막는다', () => {
        const zip = buildZip([{ content: Buffer.from('<worksheet/>') }]);
        const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
        const centralOffset = view.getUint32(zip.length - 22 + 16, true);
        view.setUint32(centralOffset + 42, zip.length + 100, true);

        expect(checkExcelArchiveSafety('offset.xlsx', zip)).toMatchObject({ status: 400 });
    });

    it('파일 끝에 잘린 EOCD 서명을 덧붙여 다른 디렉터리를 읽게 하지 못한다', () => {
        // SheetJS 는 끝에서 처음 만나는 서명을 쓴다. 검사가 그보다 앞의 정상 EOCD 를
        // 보면 검사한 디렉터리와 파서가 읽는 디렉터리가 달라진다.
        const trailer = Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0]);
        const zip = buildZip([{ content: Buffer.from('<worksheet/>') }], trailer);

        expect(checkExcelArchiveSafety('trailer.xlsx', zip)).toMatchObject({ status: 400 });
    });

    it('ZIP 이 아닌 내용은 .xlsx 면 거절하고 구형 xls·csv 는 파서에 맡긴다', () => {
        const notZip = new Uint8Array(Buffer.from('이름,이메일\n홍길동,hong@example.com'));

        expect(checkExcelArchiveSafety('fake.xlsx', notZip)).toMatchObject({ status: 400 });
        expect(checkExcelArchiveSafety('legacy.xls', notZip)).toBeNull();
        expect(checkExcelArchiveSafety('list.csv', notZip)).toBeNull();
        expect(checkExcelArchiveSafety('tiny.xls', new Uint8Array([0x50, 0x4b]))).toBeNull();
    });
});

describe('checkWorkbookSheetRanges', () => {
    const workbookOf = (ref?: string) => ({ SheetNames: ['시트'], Sheets: { 시트: ref ? { '!ref': ref } : {} } });

    it('보통 크기의 시트와 범위가 없는 빈 시트는 통과시킨다', () => {
        expect(checkWorkbookSheetRanges(workbookOf('A1:Z500'))).toBeNull();
        expect(checkWorkbookSheetRanges(workbookOf())).toBeNull();
        expect(checkWorkbookSheetRanges({ SheetNames: ['없는 시트'], Sheets: {} })).toBeNull();
    });

    it('한도와 정확히 같은 범위는 통과시킨다', () => {
        expect(checkWorkbookSheetRanges(workbookOf(`A1:A${MAX_SHEET_ROWS}`))).toBeNull();
        expect(checkWorkbookSheetRanges(workbookOf(`A1:${XLSX.utils.encode_col(MAX_SHEET_COLUMNS - 1)}1`))).toBeNull();
        expect(checkWorkbookSheetRanges(workbookOf(`A1:${XLSX.utils.encode_col(99)}${MAX_SHEET_CELLS / 100}`))).toBeNull();
    });

    it('시트 전체를 범위로 선언한 파일을 막는다', () => {
        const result = checkWorkbookSheetRanges(workbookOf('A1:XFD1048576'));

        expect(result).toMatchObject({ status: 413 });
        expect(result?.error).toContain('시트 범위가 너무 큽니다');
    });

    it('행·열·칸 수 한도를 각각 넘으면 막는다', () => {
        expect(checkWorkbookSheetRanges(workbookOf(`A1:A${MAX_SHEET_ROWS + 1}`))).toMatchObject({ status: 413 });
        expect(checkWorkbookSheetRanges(workbookOf(`A1:${XLSX.utils.encode_col(MAX_SHEET_COLUMNS)}1`)))
            .toMatchObject({ status: 413 });
        expect(checkWorkbookSheetRanges(workbookOf(`A1:${XLSX.utils.encode_col(99)}${MAX_SHEET_CELLS / 100 + 1}`)))
            .toMatchObject({ status: 413 });
    });

    it('뒤쪽 시트만 커도 막는다', () => {
        const workbook = {
            SheetNames: ['작은 시트', '큰 시트'],
            Sheets: { '작은 시트': { '!ref': 'A1:B2' }, '큰 시트': { '!ref': 'A1:XFD1048576' } },
        };

        expect(checkWorkbookSheetRanges(workbook)).toMatchObject({ status: 413 });
    });
});

describe('범위를 부풀린 엑셀을 각 파서가 펼치기 전에 거절한다', () => {
    // 몇 KB 짜리 파일이지만 sheet_to_json 이 범위대로 170억 칸을 만들려 한다.
    const inflated = workbookBytesWithDimension('A1:XFD1048576');

    it('부풀린 범위가 파일에 실제로 기록되고 압축 검사는 통과한다(테스트 전제)', () => {
        const sheet = XLSX.read(inflated, { type: 'buffer' }).Sheets['명단'];

        expect(sheet['!ref']).toBe('A1:XFD1048576');
        expect(inflated.length).toBeLessThan(100 * 1024);
        // 압축 해제 크기로는 걸리지 않는다. 범위 검사가 따로 필요한 이유다.
        expect(checkExcelArchiveSafety('inflated.xlsx', new Uint8Array(inflated))).toBeNull();
    });

    it('워크시트 가져오기 파서는 오류로 보고한다', async () => {
        const file = new File([new Uint8Array(inflated)], 'inflated.xlsx');

        const parsed = await parseExcelFile(file);

        expect(parsed.sheets).toEqual([]);
        expect(parsed.parseErrors[0]).toMatchObject({ severity: 'error' });
        expect(parsed.parseErrors[0].message).toContain('시트 범위가 너무 큽니다');
    });

    it('사업계획 양식 파서는 양식 오류로 거절한다', () => {
        expect(() => parseBusinessPlanWorkbook(inflated)).toThrow(BusinessPlanTemplateError);
        expect(() => parseBusinessPlanWorkbook(inflated)).toThrow('시트 범위가 너무 큽니다');
    });

    it('초대 명단 파서는 413 으로 거절한다', () => {
        let thrown: unknown;
        try { parseKanoInviteWorkbook(inflated); } catch (error) { thrown = error; }

        expect(thrown).toMatchObject({ status: 413 });
        expect((thrown as Error).message).toContain('시트 범위가 너무 큽니다');
    });

    it('범위가 정상인 같은 파일은 거절하지 않는다', () => {
        expect(() => parseKanoInviteWorkbook(workbookBytes())).not.toThrow();
        expect(() => parseKanoInviteWorkbook(workbookBytesWithDimension('A1:B2'))).not.toThrow();
    });
});
