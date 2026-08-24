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

/** DB 에 저장된 프로필 행이 갖는 모양. 없는 항목은 null 로 온다. */
export interface ProfileRecord {
    organization?: string | null;
    jobTitle?: string | null;
    phone?: string | null;
    expertise?: string | null;
    careerYears?: number | null;
    careerSummary?: string | null;
    companyName?: string | null;
    industry?: string | null;
    foundedYear?: number | null;
    privacyConsentAt?: string | Date | null;
}

/**
 * 저장된 프로필을 수정 폼 값으로 되돌린다. toProfilePayload 의 역방향이다.
 *
 * 폼은 모든 칸을 문자열로 다루므로(숫자 입력도 <input> 값은 문자열이다) null 과
 * 숫자를 전부 문자열로 편다. 그러지 않으면 React 가 제어 컴포넌트에 null 을
 * 받아 "uncontrolled 로 바뀐다" 경고를 내고 입력이 초기화된다.
 *
 * privacyConsent 는 저장된 동의 시각이 있으면 이미 동의한 것으로 본다. 수정
 * 화면에서 매번 다시 체크하게 만들 이유가 없고, 서버 스키마가 true 를 요구해
 * 체크가 풀린 채로는 저장 자체가 막힌다.
 */
export function fromProfileRecord(record: ProfileRecord | null | undefined): ProfileValue {
    if (!record) return EMPTY_PROFILE;
    const text = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));
    return {
        organization: text(record.organization),
        jobTitle: text(record.jobTitle),
        phone: text(record.phone),
        expertise: text(record.expertise),
        careerYears: text(record.careerYears),
        careerSummary: text(record.careerSummary),
        companyName: text(record.companyName),
        industry: text(record.industry),
        foundedYear: text(record.foundedYear),
        privacyConsent: Boolean(record.privacyConsentAt),
    };
}

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
