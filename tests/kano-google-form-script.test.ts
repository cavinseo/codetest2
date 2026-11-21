import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildKanoGoogleFormScript } from '../lib/kano-google-form-script';
import { buildKanoSurveyIntroduction } from '../lib/kano-survey-introduction';
import { buildKanoOfflineFormHtml } from '../lib/kano-offline-form';
import { escapeHtml } from '../lib/html-escape';
import { readKanoExcelRequirementIds } from '../lib/kano-requirement-snapshot';

interface CreatedItem { title?: string; help?: string; choices?: string[]; required?: boolean }

// 생성된 Apps Script 를 FormApp·Logger 대역 위에서 실제로 실행해, 문자열 비교가
// 아니라 Google 설문지에 무엇이 만들어지는지로 판정한다.
function runGeneratedScript(script: string) {
    const created = {
        formTitle: '',
        description: '',
        collectEmail: false,
        items: [] as CreatedItem[],
        logs: [] as string[],
        injectedCodeRan: false,
    };
    const form = {
        setDescription: (value: string) => { created.description = value; },
        setCollectEmail: (value: boolean) => { created.collectEmail = value; },
        addMultipleChoiceItem: () => {
            const item: CreatedItem = {};
            created.items.push(item);
            const builder = {
                setTitle: (value: string) => { item.title = value; return builder; },
                setHelpText: (value: string) => { item.help = value; return builder; },
                setChoiceValues: (value: string[]) => { item.choices = value; return builder; },
                setRequired: (value: boolean) => { item.required = value; return builder; },
            };
            return builder;
        },
        getPublishedUrl: () => 'https://forms.example/respond',
        getEditUrl: () => 'https://forms.example/edit',
    };
    runInNewContext(`${script}\ncreateKanoForm();`, {
        FormApp: {
            create: (title: string) => { created.formTitle = title; return form; },
            // 입력값이 코드로 새어 나가면 이 함수가 불린다.
            hacked: () => { created.injectedCodeRan = true; },
        },
        Logger: { log: (message: string) => created.logs.push(message) },
    });
    return created;
}

describe('Kano Google Forms script', () => {
    it('프로젝트 질문마다 Kano 선택지를 가진 필수 객관식 문항 두 개를 만든다', () => {
        const created = runGeneratedScript(buildKanoGoogleFormScript([
            { requirement: '빠른 주문 완료', kanoPositiveQ: '빠른 주문 완료가 있으면?', kanoNegativeQ: '빠른 주문 완료가 없으면?' },
        ], '테스트 프로젝트'));

        expect(created.formTitle).toBe('Kano 설문 조사 - 테스트 프로젝트');
        expect(created.collectEmail).toBe(true);
        expect(created.items.map(item => item.title)).toEqual(['[1-1] 빠른 주문 완료가 있으면?', '[1-2] 빠른 주문 완료가 없으면?']);
        for (const item of created.items) {
            expect(item.required).toBe(true);
            expect(item.choices).toEqual(['마음에 든다', '당연하다', '아무런느낌이 없다', '하는수 없다', '마음에 안든다']);
        }
        expect(created.logs).toEqual(['응답자용 URL: https://forms.example/respond', '편집용 URL: https://forms.example/edit']);
    });

    it('질문 문장을 설명란이 아니라 제목에 바로 보인다', () => {
        const created = runGeneratedScript(buildKanoGoogleFormScript([{ requirement: '빠른 주문' }]));

        expect(created.items.map(item => item.title)).toEqual([
            '[1-1] 빠른 주문(이)라면 어떻게 생각하십니까?',
            '[1-2] 빠른 주문(이)가 아니라면 어떻게 생각하십니까?',
        ]);
        expect(created.items.every(item => item.help === undefined)).toBe(true);
    });

    it('저장된 질문과 기본 질문을 WS-6 설문지와 같은 문구로 사용한다', () => {
        const created = runGeneratedScript(buildKanoGoogleFormScript([
            { requirement: '빠른 주문', kanoPositiveQ: '저장된 긍정 질문', kanoNegativeQ: '저장된 부정 질문' },
            { requirement: '안전한 보관' },
        ]));

        expect(created.items.map(item => item.title)).toEqual([
            '[1-1] 저장된 긍정 질문',
            '[1-2] 저장된 부정 질문',
            '[2-1] 안전한 보관(이)라면 어떻게 생각하십니까?',
            '[2-2] 안전한 보관(이)가 아니라면 어떻게 생각하십니까?',
        ]);
    });
});

describe('Kano Google Forms script 소개문', () => {
    const introduction = {
        technology: '연료전지', productType: '발전', companyName: '(주)테스트', representativeName: '홍길동', offering: '가정용 발전기',
    };

    it('저장된 소개문을 설문지 설명 맨 위에 오프라인 설문지와 같은 문구로 넣는다', () => {
        const { description } = runGeneratedScript(buildKanoGoogleFormScript([{ requirement: '빠른 주문' }], '프로젝트', introduction));
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
        const { description } = runGeneratedScript(buildKanoGoogleFormScript([{ requirement: '빠른 주문' }], '프로젝트', introduction));

        expect(html).toContain(escapeHtml(description.split('\n\n')[0]));
    });

    it('소개문을 저장하지 않았으면 빈칸이 있는 기본 소개문을 넣는다', () => {
        const { description } = runGeneratedScript(buildKanoGoogleFormScript([{ requirement: '빠른 주문' }], '프로젝트'));

        expect(description.startsWith(buildKanoSurveyIntroduction())).toBe(true);
        expect(description).toContain('안녕하세요.');
    });

    it('소개문에 따옴표·줄바꿈·스크립트 조각이 있어도 문자열로만 들어간다', () => {
        // 생성된 파일은 사용자의 Google 계정에서 실행된다. 입력값이 코드로 해석되면 안 된다.
        const hostile = { ...introduction, companyName: `'); FormApp.hacked(); ('`, offering: '줄\n바꿈 "따옴표" \\ </script>' };
        const created = runGeneratedScript(buildKanoGoogleFormScript([{ requirement: '빠른 주문' }], '프로젝트', hostile));

        expect(created.injectedCodeRan).toBe(false);
        expect(created.description.startsWith(buildKanoSurveyIntroduction(hostile))).toBe(true);
    });
});

describe('Kano Google Forms 응답 시트 업로드 호환', () => {
    it('질문 문장 제목이 응답 시트 머리글이 되어도 요구사항을 찾는다', () => {
        // 제목에서 요구사항 id 를 뺐으므로 업로드는 머리글의 질문 문장으로만 요구사항을 찾는다.
        const requirements = [
            { id: 'r-a', requirement: '빠른 주문', kanoPositiveQ: '빠르게 주문된다면?', kanoNegativeQ: '빠르게 주문되지 않는다면?' },
            { id: 'r-b', requirement: '안전한 보관' },
        ];
        const titles = runGeneratedScript(buildKanoGoogleFormScript(requirements, '프로젝트')).items.map(item => item.title ?? '');
        const sheet = XLSX.utils.aoa_to_sheet([
            ['타임스탬프', '이메일 주소', ...titles],
            ['2026', 'a@b.c', '마음에 든다', '당연하다', '하는수 없다', '마음에 안든다'],
        ]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, '설문지 응답 시트1');

        expect(titles.some(title => title.includes('{id:'))).toBe(false);
        expect(readKanoExcelRequirementIds(workbook, sheet, requirements)).toEqual(['r-a', 'r-b']);
    });
});
