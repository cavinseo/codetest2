// 업로드된 엑셀 파일의 공통 검증.
//
// 세 업로드 라우트가 각자 10MB 검사를 복붙하고 있었는데, Kano 업로드만 그 검사가
// 빠져 있었다. 크기 제한이 없으면 임의 크기의 xlsx 를 동기 파싱하게 되어
// 이벤트 루프가 막히고 메모리가 터진다(압축 폭탄 포함).

import { inflateRawSync } from 'zlib';
import * as XLSX from 'xlsx';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_EXCEL_ARCHIVE_ENTRIES = 10_000;
export const MAX_EXCEL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

export interface UploadGuardFailure {
    error: string;
    status: 400 | 413;
}

export type UploadGuardResult =
    | { ok: true; file: File }
    | { ok: false; failure: UploadGuardFailure };

/**
 * checkUploadedExcel 의 결과를 타입 좁히기와 함께 돌려준다.
 * 라우트에서 `if (!result.ok) return ...` 뒤에 result.file 을 File 로 쓸 수 있다.
 */
export function guardUploadedExcel(
    value: unknown,
    options: { maxBytes?: number; allowCsv?: boolean } = {}
): UploadGuardResult {
    const failure = checkUploadedExcel(value, options);
    if (failure) return { ok: false, failure };
    return { ok: true, file: value as File };
}

// 화면(파일 고르기)과 서버(업로드 라우트)가 같은 확장자 기준·같은 문구를 쓰도록 내보낸다.
// 화면 다섯 곳이 각자 endsWith 를 적고 있었다(2026-10-25 코드 리뷰 D5).
export const EXCEL_FILE_TYPE_ERROR = '.xlsx 또는 .xls 파일만 업로드할 수 있습니다.';

export function isExcelFileName(fileName: string): boolean {
    const lower = fileName.trim().toLowerCase();
    return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}

function hasSupportedExtension(fileName: string, allowCsv = false): boolean {
    return isExcelFileName(fileName) || (allowCsv && fileName.trim().toLowerCase().endsWith('.csv'));
}

/**
 * 업로드 값이 엑셀 파일로 받아들일 만한지 본다.
 * 문제가 없으면 null 을 돌려준다. 라우트는 결과를 그대로 응답으로 만들면 된다.
 */
export function checkUploadedExcel(
    value: unknown,
    options: { maxBytes?: number; allowCsv?: boolean } = {}
): UploadGuardFailure | null {
    const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;

    if (!(value instanceof File)) {
        return { error: '업로드할 엑셀 파일이 필요합니다.', status: 400 };
    }
    if (value.size === 0) {
        return { error: '빈 파일입니다. 내용이 있는 엑셀 파일을 올려 주세요.', status: 400 };
    }
    if (value.size > maxBytes) {
        return {
            error: `파일 크기는 ${Math.floor(maxBytes / (1024 * 1024))}MB를 초과할 수 없습니다.`,
            status: 413,
        };
    }
    if (!hasSupportedExtension(value.name, options.allowCsv)) {
        return { error: options.allowCsv ? '.xlsx, .xls 또는 .csv 파일만 업로드할 수 있습니다.' : EXCEL_FILE_TYPE_ERROR, status: 400 };
    }
    return null;
}

