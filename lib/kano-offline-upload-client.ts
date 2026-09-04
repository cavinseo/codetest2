// 오프라인 답변 업로드 화면이 쓰는 순수 계산. 브라우저에서 돌아야 하므로 node 전용 모듈
// (crypto 를 쓰는 lib/kano-offline-survey.ts 포함)을 import 하지 않는다.
/** 서버 계약과 같은 형식 이름. 테스트가 lib/kano-offline-survey.ts 의 상수와 일치를 단언한다. */
export const KANO_OFFLINE_FORMAT_NAME = 'kano-offline-response';
export const KANO_OFFLINE_UPLOAD_BATCH = 10;

export type KanoOfflineFilePreview =
    | { ok: true }
    | { ok: false; reason: 'survey-file' | 'not-offline-file' | 'other-project' };

const RESPONSE_ISLAND = /<script type="application\/json" id="kano-offline-response">([\s\S]*?)<\/script>/g;

/** 고르자마자 하는 눈속임 검사다 — 서버 검증을 대체하지 않는다. */
export function inspectKanoOfflineFileText(text: string, projectId: string): KanoOfflineFilePreview {
    const trimmed = text.trim();
    let payloadText = trimmed;
    if (trimmed.startsWith('<')) {
        const filledIslands = [...trimmed.matchAll(RESPONSE_ISLAND)]
            .map((match) => match[1].trim())
            .filter((island) => island.length > 0);
        if (filledIslands.length === 0) return { ok: false, reason: 'survey-file' };
        payloadText = filledIslands[filledIslands.length - 1];
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(payloadText);
    }
    // Stryker disable next-line BlockStatement: 빈 catch도 undefined가 다음 형태 검사에서 같은 사유로 거절되므로 등가다.
    catch {
        return { ok: false, reason: 'not-offline-file' };
    }
    if (parsed === null || Array.isArray(parsed)) {
        return { ok: false, reason: 'not-offline-file' };
    }
    if ((parsed as Record<string, unknown>).format !== KANO_OFFLINE_FORMAT_NAME) {
        return { ok: false, reason: 'not-offline-file' };
    }
    if ((parsed as Record<string, unknown>).projectId !== projectId) {
        return { ok: false, reason: 'other-project' };
    }
    return { ok: true };
}

/** 화면이 10개씩 나눠 보낸다. 마지막 배치는 남는 만큼이다. */
export function chunkKanoOfflineFiles<T>(files: T[], size: number = KANO_OFFLINE_UPLOAD_BATCH): T[][] {
    return Array.from(
        { length: Math.ceil(files.length / size) },
        (_, index) => files.slice(index * size, (index + 1) * size)
    );
}

/** 서버가 돌려주는 index 는 배치 안 인덱스다. 화면은 오프셋을 더해 파일명을 찾는다. */
export function absoluteFileIndex(
    batchIndex: number,
    indexInBatch: number,
    size: number = KANO_OFFLINE_UPLOAD_BATCH
): number {
    return batchIndex * size + indexInBatch;
}
