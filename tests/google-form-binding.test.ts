// Google Forms 설문 연결 정보가 프로젝트와 질문 매핑을 안전하게 고정하는지 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    GoogleFormBindingError,
    issueGoogleFormBinding,
    verifyGoogleFormBinding,
} from '../lib/google-form-binding';

const binding = {
    projectId: 'project_1',
    formId: 'form_1',
    questionPairs: [{
        requirementId: 'requirement_1',
        functionalQuestionId: 'question_1',
        dysfunctionalQuestionId: 'question_2',
    }],
};

beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-session-secret');
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('Google Forms 연결 정보', () => {
    it('발급한 설문과 프로젝트에서만 질문 매핑을 돌려준다', () => {
        const value = issueGoogleFormBinding(binding);

        expect(verifyGoogleFormBinding(value, 'project_1', 'form_1')).toEqual(binding);
    });

    it('서명 또는 프로젝트가 달라지면 설문 가져오기를 막는다', () => {
        const value = issueGoogleFormBinding(binding);

        expect(() => verifyGoogleFormBinding(`${value}x`, 'project_1', 'form_1'))
            .toThrow(GoogleFormBindingError);
        expect(() => verifyGoogleFormBinding(value, 'project_2', 'form_1'))
            .toThrow(GoogleFormBindingError);
    });
});
