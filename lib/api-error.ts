// 클라이언트에 내부 오류를 흘리지 않기 위한 공용 응답 헬퍼.
//
// 여러 라우트가 catch 에서 error.message / error.code / String(error) 를 그대로
// 응답에 담고 있었다. Prisma 오류 메시지에는 테이블명·컬럼명·제약조건명이 들어가고,
// 그중 설문 제출 라우트는 인증 없이 호출 가능한 공개 엔드포인트다.
//
// 사용자에게는 고정 문구와 상관 ID 만 주고, 상세는 서버 로그에서 그 ID 로 찾는다.
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

// createLogger 가 돌려주는 객체를 그대로 받을 수 있도록 meta 타입을 맞춘다.
type LogValue = string | number | boolean | undefined;

export interface ErrorLogger {
    error: (message: string, error?: unknown, meta?: Record<string, LogValue>) => void;
}

/** Prisma 오류처럼 code 를 가진 객체인지 본다. */
export function errorCodeOf(error: unknown): string | null {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        if (typeof code === 'string') return code;
    }
    return null;
}

/**
 * 내부 오류를 사용자용 500 응답으로 바꾼다.
 * 상관 ID 를 만들어 응답과 로그 양쪽에 남기므로, 사용자가 알려준 ID 로 로그를 찾을 수 있다.
 */
export function toErrorResponse(
    error: unknown,
    options: { log: ErrorLogger; message: string; context?: Record<string, LogValue> }
): NextResponse {
    const referenceId = randomUUID().slice(0, 8);

    options.log.error(options.message, error, {
        ...options.context,
        referenceId,
        code: errorCodeOf(error) ?? undefined,
    });

    return NextResponse.json(
        { error: options.message, referenceId },
        { status: 500 }
    );
}
