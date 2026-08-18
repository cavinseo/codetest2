// 사업계획 파일의 직렬화, 파싱, 형식과 크기 검증을 제공하는 유틸리티

export const BUSINESS_PLAN_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const BUSINESS_PLAN_FILE_NAME_MAX_LENGTH = 255;

const STORAGE_PREFIX = 'business-plan-file:v1:';

// xlsx/xls 는 개요 자동 입력용 사업계획 양식을 첨부 그대로 보관하려고 허용한다.
const MIME_BY_EXTENSION: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
};

const ALLOWED_FILE_TYPES_MESSAGE = 'PDF, DOC, DOCX, TXT, XLSX, XLS 파일만 업로드할 수 있습니다.';

interface StoredBusinessPlanFile {
    version: 1;
    fileName: string;
    mimeType: string;
    dataUrl: string;
}

export interface BusinessPlanFileInfo {
    fileName: string;
    mimeType: string | null;
    dataUrl: string | null;
    size: number | null;
    isLegacy: boolean;
    displayValue: string;
}

export class BusinessPlanFileValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BusinessPlanFileValidationError';
    }
}

function getExtension(fileName: string) {
    const match = fileName.trim().toLowerCase().match(/\.([^.]+)$/);
    return match?.[1] ?? '';
}

function parseBase64DataUrl(dataUrl: string) {
    const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/);
    if (!match || match[2].length % 4 !== 0) return null;

    const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
    return {
        mimeType: match[1].toLowerCase(),
        size: (match[2].length * 3) / 4 - padding,
    };
}

function validateStoredFile(file: StoredBusinessPlanFile) {
    if (
        !file
        || file.version !== 1
        || typeof file.fileName !== 'string'
        || typeof file.mimeType !== 'string'
        || typeof file.dataUrl !== 'string'
    ) {
        throw new BusinessPlanFileValidationError('사업계획 파일 데이터 형식이 올바르지 않습니다.');
    }
    const fileName = file.fileName.trim();
    const mimeType = file.mimeType.toLowerCase();
    const extension = getExtension(fileName);
    const expectedMimeType = MIME_BY_EXTENSION[extension];

    if (!fileName || fileName.length > BUSINESS_PLAN_FILE_NAME_MAX_LENGTH) {
        throw new BusinessPlanFileValidationError('사업계획 파일명이 너무 깁니다.');
    }
    if (!expectedMimeType || expectedMimeType !== mimeType) {
        throw new BusinessPlanFileValidationError(ALLOWED_FILE_TYPES_MESSAGE);
    }

    const parsedDataUrl = parseBase64DataUrl(file.dataUrl);
    if (!parsedDataUrl || parsedDataUrl.mimeType !== mimeType) {
        throw new BusinessPlanFileValidationError('사업계획 파일 데이터 형식이 올바르지 않습니다.');
    }
    if (parsedDataUrl.size > BUSINESS_PLAN_FILE_MAX_BYTES) {
        throw new BusinessPlanFileValidationError('사업계획 파일은 10MB 이하만 업로드할 수 있습니다.');
    }

    return { fileName, mimeType, size: parsedDataUrl.size };
}

export function getBusinessPlanFileValidationError(file: Pick<File, 'name' | 'size' | 'type'>) {
    if (!file.name.trim() || file.name.trim().length > BUSINESS_PLAN_FILE_NAME_MAX_LENGTH) {
        return '사업계획 파일명이 너무 깁니다.';
    }
    const extension = getExtension(file.name);
    const expectedMimeType = MIME_BY_EXTENSION[extension];
    if (!expectedMimeType || (file.type && file.type.toLowerCase() !== expectedMimeType)) {
        return ALLOWED_FILE_TYPES_MESSAGE;
    }
    if (file.size > BUSINESS_PLAN_FILE_MAX_BYTES) {
        return '사업계획 파일은 10MB 이하만 업로드할 수 있습니다.';
    }
    return null;
}

export function serializeBusinessPlanFile(input: Omit<StoredBusinessPlanFile, 'version'>) {
    const storedFile: StoredBusinessPlanFile = { version: 1, ...input };
    const validated = validateStoredFile(storedFile);
    return `${STORAGE_PREFIX}${JSON.stringify({
        ...storedFile,
        fileName: validated.fileName,
        mimeType: validated.mimeType,
    })}`;
}

