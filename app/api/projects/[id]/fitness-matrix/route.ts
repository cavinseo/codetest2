import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';
import { isValidFitnessMatrixJson } from '@/lib/fitness-matrix-data';

// GET: 적합도 매트릭스 로드
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const record = await prisma.fitnessMatrix.findUnique({ where: { projectId } });
        return NextResponse.json({ fitnessMatrix: record });
    } catch (error) {
        console.error('fitness-matrix GET error:', error);
        return NextResponse.json({ error: 'Failed to load fitness matrix' }, { status: 500 });
    }
}

// POST: 적합도 매트릭스 저장(upsert)
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const body = await readJsonBody(request);
        const { marketsJson, matrixJson, managerComment, consultantNote } = (body ?? {}) as Record<string, unknown>;
        // 깨진 값이 한 번 저장되면 엑셀 내보내기와 최종 보고서가 실패하므로 저장 전에 거른다.
        const isOptionalText = (value: unknown) => value === undefined || value === null || typeof value === 'string';
        if (!isValidFitnessMatrixJson(marketsJson, matrixJson) || !isOptionalText(managerComment) || !isOptionalText(consultantNote)) {
            return NextResponse.json({ error: '제품속성적합도 저장 형식이 올바르지 않습니다.' }, { status: 400 });
        }
        const data = {
            marketsJson: marketsJson as string, matrixJson: matrixJson as string,
            managerComment: managerComment as string | null | undefined, consultantNote: consultantNote as string | null | undefined,
        };
        const record = await prisma.fitnessMatrix.upsert({
            where: { projectId },
            update: data,
            create: { projectId, ...data },
        });
        return NextResponse.json({ fitnessMatrix: record });
    } catch (error) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        console.error('fitness-matrix POST error:', error);
        return NextResponse.json({ error: 'Failed to save fitness matrix' }, { status: 500 });
    }
}
