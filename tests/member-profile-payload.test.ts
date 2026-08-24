// 저장된 프로필 <-> 수정 폼 값의 왕복 변환.
import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, fromProfileRecord, toProfilePayload } from '../lib/member-profile-payload';

describe('EMPTY_PROFILE', () => {
    it('모든 칸이 빈 문자열이고 동의는 꺼져 있다', () => {
        // EMPTY_PROFILE 과 비교하는 테스트만 두면 상수가 바뀔 때 양쪽이 함께
        // 움직여 아무것도 못 잡는다. 실제 값을 여기서 못 박는다.
        expect(EMPTY_PROFILE).toEqual({
            organization: '', jobTitle: '', phone: '',
            expertise: '', careerYears: '', careerSummary: '',
            companyName: '', industry: '', foundedYear: '',
            privacyConsent: false,
        });
    });
});

describe('fromProfileRecord', () => {
    it('저장된 값이 없으면 빈 폼이다', () => {
        expect(fromProfileRecord(null)).toEqual(EMPTY_PROFILE);
        expect(fromProfileRecord(undefined)).toEqual(EMPTY_PROFILE);
    });

    it('없는 항목을 "undefined" 문자열로 만들지 않는다', () => {
        // String(undefined) 는 "undefined" 다. 그대로 새면 입력칸에 그 글자가 찍힌다.
        const value = fromProfileRecord({ organization: '가나대' });

        expect(value.jobTitle).toBe('');
        expect(value.phone).toBe('');
        expect(value.careerYears).toBe('');
        expect(value.companyName).toBe('');
    });

    it('문자열 항목을 그대로 옮긴다', () => {
        const value = fromProfileRecord({
            organization: '가나대', jobTitle: '팀장', phone: '010-1111-2222',
        });

        expect(value.organization).toBe('가나대');
        expect(value.jobTitle).toBe('팀장');
        expect(value.phone).toBe('010-1111-2222');
    });

    it('숫자 항목을 문자열로 편다', () => {
        // <input> 값은 문자열이라, 숫자를 그대로 넣으면 제어 컴포넌트가 흔들린다.
        const value = fromProfileRecord({ careerYears: 10, foundedYear: 2010 });

        expect(value.careerYears).toBe('10');
        expect(value.foundedYear).toBe('2010');
    });

    it('0 을 빈 문자열로 만들지 않는다', () => {
        // 경력 0년은 유효한 값이다. falsy 로 뭉뚱그리면 입력이 지워진다.
        const value = fromProfileRecord({ careerYears: 0, foundedYear: 0 });

        expect(value.careerYears).toBe('0');
        expect(value.foundedYear).toBe('0');
    });

    it('null 항목을 빈 문자열로 만든다', () => {
        // null 을 그대로 두면 React 가 uncontrolled 로 바뀐다고 경고한다.
        const value = fromProfileRecord({
            jobTitle: null, expertise: null, careerYears: null,
            careerSummary: null, companyName: null, industry: null, foundedYear: null,
        });

        expect(value.jobTitle).toBe('');
        expect(value.expertise).toBe('');
        expect(value.careerYears).toBe('');
        expect(value.careerSummary).toBe('');
        expect(value.companyName).toBe('');
        expect(value.industry).toBe('');
        expect(value.foundedYear).toBe('');
    });

    it('동의 시각이 있으면 이미 동의한 것으로 본다', () => {
        expect(fromProfileRecord({ privacyConsentAt: '2026-01-01T00:00:00Z' }).privacyConsent).toBe(true);
        expect(fromProfileRecord({ privacyConsentAt: new Date() }).privacyConsent).toBe(true);
    });

    it('동의 시각이 없으면 동의하지 않은 것으로 본다', () => {
        expect(fromProfileRecord({ privacyConsentAt: null }).privacyConsent).toBe(false);
        expect(fromProfileRecord({}).privacyConsent).toBe(false);
    });
});

