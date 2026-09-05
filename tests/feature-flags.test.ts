// Google Forms 기능 플래그와 비활성 안내문의 계약을 고정한다.
import { describe, expect, it } from 'vitest';
import {
    GOOGLE_FORMS_DISABLED_MESSAGE,
    GOOGLE_FORMS_INTEGRATION_ENABLED,
} from '../lib/feature-flags';

describe('Google Forms 기능 플래그', () => {
    it('연동을 비활성 상태로 둔다', () => {
        expect(GOOGLE_FORMS_INTEGRATION_ENABLED).toBe(false);
    });

    it('개발 중 안내문 전문을 유지한다', () => {
        expect(GOOGLE_FORMS_DISABLED_MESSAGE).toBe(
            'Google Forms 연동은 개발 중입니다. 응답 파일 업로드 또는 오프라인 응답파일 업로드를 사용해 주세요.'
        );
        expect(GOOGLE_FORMS_DISABLED_MESSAGE).toContain('개발 중');
    });
});
