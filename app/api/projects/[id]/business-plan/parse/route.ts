import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { BUSINESS_PLAN_FILE_MAX_BYTES } from '@/lib/business-plan-file';
import {
    BusinessPlanTemplateError,
    parseBusinessPlanWorkbook,
} from '@/lib/business-plan-template';

const log = createLogger('api/business-plan-parse');

// 업로드한 사업계획 양식을 읽어 개요 입력값을 돌려준다.
// 여기서는 저장하지 않는다. 사용자가 화면에서 확인하고 기존 개요 저장으로 반영한다.
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!(file instanceof File)) {
            return NextResponse.json({ error: '업로드할 양식 파일이 필요합니다.' }, { status: 400 });
        }
        if (file.size > BUSINESS_PLAN_FILE_MAX_BYTES) {
            return NextResponse.json(
                { error: '사업계획 파일은 10MB 이하만 업로드할 수 있습니다.' },
                { status: 400 }
            );
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        const parsed = parseBusinessPlanWorkbook(bytes);

        return NextResponse.json({
            overview: {
                name: parsed.name,
                description: parsed.description,
                detailedDescription: parsed.detailedDescription,
            },
            sections: parsed.sections,
            filledLabels: parsed.filledLabels,
        });
    } catch (error) {
        if (error instanceof BusinessPlanTemplateError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        log.error('Business plan parse failed', error);
        return NextResponse.json({ error: '사업계획 양식을 읽지 못했습니다.' }, { status: 500 });
    }
}
