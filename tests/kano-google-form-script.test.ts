import { runInNewContext } from 'node:vm';
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

    it('저장된 질문과 기본 질문을 WS-6 설문지와 같은 문구로 사용한다', () => {
        const script = buildKanoGoogleFormScript([
            { requirement: '빠른 주문', kanoPositiveQ: '저장된 긍정 질문', kanoNegativeQ: '저장된 부정 질문' },
            { requirement: '안전한 보관' },
        ]);

        expect(script).toContain('"positiveDescription": "저장된 긍정 질문"');
        expect(script).toContain('"negativeDescription": "저장된 부정 질문"');
        expect(script).toContain('"positiveDescription": "안전한 보관(이)라면 어떻게 생각하십니까?"');
        expect(script).toContain('"negativeDescription": "안전한 보관(이)가 아니라면 어떻게 생각하십니까?"');
    });

    it('생성된 스크립트를 실행하면 긍정·부정 객관식 질문과 응답 URL을 만든다', () => {
        const script = buildKanoGoogleFormScript([{ requirement: '빠른 주문' }], '테스트 프로젝트');
        const items: Array<{ title?: string; help?: string; choices?: string[]; required?: boolean }> = [];
        const logs: string[] = [];
        const form = {
            setDescription: () => undefined,
            setCollectEmail: () => undefined,
            addMultipleChoiceItem: () => {
                const item: (typeof items)[number] & {
                    setTitle: (value: string) => typeof item;
                    setHelpText: (value: string) => typeof item;
                    setChoiceValues: (value: string[]) => typeof item;
                    setRequired: (value: boolean) => typeof item;
                } = {
                    setTitle(value) { this.title = value; return this; },
                    setHelpText(value) { this.help = value; return this; },
                    setChoiceValues(value) { this.choices = value; return this; },
                    setRequired(value) { this.required = value; return this; },
                };
                items.push(item);
                return item;
            },
            getPublishedUrl: () => 'https://forms.example/respond',
            getEditUrl: () => 'https://forms.example/edit',
        };

        runInNewContext(`${script}\ncreateKanoForm();`, {
            FormApp: { create: (title: string) => {
                expect(title).toBe('Kano 설문 조사 - 테스트 프로젝트');
                return form;
            } },
            Logger: { log: (message: string) => logs.push(message) },
        });

        expect(items).toHaveLength(2);
        expect(items.map(item => item.title)).toEqual(['[1-1] 빠른 주문', '[1-2] 빠른 주문']);
        expect(items.every(item => item.help?.includes('어떻게 생각하십니까?'))).toBe(true);
        expect(items.every(item => item.required && item.choices?.length === 5)).toBe(true);
        expect(logs).toEqual(['응답자용 URL: https://forms.example/respond', '편집용 URL: https://forms.example/edit']);
    });
});
