// Google Forms 설문과 프로젝트 요구사항의 서명된 연결 정보를 검증한다.
import { createHmac, timingSafeEqual } from 'crypto';
import { getSessionSecret } from './auth';

export interface GoogleFormQuestionPair {
    requirementId: string;
    functionalQuestionId: string;
    dysfunctionalQuestionId: string;
}

export interface GoogleFormBinding {
    projectId: string;
    formId: string;
    questionPairs: GoogleFormQuestionPair[];
}

export class GoogleFormBindingError extends Error {}

function sign(payload: string): string {
    return createHmac('sha256', getSessionSecret())
        .update(`google-form-binding.${payload}`)
        .digest('base64url');
}

function isBinding(value: unknown): value is GoogleFormBinding {
    if (!value || typeof value !== 'object') return false;
    const binding = value as Partial<GoogleFormBinding>;
    return typeof binding.projectId === 'string'
        && typeof binding.formId === 'string'
        && Array.isArray(binding.questionPairs)
        && binding.questionPairs.every((pair) => (
            pair && typeof pair.requirementId === 'string'
            && typeof pair.functionalQuestionId === 'string'
            && typeof pair.dysfunctionalQuestionId === 'string'
        ));
}

export function issueGoogleFormBinding(binding: GoogleFormBinding): string {
    const payload = Buffer.from(JSON.stringify(binding), 'utf8').toString('base64url');
    return `${payload}.${sign(payload)}`;
}

export function verifyGoogleFormBinding(
    value: string,
    projectId: string,
    formId: string
): GoogleFormBinding {
    const [payload, signature] = value.split('.');
    if (!payload || !signature) throw new GoogleFormBindingError('생성한 설문 정보가 필요합니다.');

    const expected = Buffer.from(sign(payload), 'base64url');
    const actual = Buffer.from(signature, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        throw new GoogleFormBindingError('설문 정보가 올바르지 않습니다. 새 설문을 생성하세요.');
    }

    try {
        const binding = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!isBinding(binding) || binding.projectId !== projectId || binding.formId !== formId) {
            throw new GoogleFormBindingError('현재 프로젝트에서 만든 설문만 가져올 수 있습니다.');
        }
        return binding;
    } catch (error) {
        if (error instanceof GoogleFormBindingError) throw error;
        throw new GoogleFormBindingError('설문 정보가 올바르지 않습니다. 새 설문을 생성하세요.');
    }
}
