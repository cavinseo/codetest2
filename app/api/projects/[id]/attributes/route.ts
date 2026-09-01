import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { attributesBodySchema } from '@/lib/bulk-save-schemas';
import { generateId } from '@/lib/id';
import {
    countAttributeCascadeImpact,
    describeAttributeCascadeImpact,
} from '@/lib/import-cascade-guard';

const log = createLogger('api/attributes');

// GET: 프로젝트의 제품 속성 조회
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다' },
                { status: 404 }
            );
        }

        const attrs = await prisma.productAttribute.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
        });

        return NextResponse.json({ attributes: attrs });
    } catch (error: unknown) {
        log.error('제품 속성 조회 실패', error);
        return NextResponse.json(
            { error: '제품 속성 조회 실패' },
            { status: 500 }
        );
    }
}

// POST: 제품 속성 저장(행 단위 upsert)
//
// 제출에서 빠진 행만 지우고, id 가 있는 행은 update, 없는 행만 create 한다.
// 고객요구사항 라우트(requirements/route.ts)가 같은 이유로 먼저 이 형태가 됐다.
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다' },
                { status: 404 }
            );
        }

        // 스키마가 strict 가 아니라 모르는 키를 버린다. confirmCascade 를 살리려면
        // 원본 본문을 따로 들고 있어야 한다.
        const rawBody = await request.json();
        const { attributes: newAttributes } = attributesBodySchema.parse(rawBody);

        // 제출 행에 실린 id 는 "이 행은 이미 DB 에 있으니 그대로 두라"는 뜻이다.
        // 화면이 로드 때 받은 id 를 그대로 돌려보낸다(ProductAttributesTable).
        const submittedIds = newAttributes
            .map((attr) => attr.id)
            .filter((id): id is string => Boolean(id));

        // 예전에는 저장이 늘 전량 deleteMany 라, 오타 한 글자를 고쳐도 캐스케이드로
        // 적합도가 통째로 사라졌다. id 는 보존하고 있었지만 소용이 없었다 — 같은 id 로
        // 부모를 되살려도 이미 지워진 자식은 돌아오지 않기 때문이다.
        //
        // 이제는 제출에서 빠진 행만 지우므로 정상 편집에서는 지워질 것이 없고, 경고도
        // 그때만 뜬다. 매번 뜨던 경고는 읽히지 않았고, 확인 클릭을 습관으로 만들어
        // 오히려 손실을 불렀다.
        const impact = await countAttributeCascadeImpact(prisma, projectId, submittedIds);
        if (impact.fitnesses > 0 && rawBody?.confirmCascade !== true) {
            return NextResponse.json(
                {
                    error: describeAttributeCascadeImpact(impact),
                    needsCascadeConfirm: true,
                    cascadeImpact: impact,
                },
                { status: 409 }
            );
        }

        const updatedAttrs = await prisma.$transaction(async (tx: any) => {
            // notIn: [] 은 "아무것도 제외하지 않음"이 아니라 전체 일치다. 빈 제출은
            // 필터 없이 전량을 지운다("전부 지워라"는 뜻이므로 그것이 맞다).
            await tx.productAttribute.deleteMany({
                where: submittedIds.length > 0
                    ? { projectId, id: { notIn: submittedIds } }
                    : { projectId },
            });

            for (const attr of newAttributes) {
                const data = {
                    productName: attr.productName ?? null,
                    customerName: attr.customerName ?? null,
                    marketSegment: attr.marketSegment ?? null,
                    customerNeed: attr.customerNeed ?? null,
                    benefit: attr.benefit ?? null,
                    attribute: attr.attribute ?? null,
                    techCapability: attr.techCapability ?? null,
                    order: attr.order,
                };

                // update 가 아니라 updateMany 를 쓰는 이유가 둘 있다. update 는 없는
                // 행에 throw 하고, where 에 projectId 를 함께 걸어야 남의 프로젝트 행을
                // id 하나로 덮어쓰는 것을 막을 수 있다.
                if (attr.id) {
                    const updated = await tx.productAttribute.updateMany({
                        where: { id: attr.id, projectId },
                        data,
                    });
                    if (updated.count > 0) continue;
                }

                await tx.productAttribute.create({
                    data: {
                        id: attr.id || generateId('attr'),
                        projectId,
                        ...data,
                    },
                });
            }

            return tx.productAttribute.findMany({
                where: { projectId },
                orderBy: { order: 'asc' },
            });
        });

        log.info('제품 속성 저장 성공', { projectId, count: newAttributes.length });

        return NextResponse.json({
            attributes: updatedAttrs,
            message: '제품 속성이 저장되었습니다',
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: '유효하지 않은 제품 속성 데이터입니다.' }, { status: 400 });
        }
        log.error('제품 속성 저장 실패', error);
        return NextResponse.json(
            { error: '제품 속성 저장 실패' },
            { status: 500 }
        );
    }
}

// DELETE: 제품 속성 리셋
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
        if (accessResult instanceof NextResponse) return accessResult;
        const deleteResult = await prisma.productAttribute.deleteMany({
            where: { projectId },
        });

        log.info('제품 속성 리셋', { projectId, removed: deleteResult.count });
        return NextResponse.json({ success: true, removed: deleteResult.count });
    } catch (error: unknown) {
        log.error('제품 속성 리셋 실패', error);
        return NextResponse.json({ error: '제품 속성 리셋 실패' }, { status: 500 });
    }
}
