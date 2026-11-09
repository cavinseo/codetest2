// WS-4 제품속성적합도의 저장 형식(세분시장 목록·평가 행렬 JSON 문자열)을 검사하고 읽는다.
//
// 저장 API 가 받은 문자열을 검사 없이 넣고, 엑셀 내보내기와 최종 보고서는 JSON.parse 와
// market.subSegments.map 을 그대로 불러, 깨진 값이 한 번 저장되면 엑셀 전체(모든 시트)와 최종
// 보고서가 500 으로 실패했다(2026-11-08 코드 리뷰 7번). 저장할 때는 엄격히 거르고, 읽을 때는
// 이미 저장된 깨진 값이 있어도 그 부분만 비우고 나머지 산출물은 만든다.
import { z } from 'zod';

export interface FitnessSubSegment { id: string; name: string }
export interface FitnessMarket { id: string; name: string; subSegments: FitnessSubSegment[] }
/** 속성 id → 세분시장 id → 고객(세분화) id → 평가값(H·M·L·L*) */
export type FitnessMatrixCells = Record<string, Record<string, Record<string, string>>>;

const subSegmentSchema = z.object({ id: z.string(), name: z.string() });
const marketsSchema = z.array(z.object({ id: z.string(), name: z.string(), subSegments: z.array(subSegmentSchema) }));
const matrixSchema = z.record(z.record(z.record(z.string())));

function parseJson(value: unknown): unknown {
    if (typeof value !== 'string') return undefined;
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        // 깨진 JSON 은 undefined 로 두어 형식 검사에서 걸러지게 한다.
    }
    return parsed;
}

/** 저장 요청의 두 문자열이 올바른 WS-4 형식인가 */
export function isValidFitnessMatrixJson(marketsJson: unknown, matrixJson: unknown): boolean {
    return marketsSchema.safeParse(parseJson(marketsJson)).success && matrixSchema.safeParse(parseJson(matrixJson)).success;
}

function readSubSegments(value: unknown): FitnessSubSegment[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is FitnessSubSegment => subSegmentSchema.safeParse(item).success)
        .map(({ id, name }) => ({ id, name }));
}

/** 저장된 값을 읽는다. 형식이 어긋난 세분시장·행렬은 버리고 절대 던지지 않는다. */
export function readFitnessMatrixData(saved: { marketsJson?: unknown; matrixJson?: unknown } | null | undefined): { markets: FitnessMarket[]; matrix: FitnessMatrixCells } {
    const rawMarkets = parseJson(saved?.marketsJson);
    const markets = Array.isArray(rawMarkets)
        ? rawMarkets.flatMap((item): FitnessMarket[] => {
            // 원시값(숫자·문자열)은 구조 분해해도 id·name 이 undefined 라 아래에서 걸러진다.
            if (!item) return [];
            const { id, name, subSegments } = item as Record<string, unknown>;
            if (typeof id !== 'string' || typeof name !== 'string') return [];
            return [{ id, name, subSegments: readSubSegments(subSegments) }];
        })
        : [];
    const parsedMatrix = matrixSchema.safeParse(parseJson(saved?.matrixJson));
    return { markets, matrix: parsedMatrix.success ? parsedMatrix.data : {} };
}
