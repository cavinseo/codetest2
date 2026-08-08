import { NextRequest, NextResponse } from 'next/server';
import { serviceSettings, updateGoogleSettings, isGoogleConfigured, updateSmtpSettings, isSmtpConfigured, getAiSettings, updateAiSettings, type AiSettings } from '@/lib/service-settings';
import { requireAdmin } from '@/lib/authorization';
import { getProviderStatuses } from '@/lib/ai/registry';

function parseAiProvider(value: unknown): AiSettings['provider'] | null {
    return value === 'rule' || value === 'local' || value === 'hermes' || value === 'api' ? value : null;
}

// GET: 현재 서비스 설정 조회
export async function GET(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    return NextResponse.json({
        google: {
            clientId: serviceSettings.google.clientId ? '****' + serviceSettings.google.clientId.slice(-8) : '',
            configured: isGoogleConfigured(),
        },
        smtp: {
            host: serviceSettings.smtp?.host || '',
            port: serviceSettings.smtp?.port || 587,
            user: serviceSettings.smtp?.user || '',
            configured: isSmtpConfigured(),
        },
        // 엔진별로 지금 실제 연결되는지까지 함께 내려준다.
        ai: {
            ...getAiSettings(),
            providers: await getProviderStatuses(),
        },
    });
}

// POST: 서비스 설정 업데이트
export async function POST(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const body = await request.json();

        if (body.google) {
            updateGoogleSettings(
                body.google.clientId || '',
                body.google.clientSecret || ''
            );
        }

        if (body.smtp) {
            updateSmtpSettings(
                body.smtp.host || '',
                body.smtp.port || 587,
                body.smtp.user || '',
                body.smtp.pass || ''
            );
        }

        if (body.ai) {
            const provider = parseAiProvider(body.ai.provider);
            updateAiSettings({
                ...(provider ? { provider } : {}),
                ...(typeof body.ai.localBaseUrl === 'string' ? { localBaseUrl: body.ai.localBaseUrl.trim() } : {}),
                ...(typeof body.ai.localModel === 'string' ? { localModel: body.ai.localModel.trim() } : {}),
                ...(typeof body.ai.hermesBaseUrl === 'string' ? { hermesBaseUrl: body.ai.hermesBaseUrl.trim() } : {}),
                ...(typeof body.ai.hermesModel === 'string' ? { hermesModel: body.ai.hermesModel.trim() } : {}),
            });
        }

        return NextResponse.json({
            success: true,
            message: '설정이 저장되었습니다.',
            google: {
                configured: isGoogleConfigured(),
            },
            smtp: {
                configured: isSmtpConfigured(),
            },
            ai: {
                ...getAiSettings(),
                providers: await getProviderStatuses(),
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: '설정 저장에 실패했습니다.' },
            { status: 500 }
        );
    }
}
