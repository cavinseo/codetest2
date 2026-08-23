'use client';
// 역할에 맞는 회원등록 항목만 보여주는 공용 입력 폼.

import type { MemberRole } from '@/lib/member-roles';
import { EMPTY_PROFILE, toProfilePayload, type ProfileValue } from '@/lib/member-profile-payload';

// toProfilePayload/EMPTY_PROFILE/ProfileValue 는 JSX 없는 lib/member-profile-payload.ts 로
// 옮겨 vitest 가 직접 임포트할 수 있게 했다. 기존 소비자는 그대로 여기서 가져온다.
export { EMPTY_PROFILE, toProfilePayload, type ProfileValue };

const inputClass = 'input mt-2';
const labelClass = 'block text-sm font-medium text-gray-400';

export default function ProfileFields({
    role,
    value,
    onChange,
    consentLabel = '개인정보 수집·이용에 동의합니다. 소속·연락처는 프로그램 운영에만 씁니다.',
}: {
    role: MemberRole;
    value: ProfileValue;
    onChange: (next: ProfileValue) => void;
    consentLabel?: string;
}) {
    const set = (key: keyof ProfileValue, v: string | boolean) => onChange({ ...value, [key]: v });
    const isMentorSide = role === 'MENTOR' || role === 'PROGRAM_MANAGER';

    return (
        <div className="space-y-3">
            <label className={labelClass}>
                소속기관명 <span className="text-red-500">*</span>
                <input className={inputClass} value={value.organization}
                    onChange={(e) => set('organization', e.target.value)} required />
            </label>

            <label className={labelClass}>
                직책·직위
                <input className={inputClass} value={value.jobTitle}
                    onChange={(e) => set('jobTitle', e.target.value)} />
            </label>

            <label className={labelClass}>
                휴대폰 <span className="text-red-500">*</span>
                <input className={inputClass} value={value.phone} placeholder="010-0000-0000"
                    onChange={(e) => set('phone', e.target.value)} required />
            </label>

            {isMentorSide && (
                <>
                    <label className={labelClass}>
                        전문분야 <span className="text-red-500">*</span>
                        <input className={inputClass} value={value.expertise}
                            onChange={(e) => set('expertise', e.target.value)} required />
                    </label>
                    <label className={labelClass}>
                        경력 연수 <span className="text-red-500">*</span>
                        <input type="number" min={0} className={inputClass} value={value.careerYears}
                            onChange={(e) => set('careerYears', e.target.value)} required />
                    </label>
                    <label className={labelClass}>
                        주요이력·보유자격
                        <textarea className={inputClass} rows={3} value={value.careerSummary}
                            onChange={(e) => set('careerSummary', e.target.value)} />
                    </label>
                </>
            )}

            {role === 'MENTEE' && (
                <>
                    <label className={labelClass}>
                        기업명 <span className="text-red-500">*</span>
                        <input className={inputClass} value={value.companyName}
                            onChange={(e) => set('companyName', e.target.value)} required />
                    </label>
                    <label className={labelClass}>
                        업종 <span className="text-red-500">*</span>
                        <input className={inputClass} value={value.industry}
                            onChange={(e) => set('industry', e.target.value)} required />
                    </label>
                    <label className={labelClass}>
                        창업 연차
                        <input type="number" min={0} className={inputClass} value={value.foundedYear}
                            onChange={(e) => set('foundedYear', e.target.value)} />
                    </label>
                </>
            )}

            <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={value.privacyConsent}
                    onChange={(e) => set('privacyConsent', e.target.checked)} required />
                <span>{consentLabel}</span>
            </label>
        </div>
    );
}
