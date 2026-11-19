import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildKanoGoogleFormScript } from '../lib/kano-google-form-script';
import { buildKanoSurveyIntroduction } from '../lib/kano-survey-introduction';
import { buildKanoOfflineFormHtml } from '../lib/kano-offline-form';
import { escapeHtml } from '../lib/html-escape';

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

describe('Kano Google Forms script 소개문', () => {
    const introduction = {
        technology: '연료전지', productType: '발전', companyName: '(주)테스트', representativeName: '홍길동', offering: '가정용 발전기',
    };

    function describedBy(script: string): string {
        let description = '';
        const item = { setTitle: () => item, setHelpText: () => item, setChoiceValues: () => item, setRequired: () => item };
        runInNewContext(`${script}\ncreateKanoForm();`, {
            FormApp: { create: () => ({
                setDescription: (value: string) => { description = value; },
                setCollectEmail: () => undefined,
                addMultipleChoiceItem: () => item,
                getPublishedUrl: () => '', getEditUrl: () => '',
            }) },
            Logger: { log: () => undefined },
        });
        return description;
    }

    it('저장된 소개문을 설문지 설명 맨 위에 오프라인 설문지와 같은 문구로 넣는다', () => {
        const description = describedBy(buildKanoGoogleFormScript([{ requirement: '빠른 주문' }], '프로젝트', introduction));
        const expected = buildKanoSurveyIntroduction(introduction);

        expect(description.startsWith(`${expected}\n\n`)).toBe(true);
        expect(description).toContain('「연료전지」');
        expect(description).toContain('「(주)테스트」');
        // 기존 응답 안내는 소개문 뒤에 그대로 남는다.
        expect(description.indexOf('Kano 모델 기반 설문입니다')).toBeGreaterThan(expected.length);
        expect(description).toContain('긍정 질문과 부정 질문 두 가지에 답변해 주세요');
    });

    it('오프라인 HTML 설문지의 소개문과 글자 하나까지 같다', () => {
        const html = buildKanoOfflineFormHtml({ projectId: 'p', projectName: '프로젝트', requirements: [{ requirement: '빠른 주문' }], introduction });
        const description = describedBy(buildKanoGoogleFormScript([{ requirement: '빠른 주문' }], '프로젝트', introduction));

        expect(html).toContain(escapeHtml(description.split('\n\n')[0]));
    });

    it('소개문을 저장하지 않았으면 빈칸이 있는 기본 소개문을 넣는다', () => {
        const description = describedBy(buildKanoGoogleFormScript([{ requirement: '빠른 주문' }], '프로젝트'));

        expect(description.startsWith(buildKanoSurveyIntroduction())).toBe(true);
        expect(description).toContain('안녕하세요.');
    });

    it('소개문에 따옴표·줄바꿈·스크립트 조각이 있어도 문자열로만 들어간다', () => {
        // 생성된 파일은 사용자의 Google 계정에서 실행된다. 입력값이 코드로 해석되면 안 된다.
        const hostile = { ...introduction, companyName: `'); FormApp.hacked(); ('`, offering: '줄\n바꿈 "따옴표" \ </script>' };
        let hacked = false;
        const script = buildKanoGoogleFormScript([{ requirement: '빠른 주문' }], '프로젝트', hostile);
        const item = { setTitle: () => item, setHelpText: () => item, setChoiceValues: () => item, setRequired: () => item };
        let description = '';
        runInNewContext(`${script}\ncreateKanoForm();`, {
            FormApp: {
                hacked: () => { hacked = true; },
                create: () => ({
                    setDescription: (value: string) => { description = value; }, setCollectEmail: () => undefined,
                    addMultipleChoiceItem: () => item, getPublishedUrl: () => '', getEditUrl: () => '',
                }),
            },
            Logger: { log: () => undefined },
        });

        expect(hacked).toBe(false);
        expect(description.startsWith(buildKanoSurveyIntroduction(hostile))).toBe(true);
    });
});
