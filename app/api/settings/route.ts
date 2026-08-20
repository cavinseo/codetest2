import { NextRequest, NextResponse } from 'next/server';
import {
    getAiSettings,
    getGoogleSettings,
    getSmtpSettings,
    updateAiSettings,
    updateGoogleSettings,
    updateSmtpSettings,
    type AiSettings,
} from '@/lib/service-settings';
import { requireAdmin } from '@/lib/authorization';
import { getProviderStatuses } from '@/lib/ai/registry';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';

const log = createLogger('api/settings');

function parseAiProvider(value: unknown): AiSettings['provider'] | null {
    return value === 'rule' || value === 'local' || value === 'hermes' || value === 'api' ? value : null;
}

// GET: 현재 서비스 설정 조회
export async function GET(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const [google, smtp, ai, providers] = await Promise.all([
            getGoogleSettings(),
            getSmtpSettings(),
            getAiSettings(),
            getProviderStatuses(),
        ]);

        return NextResponse.json({
            // clientSecret 과 SMTP 비밀번호는 절대 내려보내지 않는다.
            google: {
                clientId: google.clientId ? '****' + google.clientId.slice(-8) : '',
                configured: google.configured,
            },
            smtp: {
                host: smtp.host,
                port: smtp.port,
                user: smtp.user,
                configured: smtp.configured,
            },
            // 엔진별로 지금 실제 연결되는지까지 함께 내려준다.
            ai: { ...ai, providers },
        });
    } catch (error) {
        return toErrorResponse(error, { log, message: '설정을 불러오지 못했습니다.' });
    }
}

// POST: 서비스 설정 업데이트
export async function POST(request: NextRequest) {
    const adminResult = await requireAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    try {
        const body = await request.json();

        // 빈 문자열은 "바꾸지 않음"으로 처리된다. 예전에는 부분 payload 하나로
        // 저장해 둔 clientSecret 이나 SMTP 비밀번호가 통째로 지워졌다.
        if (body.google) {
            await updateGoogleSettings({
                clientId: typeof body.google.clientId === 'string' ? body.google.clientId : undefined,
                clientSecret: typeof body.google.clientSecret === 'string' ? body.google.clientSecret : undefined,
            });
        }

        if (body.smtp) {
            await updateSmtpSettings({
                host: typeof body.smtp.host === 'string' ? body.smtp.host : undefined,
                port: typeof body.smtp.port === 'number' ? body.smtp.port : undefined,
                user: typeof body.smtp.user === 'string' ? body.smtp.user : undefined,
                pass: typeof body.smtp.pass === 'string' ? body.smtp.pass : undefined,
            });
        }

        if (body.ai) {
            const provider = parseAiProvider(body.ai.provider);
            await updateAiSettings({
                ...(provider ? { provider } : {}),
                ...(typeof body.ai.localBaseUrl === 'string' ? { localBaseUrl: body.ai.localBaseUrl.trim() } : {}),
                ...(typeof body.ai.localModel === 'string' ? { localModel: body.ai.localModel.trim() } : {}),
                ...(typeof body.ai.hermesBaseUrl === 'string' ? { hermesBaseUrl: body.ai.hermesBaseUrl.trim() } : {}),
                ...(typeof body.ai.hermesModel === 'string' ? { hermesModel: body.ai.hermesModel.trim() } : {}),
            });
        }

        const [google, smtp, ai, providers] = await Promise.all([
            getGoogleSettings(),
            getSmtpSettings(),
            getAiSettings(),
            getProviderStatuses(),
        ]);

        return NextResponse.json({
            success: true,
            message: '설정이 저장되었습니다.',
            google: { configured: google.configured },
            smtp: { configured: smtp.configured },
            ai: { ...ai, providers },
        });
    } catch (error) {
        return toErrorResponse(error, { log, message: '설정 저장에 실패했습니다.' });
    }
}
