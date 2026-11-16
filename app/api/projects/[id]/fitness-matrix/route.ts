import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';
import { isValidFitnessMatrixJson } from '@/lib/fitness-matrix-data';
import { fitnessMatrixBodySchema } from '@/lib/bulk-save-schemas';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/fitness-matrix');

// GET: 적합도 매트릭스 로드
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: false });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const record = await prisma.fitnessMatrix.findUnique({ where: { projectId } });
        return NextResponse.json({ fitnessMatrix: record });
    } catch (error) {
        log.error('fitness-matrix GET error', error);
        return NextResponse.json({ error: 'Failed to load fitness matrix' }, { status: 500 });
    }
}

// POST: 적합도 매트릭스 저장(upsert)
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        // 형식(문자열·JSON)은 스키마로, 내용(시장·행렬 구조)은 isValidFitnessMatrixJson 으로 거른다.
        // 깨진 값이 한 번 저장되면 엑셀 내보내기와 최종 보고서가 실패한다.
        const parsed = fitnessMatrixBodySchema.safeParse(await readJsonBody(request));
        if (!parsed.success || !isValidFitnessMatrixJson(parsed.data.marketsJson, parsed.data.matrixJson)) {
            return NextResponse.json({ error: '제품속성적합도 저장 형식이 올바르지 않습니다.' }, { status: 400 });
        }
        const data = parsed.data;
        const record = await prisma.fitnessMatrix.upsert({
            where: { projectId },
            update: data,
            create: { projectId, ...data },
        });
        return NextResponse.json({ fitnessMatrix: record });
    } catch (error) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        log.error('fitness-matrix POST error', error);
        return NextResponse.json({ error: 'Failed to save fitness matrix' }, { status: 500 });
    }
}