export function readAndSerializeBusinessPlanFile(file: File) {
    const validationError = getBusinessPlanFileValidationError(file);
    if (validationError) return Promise.reject(new BusinessPlanFileValidationError(validationError));

    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new BusinessPlanFileValidationError('사업계획 파일을 읽지 못했습니다.'));
        reader.onload = () => {
            try {
                const mimeType = file.type || MIME_BY_EXTENSION[getExtension(file.name)];
                const readerDataUrl = String(reader.result);
                const dataUrl = file.type
                    ? readerDataUrl
                    : `data:${mimeType};base64,${readerDataUrl.slice(readerDataUrl.indexOf(',') + 1)}`;
                resolve(serializeBusinessPlanFile({
                    fileName: file.name,
                    mimeType,
                    dataUrl,
                }));
            } catch (error) {
                reject(error);
            }
        };
        reader.readAsDataURL(file);
    });
}

export function parseBusinessPlanFile(value: string | null | undefined): BusinessPlanFileInfo | null {
    if (!value) return null;

    if (value.startsWith(STORAGE_PREFIX)) {
        try {
            const storedFile = JSON.parse(value.slice(STORAGE_PREFIX.length)) as StoredBusinessPlanFile;
            if (storedFile.version !== 1) throw new Error('Unsupported version');
            const validated = validateStoredFile(storedFile);
            return {
                fileName: validated.fileName,
                mimeType: validated.mimeType,
                dataUrl: storedFile.dataUrl,
                size: validated.size,
                isLegacy: false,
                displayValue: validated.fileName,
            };
        } catch {
            return {
                fileName: '사업계획 파일',
                mimeType: null,
                dataUrl: null,
                size: null,
                isLegacy: true,
                displayValue: '사업계획 파일 데이터를 읽을 수 없음',
            };
        }
    }

    if (value.startsWith('data:')) {
        const parsedDataUrl = parseBase64DataUrl(value);
        const isValidLegacyDataUrl = Boolean(
            parsedDataUrl
            && parsedDataUrl.size <= BUSINESS_PLAN_FILE_MAX_BYTES
            && Object.values(MIME_BY_EXTENSION).includes(parsedDataUrl.mimeType)
        );
        const extension = isValidLegacyDataUrl && parsedDataUrl
            ? Object.keys(MIME_BY_EXTENSION).find((key) => MIME_BY_EXTENSION[key] === parsedDataUrl.mimeType)
            : undefined;
        return {
            fileName: extension ? `사업계획 파일.${extension}` : '사업계획 파일',
            mimeType: isValidLegacyDataUrl && parsedDataUrl ? parsedDataUrl.mimeType : null,
            dataUrl: isValidLegacyDataUrl ? value : null,
            size: isValidLegacyDataUrl && parsedDataUrl ? parsedDataUrl.size : null,
            isLegacy: true,
            displayValue: extension ? `사업계획 파일.${extension}` : '사업계획 파일 데이터를 읽을 수 없음',
        };
    }

    return {
        fileName: value,
        mimeType: null,
        dataUrl: null,
        size: null,
        isLegacy: true,
        displayValue: value,
    };
}

export function validateBusinessPlanFileStorageValue(value: string | null | undefined) {
    if (value == null || !value.trim()) return null;

    const trimmedValue = value.trim();
    if (trimmedValue.startsWith(STORAGE_PREFIX)) {
        let storedFile: StoredBusinessPlanFile;
        try {
            storedFile = JSON.parse(trimmedValue.slice(STORAGE_PREFIX.length)) as StoredBusinessPlanFile;
        } catch {
            throw new BusinessPlanFileValidationError('사업계획 파일 데이터 형식이 올바르지 않습니다.');
        }
        if (!storedFile || storedFile.version !== 1) {
            throw new BusinessPlanFileValidationError('지원하지 않는 사업계획 파일 버전입니다.');
        }
        validateStoredFile(storedFile);
        return trimmedValue;
    }

    if (trimmedValue.startsWith('data:')) {
        const parsedDataUrl = parseBase64DataUrl(trimmedValue);
        if (!parsedDataUrl || !Object.values(MIME_BY_EXTENSION).includes(parsedDataUrl.mimeType)) {
            throw new BusinessPlanFileValidationError(ALLOWED_FILE_TYPES_MESSAGE);
        }
        if (parsedDataUrl.size > BUSINESS_PLAN_FILE_MAX_BYTES) {
            throw new BusinessPlanFileValidationError('사업계획 파일은 10MB 이하만 업로드할 수 있습니다.');
        }
    } else {
        throw new BusinessPlanFileValidationError(ALLOWED_FILE_TYPES_MESSAGE);
    }

    return trimmedValue;
}
