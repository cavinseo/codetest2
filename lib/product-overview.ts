// 개요의 제품 정보와 이미지 입력을 검증해 기존 프로젝트와 보고서에서 함께 사용한다.
import { z } from 'zod';

export const PRODUCT_IMAGE_MAX_LENGTH = 1_000_000;
export const RELATED_IMAGE_MAX_COUNT = 3;
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
const imageDataUrlSchema = z.string().max(PRODUCT_IMAGE_MAX_LENGTH)
        .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/)
        .refine(value => value.slice(value.indexOf(',') + 1).length % 4 === 0, '이미지 데이터가 올바르지 않습니다.')
        .refine(hasImageSignature, 'PNG 또는 JPEG 이미지 데이터가 필요합니다.');
const imageDimensionSchema = z.number().int().positive().max(8000);
const relatedImageSchema = z.object({
    dataUrl: imageDataUrlSchema,
    widthPx: imageDimensionSchema,
    heightPx: imageDimensionSchema,
});
export type RelatedImage = z.infer<typeof relatedImageSchema>;

export const productOverviewSchema = z.object({
    productName: z.string().trim().max(300).nullable().optional(),
    marketDefinition: z.string().trim().max(20_000).nullable().optional(),
    targetCustomer: z.string().trim().max(20_000).nullable().optional(),
    relatedImages: z.array(relatedImageSchema).max(RELATED_IMAGE_MAX_COUNT).optional(),
    productImageDataUrl: imageDataUrlSchema.nullable().optional(),
    productImageWidthPx: imageDimensionSchema.nullable().optional(),
    productImageHeightPx: imageDimensionSchema.nullable().optional(),
});
export type ProductOverview = z.infer<typeof productOverviewSchema>;

// 새 목록이 없을 때 기존 단일 이미지를 첫 이미지로 읽는다. 빈 목록은 명시적인 삭제다.
export function getProductOverviewImages(value: Omit<ProductOverview, 'relatedImages'> & { relatedImages?: unknown }): RelatedImage[] {
    if (Array.isArray(value.relatedImages)) return value.relatedImages as RelatedImage[];
    if (value.productImageDataUrl && value.productImageWidthPx && value.productImageHeightPx) {
        return [{ dataUrl: value.productImageDataUrl, widthPx: value.productImageWidthPx, heightPx: value.productImageHeightPx }];
    }
    return [];
}

export function relatedImagesPatch(relatedImages: RelatedImage[]) {
    const first = relatedImages[0];
    return { relatedImages, productImageDataUrl: first?.dataUrl ?? null,
        productImageWidthPx: first?.widthPx ?? null, productImageHeightPx: first?.heightPx ?? null };
}

export function validateProductOverview(input: unknown) {
    const parsed = productOverviewSchema.parse(input);
    if (parsed.relatedImages !== undefined) return { ...parsed, ...relatedImagesPatch(parsed.relatedImages) };
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
    if (parsed.productImageDataUrl !== undefined) return { ...parsed, ...relatedImagesPatch(getProductOverviewImages(parsed)) };
    return parsed;
}
