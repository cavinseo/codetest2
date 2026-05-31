import { NextRequest, NextResponse } from 'next/server';
import { isGoogleConfigured, getGoogleToken } from '@/lib/service-settings';
import { createKanoForm } from '@/lib/google-forms';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/kano/create-form');

// POST: Google Forms로 Kano 질문지 생성
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const projectId = params.id;
    const accessResult = await requireProjectAccess(request, projectId, { write: request.method !== 'GET' });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        if (!isGoogleConfigured()) {
            return NextResponse.json(
                { error: 'Google OAuth가 설정되지 않았습니다. 서비스 설정에서 설정하세요.' },
                { status: 400 }
            );
        }

        const token = getGoogleToken('default');
        if (!token) {
            return NextResponse.json(
                { error: 'Google ?몄쬆???꾩슂?⑸땲?? 癒쇱? Google 怨꾩젙???곌껐?섏꽭??', needsAuth: true },
                { status: 401 }
            );
        }

        const requirements = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
        });

        if (requirements.length === 0) {
            return NextResponse.json(
                { error: '요구사항이 없습니다. 먼저 고객 요구사항을 입력하세요.' },
                { status: 400 }
            );
        }

        // 프로젝트 이름
        const body = await request.json().catch(() => ({}));
        const projectName = body.projectName || `프로젝트 ${projectId}`;

        // Google Form ?앹꽦
        const result = await createKanoForm(token.accessToken, projectName, requirements.map((r: any) => ({
            ...r,
            subcategory: r.subcategory ?? undefined
        })));

        return NextResponse.json({
            success: true,
            formId: result.formId,
            formUrl: result.formUrl,
            editUrl: result.editUrl,
            questionCount: requirements.length,
        });
    } catch (error: any) {
        log.error('Google Form creation error', error);
        return NextResponse.json(
            { error: `Google Form ?앹꽦 ?ㅽ뙣: ${error.message}` },
            { status: 500 }
        );
    }
}
