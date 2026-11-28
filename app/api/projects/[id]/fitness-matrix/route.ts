import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';
import { isValidFitnessMatrixJson } from '@/lib/fitness-matrix-data';
import { fitnessMatrixBodySchema } from '@/lib/bulk-save-schemas';
import { createLogger } from '@/lib/logger';
import { assertWorksheetRevision, worksheetRevision, worksheetRevisionErrorResponse } from '@/lib/worksheet-revision';

const log = createLogger('api/fitness-matrix');

// 행이 하나뿐이라, 아직 저장 전(null)과 저장됨을 구분하도록 배열로 감싸 개정값을 만든다.
function matrixRevision(record: unknown | null): string {
    return worksheetRevision(record ? [record] : []);
}

// GET: 적합도 매트릭스 로드
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: false });
    if (accessResult instanceof NextResponse) return accessResult;
    try {
        const record = await prisma.fitnessMatrix.findUnique({ where: { projectId } });
        return NextResponse.json({ fitnessMatrix: record, revision: matrixRevision(record) });
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
        // 세분시장·매트릭스 전체를 덮어쓰므로, 화면이 읽은 뒤 다른 사람이 저장했으면
        // 그 입력이 통째로 사라진다. 읽은 값과 다르면 409 로 막는다(감리 B3).
        const record = await prisma.$transaction(async (tx) => {
            const current = await tx.fitnessMatrix.findUnique({ where: { projectId } });
            assertWorksheetRevision(request, current ? [current] : []);
            return tx.fitnessMatrix.upsert({
                where: { projectId },
                update: data,
                create: { projectId, ...data },
            });
        }, { isolationLevel: 'Serializable' });
        return NextResponse.json({ fitnessMatrix: record, revision: matrixRevision(record) });
    } catch (error) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        const revisionResponse = worksheetRevisionErrorResponse(error);
        if (revisionResponse) return revisionResponse;
        log.error('fitness-matrix POST error', error);
        return NextResponse.json({ error: 'Failed to save fitness matrix' }, { status: 500 });
    }
}
