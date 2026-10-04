// 프로젝트 접근 권한이 있는 사용자에게 Google Forms 연동 가능 여부만 제공한다.
import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/authorization';
import { isGoogleConfigured } from '@/lib/service-settings';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';

const log = createLogger('api/kano/google-status');

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await params;
    const accessResult = await requireProjectAccess(request, projectId, { write: false });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        return NextResponse.json({ configured: await isGoogleConfigured() });
    } catch (error) {
        return toErrorResponse(error, {
            log,
            message: 'Google Forms 연동 상태를 불러오지 못했습니다.',
            context: { projectId },
        });
    }
}
