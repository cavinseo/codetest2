// 회원등록 폼 값을 서버가 받는 프로필 payload 형태로 바꾸는 순수 함수. JSX 가 없어 테스트에서 그대로 임포트할 수 있다.
import type { MemberRole } from './member-roles';

export interface ProfileValue {
    organization: string;
    jobTitle: string;
    phone: string;
    expertise: string;
    careerYears: string;
    careerSummary: string;
    companyName: string;
    industry: string;
    foundedYear: string;
    privacyConsent: boolean;
}

export const EMPTY_PROFILE: ProfileValue = {
    organization: '', jobTitle: '', phone: '',
    expertise: '', careerYears: '', careerSummary: '',
    companyName: '', industry: '', foundedYear: '',
    privacyConsent: false,
};

/** 서버가 받는 형태로 바꾼다. 빈 값은 보내지 않아 선택 항목으로 남긴다. */
export function toProfilePayload(value: ProfileValue, role: MemberRole): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        organization: value.organization,
        phone: value.phone,
        privacyConsent: value.privacyConsent,
    };
    if (value.jobTitle.trim()) payload.jobTitle = value.jobTitle;

    if (role === 'MENTOR' || role === 'PROGRAM_MANAGER') {
        payload.expertise = value.expertise;
        payload.careerYears = Number(value.careerYears);
        if (value.careerSummary.trim()) payload.careerSummary = value.careerSummary;
    } else if (role === 'MENTEE') {
        payload.companyName = value.companyName;
        payload.industry = value.industry;
        if (value.foundedYear.trim()) payload.foundedYear = Number(value.foundedYear);
    }
    return payload;
}
