// JSON 복원 payload 의 화이트리스트 스키마.
//
// 예전에는 검증 없이 {...r, projectId} 로 펼쳐 넣어서 id·createdAt 같은 열을
// 클라이언트가 마음대로 지정할 수 있었고, 배열 길이 상한도 없었다.
//
// export 라우트(app/api/projects/[id]/export/route.ts)는 Prisma 행을 통째로
// 내보내므로 실제 백업 파일에는 행마다 id·projectId 와 시각 열이 들어 있다.
// .strict() 로 그것까지 거부하면 기존 백업이 전부 복원 불가가 되므로, 받아 주되
// 저장할 때는 라우트가 id·projectId 는 무시하고 새 id 와 라우트 자신의 projectId 를
// 쓴다. createdAt·respondedAt 은 신원·소유권 열이 아니라 실제 설문·기록 시각이므로
// 값이 있으면 그대로 복원한다.
import { z } from 'zod';

// 한 컬렉션에 한 번에 넣을 수 있는 행수 상한.
//
// QFD 관계는 |요구사항| x |기술특성| 이라 40 x 50 = 2000 은 흔한 규모의 QFD
// 하우스이고, 설문 응답은 |요구사항| x |응답자| 라 40 x 60 = 2400 은 흔한 규모의
// 설문이다. 예전 2000 상한은 이런 정상 백업조차 복원 불가로 만들었다.
export const MAX_IMPORT_ROWS = 20000;

const rows = <T extends z.ZodTypeAny>(schema: T) => z.array(schema).max(MAX_IMPORT_ROWS);

/** 백업 파일에는 들어 있지만 복원 때는 무시하는 식별 열. */
const identity = {
    id: z.string().optional(),
    projectId: z.string().optional(),
};

const requirementRow = z.object({
    ...identity,
    category: z.string(),
    subcategory: z.string().nullable().optional(),
    requirement: z.string(),
    kanoPositiveQ: z.string().nullable().optional(),
    kanoNegativeQ: z.string().nullable().optional(),
    kanoWeight: z.number().nullable().optional(),
    order: z.number().int().default(0),
    // CustomerRequirement 에만 createdAt 이 있다. 값이 있으면 그대로 복원하고,
    // 없으면 컬럼 기본값(now())에 맡긴다. new Date() 에 그대로 넘기므로 파싱
    // 불가능한 문자열은 여기서 걸러야 한다(안 그러면 트랜잭션 중 500 이 된다).
    createdAt: z.string().datetime().optional(),
}).strict();

const technicalRow = z.object({
    ...identity,
    name: z.string(),
    unit: z.string().nullable().optional(),
    targetValue: z.string().nullable().optional(),
}).strict();

const specRow = z.object({
    ...identity,
    level: z.string(),
    parentId: z.string().nullable().optional(),
    name: z.string(),
    technology: z.string().nullable().optional(),
    order: z.number().int().default(0),
}).strict();

const attributeRow = z.object({
    ...identity,
    productName: z.string().nullable().optional(),
    customerName: z.string().nullable().optional(),
    marketSegment: z.string().nullable().optional(),
    customerNeed: z.string().nullable().optional(),
    benefit: z.string().nullable().optional(),
    attribute: z.string().nullable().optional(),
    techCapability: z.string().nullable().optional(),
    order: z.number().int().default(0),
}).strict();

const fitnessRow = z.object({
    ...identity,
    attributeId: z.string(),
    importance: z.number().int().default(0),
    currentLevel: z.number().int().default(0),
    targetLevel: z.number().int().default(0),
    note: z.string().nullable().optional(),
}).strict();

// strength 가 실제 컬럼명이다(schema.prisma 의 QFDMatrix).
const qfdRow = z.object({
    ...identity,
    requirementId: z.string(),
    technicalCharId: z.string(),
    strength: z.string(),
    currentScore: z.number().nullable().optional(),
    competitorScore: z.number().nullable().optional(),
}).strict();

const kanoRow = z.object({
    ...identity,
    requirementId: z.string(),
    invitationId: z.string(),
    respondentEmail: z.string(),
    positiveAnswer: z.number().int(),
    negativeAnswer: z.number().int(),
    kanoCategory: z.string(),
    // KanoResponse 의 시각 열 이름은 respondedAt 이다. 실제 응답 시각이라 값이
    // 있으면 그대로 복원하고, 없으면 컬럼 기본값(now())에 맡긴다. new Date() 에
    // 그대로 넘기므로 파싱 불가능한 문자열은 여기서 걸러야 한다.
    respondedAt: z.string().datetime().optional(),
}).strict();

export const importJsonSchema = z.object({
    // export 는 '1.0-prisma' 를 쓴다. 옛 파일에는 숫자가 들어 있을 수 있다.
    version: z.union([z.string(), z.number()]).optional(),
    exportedAt: z.string().optional(),
    confirmCascade: z.boolean().optional(),
    project: z.object({
        // name 은 export 가 내보내지만 복원은 설명만 갱신한다.
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        detailedDescription: z.string().nullable().optional(),
    }).strict().optional(),
    customerRequirements: rows(requirementRow).optional(),
    technicalCharacteristics: rows(technicalRow).optional(),
    specFunctions: rows(specRow).optional(),
    productAttributes: rows(attributeRow).optional(),
    attributeFitnesses: rows(fitnessRow).optional(),
    qfdRelationships: rows(qfdRow).optional(),
    kanoResponses: rows(kanoRow).optional(),
    // 아래 두 컬렉션은 export 가 내보내지만 라우트가 복원하지 않는다. 라우트가
    // 버릴 값이라 행수 상한을 걸어도 얻는 것 없이 정상 백업만 거부할 수 있으므로
    // 상한 없이 받아만 두고 버린다.
    techCorrelations: z.array(z.unknown()).optional(),
    benchmarks: z.array(z.unknown()).optional(),
}).strict();

export type ImportJsonPayload = z.infer<typeof importJsonSchema>;
