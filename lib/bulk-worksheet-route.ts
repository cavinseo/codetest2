// 워크시트 "전체 교체 저장" 라우트를 만드는 팩토리.
//
// sales / dev-plan / tech-roadmap / tech-tree / target-spec 은 모델명과 문구를
// 빼면 토큰 단위로 같은 코드였다. 복붙이 문제였던 이유는 길이가 아니라,
// 한쪽만 고쳐지는 일이 실제로 일어났다는 데 있다. 1단계에서 잡은 결함들
// (검증 누락, 배열 형태 $transaction, mass-assignment)이 전부 그렇게 생겼다.
//
// 여기로 모으면 안전 속성이 한 곳에서 강제된다.
//   - 스키마 검증을 반드시 통과한 뒤에만 삭제한다
//   - 삭제와 재생성이 같은 트랜잭션에 들어간다(콜백 형태)
//   - 저장 필드는 toCreateData 가 명시적으로 만든다(mass-assignment 차단)
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from './prisma';
import { requireProjectAccess } from './authorization';
import { createLogger } from './logger';
import { toErrorResponse } from './api-error';

// Prisma delegate 는 모델마다 생성 타입이 달라, 여러 모델을 받는 구조 타입으로는
// 그대로 맞출 수 없다. 팩토리 안에서 이 형태로 한 번만 좁히고, 바깥에서는
// toCreateData 와 bodySchema 로 타입 안전성을 유지한다.
interface BulkWorksheetDelegate {
    findMany: (args: { where: { projectId: string }; orderBy: { order: 'asc' } }) => Promise<unknown[]>;
    deleteMany: (args: { where: { projectId: string } }) => Promise<unknown>;
    createMany: (args: { data: Record<string, unknown>[] }) => Promise<unknown>;
}

function asDelegate(value: unknown): BulkWorksheetDelegate {
    return value as BulkWorksheetDelegate;
}

export interface BulkWorksheetConfig<TBody, TRow> {
    /** 로그·오류 문구에 쓰는 이름 (예: '매출추정') */
    label: string;
    /** 요청/응답 본문에서 배열이 담기는 키 (예: 'rows', 'entries') */
    collectionKey: string;
    bodySchema: z.ZodType<TBody, z.ZodTypeDef, unknown>;
    /** 검증된 본문에서 행 배열을 꺼낸다 */
    selectRows: (body: TBody) => TRow[];
    /** 트랜잭션 클라이언트에서 대상 delegate 를 고른다 (예: (c) => c.devPlan) */
    delegate: (client: typeof prisma) => unknown;
    /** 저장할 필드를 명시적으로 만든다. 클라이언트가 보낸 임의 필드는 여기서 걸러진다 */
    toCreateData: (row: TRow, projectId: string) => Record<string, unknown>;
}

export function createBulkWorksheetRoute<TBody, TRow>(config: BulkWorksheetConfig<TBody, TRow>) {
    const log = createLogger(`api/${config.collectionKey}/${config.label}`);

    async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
        const { id: projectId } = await props.params;
        const accessResult = await requireProjectAccess(request, projectId, { write: false });
        if (accessResult instanceof NextResponse) return accessResult;

        try {
            const rows = await asDelegate(config.delegate(prisma)).findMany({
                where: { projectId },
                orderBy: { order: 'asc' },
            });
            return NextResponse.json({ [config.collectionKey]: rows });
        } catch (error) {
            return toErrorResponse(error, {
                log,
                message: `${config.label} 데이터를 불러오지 못했습니다.`,
                context: { projectId },
            });
        }
    }

    async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
        const { id: projectId } = await props.params;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;

        try {
            // 검증이 먼저다. 통과하지 못하면 아래 삭제까지 가지 않는다.
            const body = config.bodySchema.parse(await request.json());
            const rows = config.selectRows(body);

            const saved = await prisma.$transaction(async (tx) => {
                const model = asDelegate(config.delegate(tx as unknown as typeof prisma));
                await model.deleteMany({ where: { projectId } });
                if (rows.length > 0) {
                    await model.createMany({
                        data: rows.map((row) => config.toCreateData(row, projectId)),
                    });
                }
                return model.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
            });

            return NextResponse.json({ [config.collectionKey]: saved });
        } catch (error) {
            if (error instanceof z.ZodError) {
                return NextResponse.json(
                    { error: `유효하지 않은 ${config.label} 데이터입니다.` },
                    { status: 400 }
                );
            }
            return toErrorResponse(error, {
                log,
                message: `${config.label} 데이터를 저장하지 못했습니다.`,
                context: { projectId },
            });
        }
    }

    return { GET, POST };
}
