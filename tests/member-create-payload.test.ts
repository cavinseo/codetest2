// toProfilePayload 가 만든 값이 실제로 memberProfileSchemaFor 를 통과하는지 역할별로 고정한다.
import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, toProfilePayload, type ProfileValue } from '../lib/member-profile-payload';
import { memberProfileSchemaFor } from '../lib/member-profile';
import { MEMBER_ROLES } from '../lib/member-roles';

const filled: ProfileValue = {
    ...EMPTY_PROFILE,
    organization: '가나대',
    phone: '010-0000-0000',
    privacyConsent: true,
    expertise: '재료공학',
    careerYears: '10',
    companyName: '가나기업',
    industry: '제조업',
};

describe('toProfilePayload 가 memberProfileSchemaFor 를 통과하는지', () => {
    it.each(MEMBER_ROLES)('%s 역할의 payload 가 스키마를 통과한다', (role) => {
        const result = memberProfileSchemaFor(role).safeParse(toProfilePayload(filled, role));

        expect(result.success).toBe(true);
    });

    it('관리자 계정 생성 화면에서 동의 체크 후 만든 멘티 payload 가 통과한다', () => {
        // Finding 1: MembersTab 이 ProfileFields 에 showConsent=false 를 넘겨 동의
        // 체크박스를 숨기면 privacyConsent 가 항상 false 로 남아 이 테스트가
        // 그대로 실패했어야 한다.
        const menteeValue: ProfileValue = { ...filled, expertise: '', careerYears: '' };

        const result = memberProfileSchemaFor('MENTEE').safeParse(toProfilePayload(menteeValue, 'MENTEE'));

        expect(result.success).toBe(true);
    });

    it('동의하지 않으면 막힌다', () => {
        const result = memberProfileSchemaFor('MENTOR').safeParse(
            toProfilePayload({ ...filled, privacyConsent: false }, 'MENTOR')
        );

        expect(result.success).toBe(false);
    });
});
