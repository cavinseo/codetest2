// 업로드된 파일의 공통 검증.
//
// 당시 세 업로드 라우트가 각자 10MB 검사를 복붙하고 있었는데, Kano 업로드만 그 검사가
// 빠져 있었다. 크기 제한이 없으면 임의 크기의 xlsx 를 동기 파싱하게 되어
// 이벤트 루프가 막히고 메모리가 터진다(압축 폭탄 포함).
// 지금 이 모듈의 사용처는 Kano 엑셀 업로드 한 곳이며, 일반화한 checkUploadedFile 은 오프라인 답변 파일 업로드(Task 5)가 쓴다.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadGuardFailure {
    error: string;
    status: 400 | 413;
}

export type UploadGuardResult =
    | { ok: true; file: File }
    | { ok: false; failure: UploadGuardFailure };

function formatLimit(bytes: number): string {
    const mebibyte = 1024 * 1024;
    if (bytes % mebibyte === 0) return `${bytes / mebibyte}MB`;
    return `${Math.floor(bytes / 1024)}KB`;
}

export interface UploadFileRule {
    /** 소문자, 점 포함. 예: ['.json', '.kano.json'] */
    extensions: string[];
    maxBytes?: number;
    /** 오류 문구에 들어가는 이름. 예: '엑셀', '답변' */
    label: string;
}

export function checkUploadedFile(value: unknown, rule: UploadFileRule): UploadGuardFailure | null {
    const maxBytes = rule.maxBytes ?? MAX_UPLOAD_BYTES;
    if (!(value instanceof File)) {
        return { error: `업로드할 ${rule.label} 파일이 필요합니다.`, status: 400 };
    }
    if (value.size === 0) {
        return { error: `빈 파일입니다. 내용이 있는 ${rule.label} 파일을 올려 주세요.`, status: 400 };
    }
    if (value.size > maxBytes) {
        return { error: `파일 크기는 ${formatLimit(maxBytes)}를 초과할 수 없습니다.`, status: 413 };
    }
    const lower = value.name.trim().toLowerCase();
    if (!rule.extensions.some((extension) => lower.endsWith(extension))) {
        return { error: `${rule.extensions.join(' 또는 ')} 파일만 업로드할 수 있습니다.`, status: 400 };
    }
    return null;
}

export function guardUploadedFile(value: unknown, rule: UploadFileRule): UploadGuardResult {
    const failure = checkUploadedFile(value, rule);
    return failure ? { ok: false, failure } : { ok: true, file: value as File };
}

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

/**
 * 업로드 값이 엑셀 파일로 받아들일 만한지 본다.
 * 문제가 없으면 null 을 돌려준다. 라우트는 결과를 그대로 응답으로 만들면 된다.
 */
export function checkUploadedExcel(
    value: unknown,
    options: { maxBytes?: number } = {}
): UploadGuardFailure | null {
    return checkUploadedFile(value, {
        extensions: ['.xlsx', '.xls'],
        maxBytes: options.maxBytes,
        label: '엑셀',
    });
}