function zipUInt16(bytes: Uint8Array, offset: number): number {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function zipUInt32(bytes: Uint8Array, offset: number): number {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function archiveFailure(error: string, status: 400 | 413 = 400): UploadGuardFailure {
    return { error, status };
}

const ZIP64_EXTRA_FIELD_ID = 0x0001;
const INVALID_ARCHIVE_MSG = '올바른 .xlsx 압축 파일이 아닙니다.';
const ZIP64_MSG = 'ZIP64 형식의 엑셀 파일은 업로드할 수 없습니다.';

function uncompressedLimitFailure(): UploadGuardFailure {
    return archiveFailure(`엑셀 압축 해제 크기는 ${MAX_EXCEL_UNCOMPRESSED_BYTES / (1024 * 1024)}MB를 초과할 수 없습니다.`, 413);
}

/**
 * SheetJS 가 ZIP 으로 읽을 내용인가. 판정은 파일명이 아니라 SheetJS 와 같은
 * 매직 바이트로 한다 — 확장자만 보면 ZIP 을 `.xls` 로 이름 붙여 검사를 건너뛴다.
 */
function looksLikeZip(bytes: Uint8Array): boolean {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] < 0x09 && bytes[3] < 0x09;
}

/** extra field 목록에 ZIP64 확장 정보가 있는가. SheetJS 의 순회 방식과 같게 읽는다. */
function hasZip64ExtraField(bytes: Uint8Array, start: number, length: number): boolean {
    const end = start + length;
    let cursor = start;
    while (cursor <= end - 4) {
        if (zipUInt16(bytes, cursor) === ZIP64_EXTRA_FIELD_ID) return true;
        cursor += 4 + zipUInt16(bytes, cursor + 2);
    }
    return false;
}

/**
 * 항목 하나를 실제로 풀어 본 크기를 돌려준다. 실패하면 UploadGuardFailure 다.
 *
 * 중앙 디렉터리에 적힌 크기만 믿으면 안 된다. SheetJS 는 중앙 디렉터리가 아니라
 * 로컬 헤더의 크기를 쓰고, 그 값이 0 이면 스트림이 끝날 때까지 버퍼를 계속
 * 키우며, 0 이 아니면 그 크기를 그대로 할당한다. 그래서 선언값을 속인 압축
 * 폭탄이 선언값 검사를 통과한 뒤 파서에서 터진다. 선언값 대신 상한을 둔 실제
 * 해제 결과로 판정하고, 로컬 헤더의 선언값은 그 결과와 같을 때만 받아들인다.
 */
function inflatedEntrySize(
    bytes: Uint8Array,
    localOffset: number,
    dataEnd: number,
    remainingBudget: number
): number | UploadGuardFailure {
    if (localOffset + 30 > dataEnd || zipUInt32(bytes, localOffset) !== 0x04034b50) {
        return archiveFailure(INVALID_ARCHIVE_MSG);
    }
    const method = zipUInt16(bytes, localOffset + 8);
    const declaredCompressed = zipUInt32(bytes, localOffset + 18);
    const declaredUncompressed = zipUInt32(bytes, localOffset + 22);
    const nameLength = zipUInt16(bytes, localOffset + 26);
    const extraLength = zipUInt16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + nameLength + extraLength;
    if (dataStart > dataEnd) return archiveFailure(INVALID_ARCHIVE_MSG);
    if (hasZip64ExtraField(bytes, localOffset + 30 + nameLength, extraLength)) {
        return archiveFailure(ZIP64_MSG, 413);
    }

    if (method === 0) {
        // 무압축 항목은 파일 안의 바이트를 잘라 쓸 뿐이라 파일 크기를 넘지 못한다.
        if (declaredCompressed > dataEnd - dataStart) return archiveFailure(INVALID_ARCHIVE_MSG);
        return declaredCompressed;
    }
    if (method !== 8) return archiveFailure(INVALID_ARCHIVE_MSG);

    let inflated: number;
    try {
        // 스트림 끝 뒤의 바이트는 zlib 이 무시한다. SheetJS 도 선언된 압축 크기가
        // 아니라 스트림 끝까지 읽으므로 같은 범위를 넘겨야 같은 결과를 본다.
        inflated = inflateRawSync(bytes.subarray(dataStart, dataEnd), { maxOutputLength: remainingBudget + 1 }).length;
    } catch (error) {
        const code = (error as { code?: unknown }).code;
        return code === 'ERR_BUFFER_TOO_LARGE' ? uncompressedLimitFailure() : archiveFailure(INVALID_ARCHIVE_MSG);
    }
    if (inflated > remainingBudget) return uncompressedLimitFailure();
    // 스트리밍으로 쓴 정상 파일은 로컬 헤더 크기가 0 이다(data descriptor).
    if (declaredUncompressed !== 0 && declaredUncompressed !== inflated) {
        return archiveFailure(INVALID_ARCHIVE_MSG);
    }
    return inflated;
}

/**
 * SheetJS 보다 먼저 압축 폭탄을 막는다. ZIP 이 아닌 내용(구형 xls, csv)은
 * 압축 해제 단계가 없으므로 파서에 맡긴다.
 */
export function checkExcelArchiveSafety(fileName: string, bytes: Uint8Array): UploadGuardFailure | null {
    if (!looksLikeZip(bytes)) {
        return fileName.trim().toLowerCase().endsWith('.xlsx') ? archiveFailure(INVALID_ARCHIVE_MSG) : null;
    }

    const minimumEocdLength = 22;
    // SheetJS 는 파일 끝에서부터 처음 만나는 EOCD 서명을 쓴다. 같은 위치에서
    // 찾기 시작해야 "검사한 디렉터리"와 "파서가 읽는 디렉터리"가 갈리지 않는다.
    let eocdOffset = -1;
    const minimumOffset = Math.max(0, bytes.length - minimumEocdLength - 0xffff);
    for (let offset = bytes.length - 4; offset >= minimumOffset; offset--) {
        if (zipUInt32(bytes, offset) === 0x06054b50) {
            eocdOffset = offset;
            break;
        }
    }
    if (eocdOffset < 0 || eocdOffset + minimumEocdLength > bytes.length) return archiveFailure(INVALID_ARCHIVE_MSG);

    const entryCount = zipUInt16(bytes, eocdOffset + 10);
    const centralDirectorySize = zipUInt32(bytes, eocdOffset + 12);
    const centralDirectoryOffset = zipUInt32(bytes, eocdOffset + 16);
    if (entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
        return archiveFailure(ZIP64_MSG, 413);
    }
    if (entryCount > MAX_EXCEL_ARCHIVE_ENTRIES) {
        return archiveFailure(`엑셀 압축 파일에는 최대 ${MAX_EXCEL_ARCHIVE_ENTRIES.toLocaleString()}개 항목만 포함할 수 있습니다.`, 413);
    }
    const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
    if (centralDirectoryEnd > eocdOffset || centralDirectoryEnd < centralDirectoryOffset) {
        return archiveFailure(INVALID_ARCHIVE_MSG);
    }

    let cursor = centralDirectoryOffset;
    let declaredBytes = 0;
    let inflatedBytes = 0;
    for (let entry = 0; entry < entryCount; entry++) {
        if (cursor + 46 > centralDirectoryEnd || zipUInt32(bytes, cursor) !== 0x02014b50) {
            return archiveFailure(INVALID_ARCHIVE_MSG);
        }
        const compressedSize = zipUInt32(bytes, cursor + 20);
        const uncompressedSize = zipUInt32(bytes, cursor + 24);
        const nameLength = zipUInt16(bytes, cursor + 28);
        const extraLength = zipUInt16(bytes, cursor + 30);
        const commentLength = zipUInt16(bytes, cursor + 32);
        const localOffset = zipUInt32(bytes, cursor + 42);
        if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
            return archiveFailure(ZIP64_MSG, 413);
        }
        declaredBytes += uncompressedSize;
        if (declaredBytes > MAX_EXCEL_UNCOMPRESSED_BYTES) return uncompressedLimitFailure();
        if (uncompressedSize > 1024 * 1024 && compressedSize > 0 && uncompressedSize / compressedSize > 100) {
            return archiveFailure('엑셀 압축 비율이 안전 한도를 초과했습니다.', 413);
        }
        const next = cursor + 46 + nameLength + extraLength + commentLength;
        if (next > centralDirectoryEnd || next < cursor) {
            return archiveFailure(INVALID_ARCHIVE_MSG);
        }
        if (hasZip64ExtraField(bytes, cursor + 46 + nameLength, extraLength)) {
            return archiveFailure(ZIP64_MSG, 413);
        }
        const inflated = inflatedEntrySize(bytes, localOffset, centralDirectoryOffset, MAX_EXCEL_UNCOMPRESSED_BYTES - inflatedBytes);
        if (typeof inflated !== 'number') return inflated;
        inflatedBytes += inflated;
        cursor = next;
    }
    return cursor === centralDirectoryEnd ? null : archiveFailure(INVALID_ARCHIVE_MSG);
}

