import { NextRequest, NextResponse } from 'next/server';
import { isGoogleConfigured, getGoogleToken } from '@/lib/service-settings';
import { createKanoForm } from '@/lib/google-forms';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/kano/create-form');

// POST: Google Forms로 Kano 설문지 생성
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const projectId = params.id;

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
                { error: 'Google 인증이 필요합니다. 먼저 Google 계정을 연결하세요.', needsAuth: true },
                { status: 401 }
            );
        }

        // 요구사항 가져오기
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

        // 프로젝트 이름 (간단히)
        const body = await request.json().catch(() => ({}));
        const projectName = body.projectName || `프로젝트 ${projectId}`;

        // Google Form 생성
        const result = await createKanoForm(token.accessToken, projectName, requirements.map((r: any) => ({
            ...r,
            subcategory: r.subcategory ?? undefined
        })));

        return NextResponse.json({
            success: true,
            formId: result.formId,
            formUrl: result.formUrl,
            editUrl: result.editUrl,
            questionCount: requirements.length * 2,
        });
    } catch (error: any) {
        log.error('Google Form creation error', error);
        return NextResponse.json(
            { error: `Google Form 생성 실패: ${error.message}` },
            { status: 500 }
        );
    }
}
