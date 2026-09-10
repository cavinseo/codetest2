// 저장된 결과보고서의 문서 구조와 이미지 형식을 검증해 초안과 완료본을 보호한다.
import { z } from 'zod';

// Vercel 요청·응답 한도보다 여유를 두고 메타데이터를 함께 반환한다.
export const REPORT_MAX_BYTES = 3_500_000;
const text = z.string().max(100_000);
const image = z.string().max(REPORT_MAX_BYTES).regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/)
    .refine(value => value.slice(value.indexOf(',') + 1).length % 4 === 0, '이미지 데이터의 Base64 길이가 올바르지 않습니다.');
const pixels = z.number().finite().positive().max(50_000).nullable();

const freeSchema = z.object({
    productImageDataUrl: image.nullable(),
    productImageWidthPx: pixels,
    productImageHeightPx: pixels,
    marketDefinition: text,
    targetCustomer: text,
    finalSpecExplanation: text,
    improvedProductName: text,
    improvedProductDescription: text,
}).strict();

const blockSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('heading'), text, level: z.union([z.literal(1), z.literal(2)]) }).strict(),
    z.object({ kind: z.literal('paragraph'), text }).strict(),
    z.object({ kind: z.literal('keyValueTable'), rows: z.array(z.object({ label: text, value: text }).strict()).min(1).max(5000) }).strict(),
    z.object({ kind: z.literal('dataTable'), headers: z.array(text).min(1).max(100), rows: z.array(z.array(text).max(100)).max(5000) }).strict(),
    z.object({ kind: z.literal('image'), title: text, pngDataUrl: image,
        widthMm: z.number().finite().positive().max(1000), heightMm: z.number().finite().positive().max(1000), landscape: z.boolean(),
    }).strict(),
]);

export const reportDocumentSchema = z.object({
    title: z.string().min(1).max(1000),
    fileName: z.string().max(255).regex(/^[^\\/\u0000-\u001f]+\.docx$/i),
    blocks: z.array(blockSchema).max(500),
}).strict().superRefine((document, context) => {
    document.blocks.forEach((block, index) => {
        if (block.kind === 'dataTable' && block.rows.some(row => row.length !== block.headers.length)) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', index, 'rows'], message: '표의 열 수가 일치하지 않습니다.' });
        }
    });
});

export const reportDraftSchema = z.object({
    free: freeSchema,
    document: reportDocumentSchema.nullable(),
    previewNeedsRefresh: z.boolean().default(false),
}).strict();
export const saveReportSchema = z.object({ version: z.number().int().nonnegative(), draft: reportDraftSchema }).strict();
export const completeReportSchema = z.object({ version: z.number().int().nonnegative() }).strict();
export type ReportDraft = z.infer<typeof reportDraftSchema>;
