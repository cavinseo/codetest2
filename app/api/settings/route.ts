import { NextRequest, NextResponse } from 'next/server';
import { serviceSettings, updateGoogleSettings, isGoogleConfigured, updateSmtpSettings, isSmtpConfigured } from '@/lib/service-settings';

// GET: 현재 서비스 설정 조회
export async function GET() {
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
    });
}

// POST: 서비스 설정 업데이트
export async function POST(request: NextRequest) {
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

        return NextResponse.json({
            success: true,
            message: '설정이 저장되었습니다.',
            google: {
                configured: isGoogleConfigured(),
            },
            smtp: {
                configured: isSmtpConfigured(),
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: '설정 저장에 실패했습니다.' },
            { status: 500 }
        );
    }
}