describe('fromProfileRecord -> toProfilePayload 왕복', () => {
    it('멘티 값이 왕복해도 살아남는다', () => {
        // 수정 화면은 불러온 값을 그대로 다시 저장할 수 있어야 한다. 중간에
        // 항목이 새면 사용자가 건드리지도 않은 값이 지워진다.
        const saved = {
            organization: '가나대', jobTitle: '대표', phone: '010-1111-2222',
            companyName: '가나테크', industry: '제조', foundedYear: 2010,
            privacyConsentAt: '2026-01-01T00:00:00Z',
        };

        const payload = toProfilePayload(fromProfileRecord(saved), 'MENTEE');

        expect(payload).toMatchObject({
            organization: '가나대', jobTitle: '대표', phone: '010-1111-2222',
            companyName: '가나테크', industry: '제조', foundedYear: 2010,
            privacyConsent: true,
        });
    });

    it('멘토 값이 왕복해도 살아남는다', () => {
        const saved = {
            organization: '가나대', phone: '010-1111-2222',
            expertise: '재료공학', careerYears: 10, careerSummary: '이력',
            privacyConsentAt: '2026-01-01T00:00:00Z',
        };

        const payload = toProfilePayload(fromProfileRecord(saved), 'MENTOR');

        expect(payload).toMatchObject({
            organization: '가나대', phone: '010-1111-2222',
            expertise: '재료공학', careerYears: 10, careerSummary: '이력',
            privacyConsent: true,
        });
    });

    it('경력 0년이 왕복해도 0 으로 남는다', () => {
        const payload = toProfilePayload(
            fromProfileRecord({ organization: '가나대', phone: '010-1', expertise: '재료', careerYears: 0, privacyConsentAt: new Date() }),
            'MENTOR'
        );

        expect(payload.careerYears).toBe(0);
    });
});

describe('toProfilePayload: 비어 있는 선택 항목은 보내지 않는다', () => {
    // 빈 값을 실어 보내면 서버가 그 값으로 덮어써 버린다. 선택 항목은 아예
    // 빠져야 "건드리지 않음" 이 된다. 공백만 친 경우도 빈 값으로 본다.
    const base = { ...EMPTY_PROFILE, organization: '가나대', phone: '010-1111-2222', privacyConsent: true };

    it('직책이 비어 있으면 jobTitle 을 빼고, 공백만 쳐도 뺀다', () => {
        expect(toProfilePayload({ ...base, jobTitle: '' }, 'MENTEE')).not.toHaveProperty('jobTitle');
        expect(toProfilePayload({ ...base, jobTitle: '   ' }, 'MENTEE')).not.toHaveProperty('jobTitle');
    });

    it('직책이 있으면 그대로 담는다', () => {
        expect(toProfilePayload({ ...base, jobTitle: '팀장' }, 'MENTEE').jobTitle).toBe('팀장');
    });

    it('주요이력이 비어 있거나 공백뿐이면 careerSummary 를 뺀다', () => {
        const mentor = { ...base, expertise: '재료', careerYears: '10' };
        expect(toProfilePayload({ ...mentor, careerSummary: '' }, 'MENTOR')).not.toHaveProperty('careerSummary');
        expect(toProfilePayload({ ...mentor, careerSummary: '  ' }, 'MENTOR')).not.toHaveProperty('careerSummary');
        expect(toProfilePayload({ ...mentor, careerSummary: '이력' }, 'MENTOR').careerSummary).toBe('이력');
    });

    it('창업 연차가 비어 있거나 공백뿐이면 foundedYear 를 뺀다', () => {
        // 공백을 그대로 보내면 Number('  ') === 0 이라 창업 연차가 0 으로 저장된다.
        const mentee = { ...base, companyName: '가나테크', industry: '제조' };
        expect(toProfilePayload({ ...mentee, foundedYear: '' }, 'MENTEE')).not.toHaveProperty('foundedYear');
        expect(toProfilePayload({ ...mentee, foundedYear: '   ' }, 'MENTEE')).not.toHaveProperty('foundedYear');
        expect(toProfilePayload({ ...mentee, foundedYear: '2010' }, 'MENTEE').foundedYear).toBe(2010);
    });
});
