// 업로드된 엑셀 파일의 공통 검증.
//
// 세 업로드 라우트가 각자 10MB 검사를 복붙하고 있었는데, Kano 업로드만 그 검사가
// 빠져 있었다. 크기 제한이 없으면 임의 크기의 xlsx 를 동기 파싱하게 되어
// 이벤트 루프가 막히고 메모리가 터진다(압축 폭탄 포함).

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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
    options: { maxBytes?: number } = {}
): UploadGuardResult {
    const failure = checkUploadedExcel(value, options);
    if (failure) return { ok: false, failure };
    return { ok: true, file: value as File };
}

function hasSupportedExtension(fileName: string): boolean {
    const lower = fileName.trim().toLowerCase();
    return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}

/**
 * 업로드 값이 엑셀 파일로 받아들일 만한지 본다.
 * 문제가 없으면 null 을 돌려준다. 라우트는 결과를 그대로 응답으로 만들면 된다.
 */
export function checkUploadedExcel(
    value: unknown,
    options: { maxBytes?: number } = {}
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
    if (!hasSupportedExtension(value.name)) {
        return { error: '.xlsx 또는 .xls 파일만 업로드할 수 있습니다.', status: 400 };
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
