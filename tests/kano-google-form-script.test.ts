import { describe, expect, it } from 'vitest';
import { buildKanoGoogleFormScript } from '../lib/kano-google-form-script';

describe('Kano Google Forms script', () => {
    it('builds a Google Apps Script file with the project questions and Kano choices', () => {
        const script = buildKanoGoogleFormScript([
            {
                category: '배송',
                subcategory: '속도',
                requirement: '빠른 주문 완료',
                kanoPositiveQ: '빠른 주문 완료가 있으면?',
                kanoNegativeQ: '빠른 주문 완료가 없으면?',
            },
        ], '테스트 프로젝트');

        expect(script).toContain('function createKanoForm()');
        expect(script).toContain('FormApp.create("Kano 설문 조사 - 테스트 프로젝트")');
        expect(script).toContain('"[1-1] 빠른 주문 완료"');
        expect(script).toContain('"[1-2] 빠른 주문 완료"');
        expect(script).not.toContain('[긍정]');
        expect(script).not.toContain('[부정]');
        expect(script).toContain('"마음에 든다"');
        expect(script).toContain('"당연하다"');
        expect(script).toContain('"아무런느낌이 없다"');
        expect(script).toContain('"하는수 없다"');
        expect(script).toContain('"마음에 안든다"');
        expect(script).toContain('form.setCollectEmail(true)');
        expect(script).toContain("Logger.log('응답자용 URL: ' + form.getPublishedUrl())");
    });
});
