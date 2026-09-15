// 개요의 제품 정보와 이미지 입력을 검증해 기존 프로젝트와 보고서에서 함께 사용한다.
import { z } from 'zod';

export const PRODUCT_IMAGE_MAX_LENGTH = 1_000_000;
function hasImageSignature(value: string) {
    const encoded = value.slice(value.indexOf(',') + 1);
    try {
        const bytes = atob(encoded);
        if (value.startsWith('data:image/png;')) {
            return bytes.length >= 45 && bytes.startsWith('\x89PNG\r\n\x1a\n')
                && bytes.slice(12, 16) === 'IHDR' && bytes.slice(-8, -4) === 'IEND';
        }
        return bytes.length >= 4 && bytes.startsWith('\xff\xd8\xff') && bytes.endsWith('\xff\xd9');
    } catch { return false; }
}
export const productOverviewSchema = z.object({
    productName: z.string().trim().max(300).nullable().optional(),
    marketDefinition: z.string().trim().max(20_000).nullable().optional(),
    targetCustomer: z.string().trim().max(20_000).nullable().optional(),
    productImageDataUrl: z.string().max(PRODUCT_IMAGE_MAX_LENGTH)
        .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/)
        .refine(value => value.slice(value.indexOf(',') + 1).length % 4 === 0, '이미지 데이터가 올바르지 않습니다.')
        .refine(hasImageSignature, 'PNG 또는 JPEG 이미지 데이터가 필요합니다.')
        .nullable().optional(),
    productImageWidthPx: z.number().int().positive().max(8000).nullable().optional(),
    productImageHeightPx: z.number().int().positive().max(8000).nullable().optional(),
});
export type ProductOverview = z.infer<typeof productOverviewSchema>;

export function validateProductOverview(input: unknown) {
    const parsed = productOverviewSchema.parse(input);
    if (parsed.productImageDataUrl) {
        if (!parsed.productImageWidthPx || !parsed.productImageHeightPx) {
            throw new Error('제품 이미지의 가로·세로 크기가 필요합니다.');
        }
    } else if (parsed.productImageDataUrl === null) {
        parsed.productImageWidthPx = null;
        parsed.productImageHeightPx = null;
    } else if (parsed.productImageWidthPx !== undefined || parsed.productImageHeightPx !== undefined) {
        throw new Error('제품 이미지와 크기를 함께 저장하세요.');
    }
    return parsed;
}