// ─── 시트 범위 ─────────────────────────────────────────────────────────

export const MAX_SHEET_ROWS = 50_000;
export const MAX_SHEET_COLUMNS = 1_000;
export const MAX_SHEET_CELLS = 1_000_000;

/**
 * 시트가 선언한 범위가 지나치게 크면 막는다.
 *
 * sheet_to_json 은 실제 셀 수가 아니라 `!ref` 범위만큼 행·열을 만든다. 그래서
 * 몇 KB 짜리 파일도 범위를 A1:XFD1048576 으로 적어 두면 170억 칸을 만들다
 * 메모리가 터진다. 압축 해제 크기 검사로는 걸리지 않으므로 XLSX.read 직후,
 * sheet_to_json 을 부르기 전에 이 검사를 거쳐야 한다.
 */
export function checkWorkbookSheetRanges(
    workbook: { SheetNames: string[]; Sheets: Record<string, { '!ref'?: string } | undefined> }
): UploadGuardFailure | null {
    for (const sheetName of workbook.SheetNames) {
        const ref = workbook.Sheets[sheetName]?.['!ref'];
        if (!ref) continue;
        const range = XLSX.utils.decode_range(ref);
        const rows = range.e.r + 1;
        const columns = range.e.c + 1;
        if (rows > MAX_SHEET_ROWS || columns > MAX_SHEET_COLUMNS || rows * columns > MAX_SHEET_CELLS) {
            return {
                error: `시트 범위가 너무 큽니다(${rows.toLocaleString()}행 × ${columns.toLocaleString()}열). `
                    + `한 시트는 ${MAX_SHEET_ROWS.toLocaleString()}행, ${MAX_SHEET_COLUMNS.toLocaleString()}열, `
                    + `${MAX_SHEET_CELLS.toLocaleString()}칸까지 올릴 수 있습니다. 빈 행·열의 서식을 지운 뒤 다시 저장해 주세요.`,
                status: 413,
            };
        }
    }
    return null;
}

