// 역할별로 필수 항목이 갈리는지 확인한다.
//
// DB 에서는 역할별 항목이 전부 nullable 이다. 멘토에게 companyName 을
// NOT NULL 로 걸 수 없기 때문이다. 그래서 필수 여부는 이 스키마가 강제한다.
import { describe, expect, it } from 'vitest';
import { isProfileCompleteForRole, memberProfileSchemaFor } from '../lib/member-profile';

const common = {
    organization: '한국기술대',
    phone: '010-1234-5678',
    privacyConsent: true,
};

describe('멘티 프로필', () => {
    const schema = memberProfileSchemaFor('MENTEE');

    it('기업명과 업종이 있으면 통과한다', () => {
        const result = schema.safeParse({ ...common, companyName: '가나테크', industry: '제조' });

        expect(result.success).toBe(true);
    });

    it('기업명이 없으면 막는다', () => {
        expect(schema.safeParse({ ...common, industry: '제조' }).success).toBe(false);
    });

    it('업종이 없으면 막는다', () => {
        expect(schema.safeParse({ ...common, companyName: '가나테크' }).success).toBe(false);
    });

    it('창업 연차는 없어도 된다', () => {
        const result = schema.safeParse({ ...common, companyName: '가나테크', industry: '제조' });

        expect(result.success).toBe(true);
    });

    it('전문분야를 요구하지 않는다', () => {
        // 멘티에게 멘토 항목을 물으면 안 된다.
        const result = schema.safeParse({ ...common, companyName: '가나테크', industry: '제조' });

        expect(result.success).toBe(true);
    });

    it('기업명이 빈 문자열이면 이유를 알려준다', () => {
        const result = schema.safeParse({ ...common, companyName: '   ', industry: '제조' });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('기업명을 입력하세요.');
        }
    });

    it('업종이 빈 문자열이면 이유를 알려준다', () => {
        const result = schema.safeParse({ ...common, companyName: '가나테크', industry: '   ' });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('업종을 입력하세요.');
        }
    });
});

describe('멘토 프로필', () => {
    const schema = memberProfileSchemaFor('MENTOR');

    it('전문분야와 경력 연수가 있으면 통과한다', () => {
        const result = schema.safeParse({ ...common, expertise: '재료공학', careerYears: 12 });

        expect(result.success).toBe(true);
    });

    it('전문분야가 없으면 막는다', () => {
        // 배정 판단의 근거라 비면 기능이 성립하지 않는다.
        expect(schema.safeParse({ ...common, careerYears: 12 }).success).toBe(false);
    });

    it('경력 연수가 없으면 막는다', () => {
        expect(schema.safeParse({ ...common, expertise: '재료공학' }).success).toBe(false);
    });

    it('기업명을 요구하지 않는다', () => {
        const result = schema.safeParse({ ...common, expertise: '재료공학', careerYears: 12 });

        expect(result.success).toBe(true);
    });

    it('전문분야가 빈 문자열이면 이유를 알려준다', () => {
        const result = schema.safeParse({ ...common, expertise: '   ', careerYears: 12 });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('전문분야를 입력하세요.');
        }
    });

    it('경력 연수 자리에 숫자가 아닌 값이 오면 이유를 알려준다', () => {
        const result = schema.safeParse({ ...common, expertise: '재료공학', careerYears: '12' });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('경력 연수를 입력하세요.');
        }
    });

    it('경력 요약의 앞뒤 공백을 정리한다', () => {
        const result = schema.safeParse({
            ...common,
            expertise: '재료공학',
            careerYears: 12,
            careerSummary: '  10년째 재료 연구  ',
        });

        expect(result.success).toBe(true);
        if (result.success) {
            // memberProfileSchemaFor 의 반환 타입은 역할별 분기의 합집합이라
            // careerSummary(멘토 전용 항목)가 모든 갈래에 있지는 않다.
            const data = result.data as { careerSummary?: string };

            expect(data.careerSummary).toBe('10년째 재료 연구');
        }
    });
});

describe('프로그램 매니저 프로필', () => {
    it('멘토와 똑같이 판정한다', () => {
        // 매니저는 멘토에서 승격되므로 이미 멘토 항목을 채운 상태다.
        // 승격했다고 항목이 사라지면 해임 후 다시 받아야 한다.
        const schema = memberProfileSchemaFor('PROGRAM_MANAGER');

        expect(schema.safeParse({ ...common, expertise: '재료공학', careerYears: 12 }).success).toBe(true);
        expect(schema.safeParse(common).success).toBe(false);
    });
});

describe('관리자 프로필', () => {
    it('공통 항목만 있으면 통과한다', () => {
        // 관리자는 운영자이지 멘토링 당사자가 아니다.
        expect(memberProfileSchemaFor('ADMIN').safeParse(common).success).toBe(true);
    });
});

