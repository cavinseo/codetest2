// 회원등록 정보의 역할별 검증 스키마.
//
// DB 에서는 역할별 항목이 전부 nullable 이다. 멘토에게 companyName 을
// NOT NULL 로 걸 수 없기 때문이다. 그래서 필수 여부는 여기서 강제하고,
// 가입·프로필 수정·관리자 생성 세 경로가 이 한 곳을 공유한다.
import { z } from 'zod';
import type { MemberRole } from './member-roles';

/** 공백만 든 문자열을 값 없음으로 본다. */
const requiredText = (message: string) =>
    z.string().trim().min(1, message);

const commonShape = {
    organization: requiredText('소속기관명을 입력하세요.'),
    jobTitle: z.string().trim().optional(),
    phone: requiredText('휴대폰 번호를 입력하세요.'),
    privacyConsent: z.literal(true, {
        errorMap: () => ({ message: '개인정보 수집·이용에 동의해야 가입할 수 있습니다.' }),
    }),
};

const mentorShape = {
    expertise: requiredText('전문분야를 입력하세요.'),
    careerYears: z.number({ invalid_type_error: '경력 연수를 입력하세요.' }).int().min(0),
    careerSummary: z.string().trim().optional(),
};

const menteeShape = {
    companyName: requiredText('기업명을 입력하세요.'),
    industry: requiredText('업종을 입력하세요.'),
    foundedYear: z.number().int().optional(),
};

/**
 * 역할에 맞는 프로필 스키마를 돌려준다.
 * 매니저는 멘토에서 승격되므로 멘토와 똑같이 판정한다.
 * 관리자는 운영자이지 멘토링 당사자가 아니라 공통 항목만 본다.
 */
export function memberProfileSchemaFor(role: MemberRole) {
    if (role === 'MENTOR' || role === 'PROGRAM_MANAGER') {
        return z.object({ ...commonShape, ...mentorShape }).strict();
    }
    if (role === 'MENTEE') {
        return z.object({ ...commonShape, ...menteeShape }).strict();
    }
    return z.object(commonShape).strict();
}

export type MemberProfileInput = z.infer<ReturnType<typeof memberProfileSchemaFor>>;

/** 공백만 든 문자열을 값 없음으로 본다. requiredText 와 판정 기준을 맞춘다. */
function hasText(value?: string | null): boolean {
    return typeof value === 'string' && value.trim().length > 0;
}

/** 저장된 프로필이 이 역할에 필요한 항목을 다 갖췄는지. */
export function isProfileCompleteForRole(
    role: MemberRole,
    profile: {
        organization?: string | null;
        phone?: string | null;
        expertise?: string | null;
        careerYears?: number | null;
        companyName?: string | null;
        industry?: string | null;
    } | null
): boolean {
    if (profile === null) return false;
    if (!hasText(profile.organization) || !hasText(profile.phone)) return false;

    if (role === 'MENTOR' || role === 'PROGRAM_MANAGER') {
        return hasText(profile.expertise) && profile.careerYears != null;
    }
    if (role === 'MENTEE') {
        return hasText(profile.companyName) && hasText(profile.industry);
    }
    return true;
}
