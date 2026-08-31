// 멘토·멘티 초대 코드의 생성과 검증.
import { randomBytes } from 'crypto';
import type { InvitableRole } from './member-roles';

/** 코드 자체의 기본 사용 기한(일). 접근 기간(90일)과는 다른 값이다. */
export const INVITE_CODE_VALID_DAYS = 14;

// 사람이 메일에서 옮겨 적는 값이라 헷갈리는 글자(0/O, 1/I/L)를 뺀다.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;
const GROUP_SIZE = 4;

/**
 * KSQF-XXXX-XXXX-XXXX 형태의 코드를 만든다.
 * randomBytes 로 뽑고 알파벳 길이로 나눈 나머지를 쓴다. 31개 문자 x 12자리면
 * 약 59비트라 추측으로 맞히기는 어렵다.
 */
export function generateInviteCode(): string {
    const bytes = randomBytes(CODE_LENGTH);
    let raw = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }

    const groups: string[] = [];
    for (let i = 0; i < raw.length; i += GROUP_SIZE) {
        groups.push(raw.slice(i, i + GROUP_SIZE));
    }
    return `KSQF-${groups.join('-')}`;
}

/** 사용자가 붙여넣은 값을 조회용으로 정규화한다. 공백·소문자·구분자 차이를 흡수한다. */
export function normalizeInviteCode(value: string): string {
    const cleaned = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const body = cleaned.startsWith('KSQF') ? cleaned.slice(4) : cleaned;

    const groups: string[] = [];
    for (let i = 0; i < body.length; i += GROUP_SIZE) {
        groups.push(body.slice(i, i + GROUP_SIZE));
    }
    return `KSQF-${groups.join('-')}`;
}

export function inviteCodeExpiryFrom(issuedAt: Date, validDays: number = INVITE_CODE_VALID_DAYS): Date {
    const expiry = new Date(issuedAt);
    expiry.setDate(expiry.getDate() + validDays);
    return expiry;
}

export interface InviteCodeRecord {
    email: string;
    role: string;
    expiresAt: Date;
    usedAt: Date | null;
}

export type InviteCodeRejection =
    | 'NOT_FOUND'
    | 'ALREADY_USED'
    | 'EXPIRED'
    | 'EMAIL_MISMATCH';

// 화면에 그대로 나가는 UX 카피다. 문구를 테스트로 고정하면 카피를 고칠 때마다
// 테스트가 깨지기만 하고 잡히는 결함이 없어, 뮤테이션 대상에서 뺀다.
// 어떤 거절 사유에 어떤 문구가 붙는지(키 매핑)는 호출부 테스트가 이미 지킨다.
// Stryker disable all
export const INVITE_CODE_MESSAGES: Record<InviteCodeRejection, string> = {
    NOT_FOUND: '유효하지 않은 초대 코드입니다.',
    ALREADY_USED: '이미 사용된 초대 코드입니다.',
    EXPIRED: '기한이 지난 초대 코드입니다. 재발급을 요청하세요.',
    EMAIL_MISMATCH: '초대 코드를 받은 이메일로만 가입할 수 있습니다.',
};
// Stryker restore all

/**
 * 코드를 쓸 수 있는지 본다. 문제가 없으면 null.
 *
 * 이메일을 대조하는 이유: 코드가 메일로 나가므로 전달·유출되면 제3자가 쓸 수 있다.
 * 발급 대상 주소로만 가입하도록 묶어 둔다.
 */
export function checkInviteCode(
    record: InviteCodeRecord | null,
    email: string,
    now: Date = new Date()
): InviteCodeRejection | null {
    if (!record) return 'NOT_FOUND';
    if (record.usedAt) return 'ALREADY_USED';
    if (record.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
    if (record.email.trim().toLowerCase() !== email.trim().toLowerCase()) return 'EMAIL_MISMATCH';
    return null;
}

/** 초대 메일 본문. 코드와 기한, 부여될 역할을 함께 알린다. */
export function buildInviteEmail(params: {
    code: string;
    roleLabel: string;
    expiresAt: Date;
    accessDurationDays: number;
    signupUrl: string;
    escapeHtml: (value: string) => string;
}): { subject: string; html: string } {
    const expiry = params.expiresAt.toISOString().slice(0, 10);
    const code = params.escapeHtml(params.code);
    const roleLabel = params.escapeHtml(params.roleLabel);
    const signupUrl = params.escapeHtml(params.signupUrl);

    return {
        subject: `[KS-QFD] ${params.roleLabel} 초대 코드 안내`,
        html: `
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0; padding: 28px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">KS-QFD 초대</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">${roleLabel}로 초대되었습니다</p>
        </div>
        <div style="background: white; padding: 28px; border-radius: 0 0 12px 12px;">
            <p style="color: #333; font-size: 15px;">아래 초대 코드로 회원가입을 진행해 주세요.</p>
            <div style="margin: 20px 0; padding: 16px; background: #f1f5f9; border-radius: 8px; text-align: center;">
                <span style="font-family: monospace; font-size: 20px; font-weight: 700; letter-spacing: 2px; color: #0f172a;">${code}</span>
            </div>
            <ul style="color: #555; font-size: 13px; line-height: 1.8; padding-left: 18px;">
                <li>이 메일을 받은 주소로만 가입할 수 있습니다.</li>
                <li>코드 사용 기한: <strong>${expiry}</strong>까지</li>
                <li>가입 후 <strong>${params.accessDurationDays}일</strong>간 이용할 수 있습니다.</li>
            </ul>
            <div style="text-align: center; margin: 26px 0 8px;">
                <a href="${signupUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 13px 36px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">회원가입 하러 가기</a>
            </div>
        </div>
    </div>
    `,
    };
}