describe('공통 항목', () => {
    const schema = memberProfileSchemaFor('ADMIN');

    it('소속기관명이 없으면 막는다', () => {
        expect(schema.safeParse({ phone: '010-1234-5678', privacyConsent: true }).success).toBe(false);
    });

    it('휴대폰이 없으면 막는다', () => {
        expect(schema.safeParse({ organization: '한국기술대', privacyConsent: true }).success).toBe(false);
    });

    it('개인정보 동의가 false 면 막는다', () => {
        expect(schema.safeParse({ ...common, privacyConsent: false }).success).toBe(false);
    });

    it('직책은 없어도 된다', () => {
        expect(schema.safeParse(common).success).toBe(true);
    });

    it('빈 문자열은 값이 없는 것으로 본다', () => {
        expect(schema.safeParse({ ...common, organization: '   ' }).success).toBe(false);
    });

    it('소속기관명이 빈 문자열이면 이유를 알려준다', () => {
        const result = schema.safeParse({ ...common, organization: '   ' });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('소속기관명을 입력하세요.');
        }
    });

    it('휴대폰이 빈 문자열이면 이유를 알려준다', () => {
        const result = schema.safeParse({ ...common, phone: '   ' });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('휴대폰 번호를 입력하세요.');
        }
    });

    it('개인정보 동의가 없으면 이유를 알려준다', () => {
        const result = schema.safeParse({ ...common, privacyConsent: false });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('개인정보 수집·이용에 동의해야 가입할 수 있습니다.');
        }
    });

    it('직책의 앞뒤 공백을 정리한다', () => {
        const result = schema.safeParse({ ...common, jobTitle: '  팀장  ' });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.jobTitle).toBe('팀장');
        }
    });
});

describe('isProfileCompleteForRole', () => {
    it('행 자체가 없으면 항상 미완성이다', () => {
        expect(isProfileCompleteForRole('MENTEE', null)).toBe(false);
        expect(isProfileCompleteForRole('MENTOR', null)).toBe(false);
        expect(isProfileCompleteForRole('PROGRAM_MANAGER', null)).toBe(false);
        expect(isProfileCompleteForRole('ADMIN', null)).toBe(false);
    });

    it('관리자는 공통 항목만 갖추면 완성이다', () => {
        expect(
            isProfileCompleteForRole('ADMIN', { organization: '한국기술대', phone: '010-1234-5678' })
        ).toBe(true);
    });

    it('관리자도 소속기관명이나 휴대폰이 없으면 미완성이다', () => {
        expect(isProfileCompleteForRole('ADMIN', { organization: '한국기술대', phone: null })).toBe(false);
        expect(isProfileCompleteForRole('ADMIN', { organization: null, phone: '010-1234-5678' })).toBe(false);
    });

    describe('멘토·매니저', () => {
        const complete = {
            organization: '한국기술대', phone: '010-1234-5678',
            expertise: '재료공학', careerYears: 12,
        };

        it('공통 항목과 전문분야·경력 연수를 갖추면 완성이다', () => {
            expect(isProfileCompleteForRole('MENTOR', complete)).toBe(true);
            expect(isProfileCompleteForRole('PROGRAM_MANAGER', complete)).toBe(true);
        });

        it('전문분야가 없으면 미완성이다', () => {
            // 승격된 멘토가 여기 걸리지 않으면 배정 근거 없이 배정될 수 있다.
            expect(isProfileCompleteForRole('MENTOR', { ...complete, expertise: null })).toBe(false);
        });

        it('매니저도 전문분야가 없으면 미완성이다', () => {
            // 매니저를 멘토 판정 갈래에서 빠뜨리면 공통 항목만으로 완성 처리될 수 있다.
            expect(isProfileCompleteForRole('PROGRAM_MANAGER', { ...complete, expertise: null })).toBe(false);
        });

        it('경력 연수가 없으면 미완성이다', () => {
            expect(isProfileCompleteForRole('MENTOR', { ...complete, careerYears: null })).toBe(false);
        });

        it('경력 연수 0 은 값이 있는 것으로 본다', () => {
            expect(isProfileCompleteForRole('MENTOR', { ...complete, careerYears: 0 })).toBe(true);
        });

        it('멘티 전용 항목이 없어도 완성이다', () => {
            expect(isProfileCompleteForRole('MENTOR', complete)).toBe(true);
        });
    });

    describe('멘티', () => {
        const complete = {
            organization: '한국기술대', phone: '010-1234-5678',
            companyName: '가나테크', industry: '제조',
        };

        it('공통 항목과 기업명·업종을 갖추면 완성이다', () => {
            expect(isProfileCompleteForRole('MENTEE', complete)).toBe(true);
        });

        it('기업명이 없으면 미완성이다', () => {
            expect(isProfileCompleteForRole('MENTEE', { ...complete, companyName: null })).toBe(false);
        });

        it('업종이 없으면 미완성이다', () => {
            expect(isProfileCompleteForRole('MENTEE', { ...complete, industry: null })).toBe(false);
        });

        it('멘토 전용 항목이 없어도 완성이다', () => {
            expect(isProfileCompleteForRole('MENTEE', complete)).toBe(true);
        });
    });

    it('공백만 있는 문자열은 값이 없는 것으로 본다', () => {
        expect(
            isProfileCompleteForRole('ADMIN', { organization: '   ', phone: '010-1234-5678' })
        ).toBe(false);
        expect(
            isProfileCompleteForRole('ADMIN', { organization: '한국기술대', phone: '   ' })
        ).toBe(false);
        expect(
            isProfileCompleteForRole('MENTOR', {
                organization: '한국기술대', phone: '010-1234-5678',
                expertise: '   ', careerYears: 12,
            })
        ).toBe(false);
        expect(
            isProfileCompleteForRole('MENTEE', {
                organization: '한국기술대', phone: '010-1234-5678',
                companyName: '가나테크', industry: '   ',
            })
        ).toBe(false);
    });
});
