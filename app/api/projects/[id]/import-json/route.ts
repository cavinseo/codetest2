import { NextRequest, NextResponse } from 'next/server';
import { cascadeConfirmResponse } from '@/lib/cascade-confirm-response';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { importHasAnyData } from '@/lib/import-json-plan';
import { importJsonSchema, MAX_IMPORT_ROWS } from '@/lib/import-json-schema';
import { ImportReferenceError } from '@/lib/import-json-relations';
import { restoreImportedProject } from '@/lib/import-json-restore';
import {
    countCascadeImpact,
    describeCascadeImpact,
    hasCascadeImpact,
} from '@/lib/import-cascade-guard';
import { invalidJsonBodyResponse, readJsonBody } from '@/lib/request-body';

const log = createLogger('api/import-json');

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        // 검증 없이 {...r, projectId} 로 펼쳐 넣던 자리다. 화이트리스트 스키마가
        // 모르는 열과 과도한 행수를 먼저 걸러낸다.
        const parsed = importJsonSchema.safeParse(await readJsonBody(request));
        if (!parsed.success) {
            const issue = parsed.error.errors[0];
            const where = issue.path.join('.');
            // 'too_big' 은 형식이 아니라 행수 상한 위반이다. 사용자가 형식 문제로
            // 착각하지 않도록 원인을 구분해서 알려준다.
            const message = issue.code === 'too_big'
                ? `가져오기 항목 수가 너무 많습니다(${where || '최상위'}, 최대 ${MAX_IMPORT_ROWS}행).`
                : `가져오기 형식이 올바르지 않습니다(${where || '최상위'}).`;
            return NextResponse.json({ error: message }, { status: 400 });
        }
        const importData = parsed.data;

        // 임의의 빈 요청은 전체 삭제가 될 수 있어 거절한다. 다만 1.1 전체 백업은
        // 빈 워크시트도 원본 상태이므로, 그 경우에는 빈 배열을 복원할 수 있어야 한다.
        const isFullBackup = importData.version === '1.1-prisma' && typeof importData.exportedAt === 'string';
        if (!importHasAnyData(importData) && !isFullBackup) {
            return NextResponse.json(
                { error: '가져올 데이터가 없습니다.' },
                { status: 400 }
            );
        }

        // 고객요구사항을 덮어쓰면 설문 응답·벤치마크·QFD 가 CASCADE 로 함께 사라진다.
        // 재수집이 불가능한 데이터라 건수를 세어 확인을 받는다(엑셀 import 와 동일).
        const cascadeImpact = await countCascadeImpact(prisma, projectId, {
            replacesCustomerRequirements: Array.isArray(importData.customerRequirements),
            replacesProductAttributes: Array.isArray(importData.productAttributes),
            replacesTechnicalCharacteristics: Array.isArray(importData.technicalCharacteristics),
        });
        if (hasCascadeImpact(cascadeImpact) && importData.confirmCascade !== true) {
            return cascadeConfirmResponse(describeCascadeImpact(cascadeImpact), cascadeImpact);
        }

        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        const imported = await restoreImportedProject(projectId, importData);

        log.info('Data imported successfully', { projectId });

        return NextResponse.json({
            success: true,
            message: '데이터를 성공적으로 가져왔습니다.',
            imported,
        });
    } catch (error: unknown) {
        const invalidBody = invalidJsonBodyResponse(error);
        if (invalidBody) return invalidBody;
        if (error instanceof ImportReferenceError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        log.error('Import error', error);
        return NextResponse.json(
            { error: '데이터 가져오기에 실패했습니다.' },
            { status: 500 }
        );
    }
}