export const MAX_OFFLINE_HTML_BYTES = 2 * 1024 * 1024;
export const MAX_OFFLINE_HTML_FILES = 100;

function hasSupportedOfflineHtmlExtension(fileName: string): boolean {
    const lower = fileName.trim().toLowerCase();
    return lower.endsWith('.html') || lower.endsWith('.htm');
}

/**
 * 오프라인 응답지는 낱장이라 수십 KB 다. 엑셀의 10MB 를 그대로 쓰면 100장을 받을 때
 * 1GB 가 되므로 한도를 따로 둔다.
 */
export function guardUploadedOfflineHtml(value: unknown): UploadGuardResult {
    if (!(value instanceof File)) {
        return {
            ok: false,
            failure: { error: '업로드할 HTML 응답지가 필요합니다.', status: 400 },
        };
    }
    if (value.size === 0) {
        return {
            ok: false,
            failure: { error: '빈 파일입니다. 내용이 있는 HTML 응답지를 올려 주세요.', status: 400 },
        };
    }
    if (value.size > MAX_OFFLINE_HTML_BYTES) {
        return {
            ok: false,
            failure: { error: 'HTML 응답지 하나는 2MB를 초과할 수 없습니다.', status: 413 },
        };
    }
    if (!hasSupportedOfflineHtmlExtension(value.name)) {
        return {
            ok: false,
            failure: { error: '.html 또는 .htm 파일만 업로드할 수 있습니다.', status: 400 },
        };
    }
    return { ok: true, file: value };
}
