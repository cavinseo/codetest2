/**
 * 환경별 구조화 로거.
 *
 * - 개발(dev): INFO/WARN/ERROR 모두 출력
 * - 운영(production): WARN/ERROR만 출력
 *
 * 규칙:
 *   - 이메일·비밀번호·토큰 등 PII(Personal Identifiable Information)를 절대 기록하지 않습니다.
 *   - userId 등 식별자는 기록 가능합니다 (감사 로그 목적).
 */

type LogLevel = 'info' | 'warn' | 'error';

interface LogMeta {
    [key: string]: string | number | boolean | undefined;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function formatMessage(level: LogLevel, module: string, message: string, meta?: LogMeta): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${metaStr}`;
}

/**
 * 오류 메시지 속 이메일 주소를 가린다.
 *
 * meta 는 호출부가 고르지만 오류 메시지는 라이브러리가 만든다. Prisma 는 실패한
 * 쿼리의 인자를 메시지에 그대로 싣기 때문에, 이메일로 조회·생성하다 난 오류가
 * 운영 로그에 주소를 남긴다. 호출부마다 조심하게 두지 않고 여기서 한 번에 가린다.
 */
export function redactEmails(text: string): string {
    return text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, '[email]');
}

/**
 * 모듈별 로거 인스턴스를 생성합니다.
 *
 * @param module - 로그를 남기는 모듈/파일명 (예: 'auth/login')
 */
export function createLogger(module: string) {
    return {
        /**
         * 일반 정보를 기록합니다. 운영 환경에서는 출력되지 않습니다.
         * PII(이메일, 비밀번호, 토큰 등)를 meta에 포함하지 마세요.
         */
        info(message: string, meta?: LogMeta): void {
            if (IS_PRODUCTION) return;
            console.info(formatMessage('info', module, message, meta));
        },

        /**
         * 경고를 기록합니다. 운영 환경에서도 출력됩니다.
         */
        warn(message: string, meta?: LogMeta): void {
            console.warn(formatMessage('warn', module, message, meta));
        },

        /**
         * 오류를 기록합니다. 운영 환경에서도 출력됩니다.
         * 원본 Error 객체는 두 번째 인자로 전달하세요.
         */
        error(message: string, error?: unknown, meta?: LogMeta): void {
            const errorMessage = redactEmails(error instanceof Error ? error.message : String(error ?? ''));
            const combinedMeta = errorMessage ? { ...meta, errorMessage } : meta;
            console.error(formatMessage('error', module, message, combinedMeta));
        },
    };
}
