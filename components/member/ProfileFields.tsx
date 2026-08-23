'use client';
// 역할에 맞는 회원등록 항목만 보여주는 공용 입력 폼.

import type { MemberRole } from '@/lib/member-roles';

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

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';

export default function ProfileFields({
    role,
    value,
    onChange,
    showConsent = true,
}: {
    role: MemberRole;
    value: ProfileValue;
    onChange: (next: ProfileValue) => void;
    showConsent?: boolean;
}) {
    const set = (key: keyof ProfileValue, v: string | boolean) => onChange({ ...value, [key]: v });
    const isMentorSide = role === 'MENTOR' || role === 'PROGRAM_MANAGER';

    return (
        <div className="space-y-3">
            <label className="block text-sm">
                소속기관명 <span className="text-red-500">*</span>
                <input className={inputClass} value={value.organization}
                    onChange={(e) => set('organization', e.target.value)} required />
            </label>

            <label className="block text-sm">
                직책·직위
                <input className={inputClass} value={value.jobTitle}
                    onChange={(e) => set('jobTitle', e.target.value)} />
            </label>

            <label className="block text-sm">
                휴대폰 <span className="text-red-500">*</span>
                <input className={inputClass} value={value.phone} placeholder="010-0000-0000"
                    onChange={(e) => set('phone', e.target.value)} required />
            </label>

            {isMentorSide && (
                <>
                    <label className="block text-sm">
                        전문분야 <span className="text-red-500">*</span>
                        <input className={inputClass} value={value.expertise}
                            onChange={(e) => set('expertise', e.target.value)} required />
                    </label>
                    <label className="block text-sm">
                        경력 연수 <span className="text-red-500">*</span>
                        <input type="number" min={0} className={inputClass} value={value.careerYears}
                            onChange={(e) => set('careerYears', e.target.value)} required />
                    </label>
                    <label className="block text-sm">
                        주요이력·보유자격
                        <textarea className={inputClass} rows={3} value={value.careerSummary}
                            onChange={(e) => set('careerSummary', e.target.value)} />
                    </label>
                </>
            )}

            {role === 'MENTEE' && (
                <>
                    <label className="block text-sm">
                        기업명 <span className="text-red-500">*</span>
                        <input className={inputClass} value={value.companyName}
                            onChange={(e) => set('companyName', e.target.value)} required />
                    </label>
                    <label className="block text-sm">
                        업종 <span className="text-red-500">*</span>
                        <input className={inputClass} value={value.industry}
                            onChange={(e) => set('industry', e.target.value)} required />
                    </label>
                    <label className="block text-sm">
                        창업 연차
                        <input type="number" min={0} className={inputClass} value={value.foundedYear}
                            onChange={(e) => set('foundedYear', e.target.value)} />
                    </label>
                </>
            )}

            {showConsent && (
                <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={value.privacyConsent}
                        onChange={(e) => set('privacyConsent', e.target.checked)} required />
                    <span>개인정보 수집·이용에 동의합니다. 소속·연락처는 프로그램 운영에만 씁니다.</span>
                </label>
            )}
        </div>
    );
}
