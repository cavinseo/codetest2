# WS-6 설문지 Word 출력 Implementation Plan

> **For agentic workers:** 이 계획서가 각 Task 의 정본이다. Step 은 체크박스(`- [ ]`)로 추적하고, 완료 시 `- [x]` 로 갱신해 코드와 함께 커밋한다.

> **완결(2026-09-04)**: Task 1~4 전부 구현·게이트(tsc·vitest·lint)·stryker 100%·실기동 검증 완료. 판정 근거는 `docs/superpowers/reports/2026-09-03-kano-survey-docx/` 의 보고서 4건과 각 Step 의 감리 기록에 있다.

**Goal:** WS-6 「설문 질문 구성」에 저장된 긍정·부정 질문을 종이 설문지 양식(첨부 PDF 「고객니즈조사 설문지」)에 맞춘 Word(.docx) 파일로 내려받을 수 있게 한다. 온라인 설문(Google Forms·초대 링크)을 쓰기 어려운 현장 조사에서 인쇄해 돌리기 위한 것이다.

**Architecture:** 문서를 두 층으로 나눈다. **모델**(`lib/kano-survey-document.ts`)은 제목·안내문·응답 척도·행 목록·맺음말을 순수 데이터로 만들고, **렌더러**(`lib/kano-survey-docx.ts`)는 그 데이터를 `docx` 라이브러리로 .docx 바이너리로 바꾼다. 양식의 문구와 행 번호 규칙은 전부 모델에 있어 실DB 없이 테스트하고 뮤테이션으로 고정한다. 렌더러는 얇게 두고 스모크 테스트만 한다. API 는 기존 `invite-template` 라우트와 같은 모양의 GET 내려받기이고, 화면은 「질문 저장」 옆에 버튼 하나를 더한다.

**Tech Stack:** Next.js 15 App Router, Prisma 6, `docx`(신규 의존성), vitest (Prisma 전부 mock), Stryker

**Spec:** 이 문서의 "설계 요약" 절이 스펙을 겸한다. 양식의 원문은 아래 "양식 원문" 절에 옮겨 적었다.

## Global Constraints

- **원격 DB 절대 금지**: `.env` 의 `POSTGRES_PRISMA_URL` 은 실데이터가 있는 원격 Supabase 다. `prisma migrate deploy`/`db push`/`studio`, DB 에 쓰는 스크립트, dev 서버 기동 전부 금지. 이 계획은 스키마를 바꾸지 않는다.
- **이메일·비밀번호를 로그와 응답 본문에 남기지 않는다**(`lib/logger.ts` 규칙). 이 계획은 개인정보를 다루지 않지만, 설문지에 응답자 정보를 넣지 않는다는 점은 지킨다.
- 들여쓰기 4칸, 주석은 한국어 "~다" 체이며 무엇이 아니라 **왜**를 적는다.
- 테스트는 `tests/` 평면 배치, Prisma 는 `vi.mock('../lib/prisma', ...)` 로 전부 mock.
- 커밋 메시지는 한국어, 본문에 "왜"를 적는다. 트레일러 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 각 Task 완료 기준: `npx tsc --noEmit` 통과 + `npx vitest run` 전체 통과 + `npx next lint` 통과.
- **뮤테이션**: 신규 순수 모듈 `lib/kano-survey-document.ts` 는 `stryker.crap.config.json` 의 `mutate` 목록에 올리고 100% 를 기준으로 삼는다. 등가 뮤턴트는 이유를 적은 `// Stryker disable next-line` 으로만 제외한다.
- **의존성 설치는 사용자가 한다.** 원격 세션은 npm 레지스트리가 막혀 `npm install` 을 할 수 없다. Task 1 은 `package.json` 에 의존성을 적는 데서 멈추고, 사용자가 로컬에서 설치해 `package-lock.json` 을 커밋한다.

## 설계 요약 (모든 Task 의 공통 문맥)

### 양식의 구조

첨부 PDF 「고객니즈조사 설문지」(HWP 출력본, 2쪽)의 구조다.

| 부분 | 내용 |
| --- | --- |
| 제목 | 고객니즈조사 설문지 |
| Kano 안내문 | 긍정·부정 질문이 짝으로 있으니 둘 다 표시하라는 설명 |
| 제품/서비스 소개 | 「　」 빈칸이 있는 인사말 문단. 회사가 배포 전에 채운다 |
| 응답 표 | 열: 질문 문항 / 마음에 든다 / 당연하다 / 느낌이 없다 / 하는수 없다 / 마음에 안든다. 행: `1-1`, `1-2`, `2-1`, … (N-1 긍정, N-2 부정). 응답 칸은 빈칸 |
| 맺음말 | 응답 감사 인사 |

표 머리글은 2쪽에서 반복된다. 양식은 16개 질문 세트(32행)를 담고 있으나 우리는 프로젝트의 요구사항 수만큼 만든다.

### 결정 사항

계획을 세우며 정한 것이다. 바꾸려면 Task 1 착수 전에 알려야 한다.

| # | 항목 | 결정 | 이유 |
| --- | --- | --- | --- |
| 1 | 문서 생성 방식 | **`docx` 라이브러리 추가** | 진짜 .docx 를 만든다. HTML 을 `.doc` 로 내주는 무의존 방식은 Word 가 호환 모드로 열고 한글(HWP)에서 표가 깨질 수 있다. ZIP+XML 을 손으로 쓰는 방식은 의존성은 없지만 유지할 코드가 더 많다 |
| 2 | 안내문의 「　」 빈칸 | **양식 그대로 빈칸** | "양식에 맞춰" 가 요구다. 프로젝트명·기업명을 자동으로 채우면 편하지만 틀린 값이 인쇄물에 박힐 수 있다. 자동 채움은 후속 과제 |
| 3 | 응답 척도 문구 | **앱의 `getKanoAnswerLabel` 재사용** | 양식은 "느낌이 없다", 앱은 "아무런느낌이 없다" 로 한 항목만 다르다. 종이 응답을 엑셀 업로드 양식(`lib/kano-upload-template.ts`)으로 옮겨 넣을 때 두 문구가 같아야 헷갈리지 않는다. 문구의 정본은 한 곳이어야 한다 |
| 4 | 질문 기본 문구 | **화면(KanoManager)과 같은 기본값** | 저장하지 않은 요구사항도 화면에는 기본 질문이 보인다. 인쇄물이 화면과 달라지면 안 되므로 같은 규칙으로 채운다. 그 규칙을 모델로 옮기고 화면이 그것을 쓰게 해 정본을 하나로 만든다 |
| 5 | 응답 칸 | **빈칸** | 양식이 빈칸이다. `☐` 를 넣지 않는다 |
| 6 | 양식의 오타 | **고친다** | 소개 문단의 "좀 더 나은 더 나은 서비스" 는 "좀 더 나은 서비스" 로 옮긴다 |

### 파일 지도

- Task 1: `package.json`(의존성), `lib/kano-survey-document.ts`(신규·순수), `tests/kano-survey-document.test.ts`(신규), `stryker.crap.config.json`
- Task 2: `lib/kano-survey-docx.ts`(신규), `tests/kano-survey-docx.test.ts`(신규)
- Task 3: `app/api/projects/[id]/kano/survey-document/route.ts`(신규), `tests/api-kano-survey-document.test.ts`(신규)
- Task 4: `components/project/KanoManager.tsx`

### 양식 원문

PDF 에서 옮겨 적었다. 모델의 문자열 정본이며 테스트가 이 원문을 그대로 단언한다.

```
제목: 고객니즈조사 설문지

안내문:
본 설문은 고객의 정확한 의견을 도출하기 위해 Kano 방식으로 작성되어 같은 내용의 질문을
긍정과 부정으로 작성되어 있습니다. 각 항목을 읽고 긍정과 부정의 질문 모두 해당되는 항목에
표시하여 주시기 바랍니다.

소개:
(제품/서비스 소개) 안녕하세요. 「　　　　　　　」 기술을 활용하여 다양한 「　　　　」제품을
개발하고 있는 「　　　　」 대표 「　　　　」입니다. 본 설문은 자사에서 제공하는 「　　　　」에
대하여, 소비자의 의견을 수렴하여 좀 더 나은 서비스를 만드는데 필요한 기초 자료를 얻는 것에
목적이 있습니다. 귀하께서 응답하시는 내용은 정답이 없으며, 오직 제품 레벨 업을 위한 용도로만
사용할 것을 약속드립니다. 바쁘신 가운데 시간을 내어 주셔서 대단히 감사합니다.
/(필요시 이미지 자료 첨부가능)

표 머리글: 질 문 문 항 | 마음에 든다 | 당연하다 | 느낌이 없다 | 하는수 없다 | 마음에 안든다
행 번호: 1-1, 1-2, 2-1, 2-2, …

맺음말:
긴 시간 질문에 성심껏 응답해 주셔서 감사합니다. 귀하의 의견을 참고하여 좋은 자료로 활용 하겠습니다.
```

---

### Task 1: 설문지 문서 모델(순수)과 `docx` 의존성

**Files:**
- Modify: `package.json` (`dependencies` 에 `docx`)
- Create: `lib/kano-survey-document.ts`
- Create: `tests/kano-survey-document.test.ts`
- Modify: `stryker.crap.config.json` (`mutate` 목록)

**Interfaces:**
- Produces: `buildKanoSurveyDocumentModel(requirements)` → `KanoSurveyDocumentModel`, `resolveKanoQuestionPair(requirement)`, `kanoSurveyFileName(projectName)`. Task 2 의 렌더러와 Task 3 의 라우트, Task 4 의 화면이 쓴다.

- [x] **Step 1: `package.json` 에 의존성을 적는다**

`dependencies` 에 알파벳 순서로 넣는다.

```json
        "docx": "^9.5.0",
```

원격 세션은 설치할 수 없다. **사용자가 로컬에서 `npm install` 을 실행하고 `package-lock.json` 을 이 Task 의 커밋에 포함한다.** 설치 뒤 `node_modules/docx/package.json` 의 실제 버전을 확인해 위 범위와 맞는지 본다.

- [x] **Step 2: 순수 모델 `lib/kano-survey-document.ts` 를 만든다**

```ts
// WS-6 종이 설문지(「고객니즈조사 설문지」 양식)의 내용을 순수 데이터로 만든다.
//
// 문구·행 번호 규칙·파일명은 전부 여기에 있고 .docx 로 바꾸는 일은 kano-survey-docx.ts 가
// 한다. 양식이 바뀌면 이 파일만 고치면 되고, 실DB 도 Word 도 없이 테스트할 수 있다.
import { getKanoTopic } from './utils/korean-utils';
import { getKanoAnswerLabel } from './kano-response-display';

export interface KanoSurveyRequirement {
    requirement: string;
    kanoPositiveQ?: string | null;
    kanoNegativeQ?: string | null;
}

export interface KanoSurveyRow {
    /** 양식의 행 번호. N-1 이 긍정, N-2 가 부정이다. */
    no: string;
    text: string;
}

export interface KanoSurveyDocumentModel {
    title: string;
    guide: string;
    introduction: string;
    /** 표 첫 열 머리글. */
    questionHeader: string;
    /** 응답 척도 5개. 점수 1~5 순서다. */
    answerLabels: string[];
    rows: KanoSurveyRow[];
    closing: string;
}

export const KANO_SURVEY_TITLE = '고객니즈조사 설문지';

export const KANO_SURVEY_GUIDE =
    '본 설문은 고객의 정확한 의견을 도출하기 위해 Kano 방식으로 작성되어 같은 내용의 질문을 '
    + '긍정과 부정으로 작성되어 있습니다. 각 항목을 읽고 긍정과 부정의 질문 모두 해당되는 항목에 '
    + '표시하여 주시기 바랍니다.';

// 「　」 는 회사가 배포 전에 손으로 채우는 빈칸이다. 프로젝트명 등을 자동으로 넣지 않는다 —
// 틀린 값이 인쇄물에 박히는 것보다 빈칸이 낫다.
export const KANO_SURVEY_INTRODUCTION =
    '(제품/서비스 소개) 안녕하세요. 「　　　　　　　」 기술을 활용하여 다양한 「　　　　」제품을 '
    + '개발하고 있는 「　　　　」 대표 「　　　　」입니다. 본 설문은 자사에서 제공하는 「　　　　」에 '
    + '대하여, 소비자의 의견을 수렴하여 좀 더 나은 서비스를 만드는데 필요한 기초 자료를 얻는 것에 '
    + '목적이 있습니다. 귀하께서 응답하시는 내용은 정답이 없으며, 오직 제품 레벨 업을 위한 용도로만 '
    + '사용할 것을 약속드립니다. 바쁘신 가운데 시간을 내어 주셔서 대단히 감사합니다. '
    + '/(필요시 이미지 자료 첨부가능)';

export const KANO_SURVEY_QUESTION_HEADER = '질 문 문 항';

export const KANO_SURVEY_CLOSING =
    '긴 시간 질문에 성심껏 응답해 주셔서 감사합니다. 귀하의 의견을 참고하여 좋은 자료로 활용 하겠습니다.';

/** 응답 척도. 앱의 문구를 그대로 써야 종이 응답을 엑셀 업로드 양식에 옮길 때 헷갈리지 않는다. */
export function kanoSurveyAnswerLabels(): string[] {
    return [1, 2, 3, 4, 5].map((score) => getKanoAnswerLabel(score));
}

/**
 * 저장된 질문이 없으면 화면(KanoManager)이 보여 주는 것과 같은 기본 문구를 만든다.
 * 인쇄물이 화면과 달라지면 안 되므로 규칙은 여기 한 곳에만 둔다.
 */
export function resolveKanoQuestionPair(requirement: KanoSurveyRequirement): { positive: string; negative: string } {
    const topic = getKanoTopic(requirement.requirement);
    return {
        positive: requirement.kanoPositiveQ?.trim() || `${topic}(이)라면 어떻게 생각하십니까?`,
        negative: requirement.kanoNegativeQ?.trim() || `${topic}(이)가 아니라면 어떻게 생각하십니까?`,
    };
}

export function buildKanoSurveyDocumentModel(requirements: KanoSurveyRequirement[]): KanoSurveyDocumentModel {
    const rows: KanoSurveyRow[] = [];
    requirements.forEach((requirement, index) => {
        const pair = resolveKanoQuestionPair(requirement);
        const n = index + 1;
        rows.push({ no: `${n}-1`, text: pair.positive });
        rows.push({ no: `${n}-2`, text: pair.negative });
    });

    return {
        title: KANO_SURVEY_TITLE,
        guide: KANO_SURVEY_GUIDE,
        introduction: KANO_SURVEY_INTRODUCTION,
        questionHeader: KANO_SURVEY_QUESTION_HEADER,
        answerLabels: kanoSurveyAnswerLabels(),
        rows,
        closing: KANO_SURVEY_CLOSING,
    };
}

const FILE_NAME_MAX = 60;

/**
 * 내려받을 파일명. 프로젝트명에 경로 구분자나 제어 문자가 있으면 브라우저가 파일명을
 * 자르거나 거부하므로 밑줄로 바꾼다. 비어 있으면 기본 이름을 쓴다.
 */
export function kanoSurveyFileName(projectName: string | null | undefined): string {
    const cleaned = (projectName ?? '')
        .replace(/[\\/:*?"<>| -]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, FILE_NAME_MAX);
    return `Kano_설문지_${cleaned || '프로젝트'}.docx`;
}
```

- [x] **Step 3: `tests/kano-survey-document.test.ts` 를 쓴다**

```ts
// 종이 설문지 모델이 양식의 문구와 행 번호 규칙을 그대로 지키는지 확인하는 테스트입니다.
import { describe, expect, it } from 'vitest';
import {
    KANO_SURVEY_CLOSING,
    KANO_SURVEY_GUIDE,
    KANO_SURVEY_INTRODUCTION,
    KANO_SURVEY_QUESTION_HEADER,
    KANO_SURVEY_TITLE,
    buildKanoSurveyDocumentModel,
    kanoSurveyAnswerLabels,
    kanoSurveyFileName,
    resolveKanoQuestionPair,
} from '../lib/kano-survey-document';
import { getKanoAnswerLabel } from '../lib/kano-response-display';

describe('resolveKanoQuestionPair', () => {
    it('저장된 질문이 있으면 그대로 쓴다', () => {
        const pair = resolveKanoQuestionPair({
            requirement: '오경보를 억제해야 한다',
            kanoPositiveQ: '오경보 억제 기능을 제공한다면 어떻게 생각하십니까?',
            kanoNegativeQ: '오경보 억제 기능을 제공하지 않는다면 어떻게 생각하십니까?',
        });
        expect(pair.positive).toBe('오경보 억제 기능을 제공한다면 어떻게 생각하십니까?');
        expect(pair.negative).toBe('오경보 억제 기능을 제공하지 않는다면 어떻게 생각하십니까?');
    });

    it('저장된 질문이 없으면 화면과 같은 기본 문구를 만든다', () => {
        // KanoManager 가 보여 주는 기본값과 같아야 인쇄물이 화면과 어긋나지 않는다.
        const pair = resolveKanoQuestionPair({ requirement: '오경보를 억제해야 한다' });
        expect(pair.positive).toMatch(/\(이\)라면 어떻게 생각하십니까\?$/);
        expect(pair.negative).toMatch(/\(이\)가 아니라면 어떻게 생각하십니까\?$/);
        expect(pair.positive).not.toBe(pair.negative);
    });

    it('공백뿐인 저장값은 없는 것으로 본다', () => {
        const pair = resolveKanoQuestionPair({ requirement: '오경보를 억제해야 한다', kanoPositiveQ: '   ' });
        expect(pair.positive).toMatch(/라면 어떻게 생각하십니까\?$/);
    });

    it('저장값 앞뒤 공백은 잘라 낸다', () => {
        const pair = resolveKanoQuestionPair({ requirement: 'x', kanoPositiveQ: '  질문  ', kanoNegativeQ: ' 부정 ' });
        expect(pair.positive).toBe('질문');
        expect(pair.negative).toBe('부정');
    });
});

describe('buildKanoSurveyDocumentModel', () => {
    const REQS = [
        { requirement: '가', kanoPositiveQ: '가-긍정', kanoNegativeQ: '가-부정' },
        { requirement: '나', kanoPositiveQ: '나-긍정', kanoNegativeQ: '나-부정' },
    ];

    it('양식의 고정 문구를 그대로 담는다', () => {
        const model = buildKanoSurveyDocumentModel(REQS);
        expect(model.title).toBe('고객니즈조사 설문지');
        expect(model.guide).toBe(KANO_SURVEY_GUIDE);
        expect(model.introduction).toBe(KANO_SURVEY_INTRODUCTION);
        expect(model.questionHeader).toBe('질 문 문 항');
        expect(model.closing).toBe(KANO_SURVEY_CLOSING);
    });

    it('고정 문구가 양식 원문과 같다', () => {
        // 문구가 바뀌면 양식과 어긋나는 것이므로 원문을 그대로 단언한다.
        expect(KANO_SURVEY_TITLE).toBe('고객니즈조사 설문지');
        expect(KANO_SURVEY_GUIDE).toContain('Kano 방식으로 작성되어');
        expect(KANO_SURVEY_GUIDE).toContain('긍정과 부정의 질문 모두 해당되는 항목에 표시');
        expect(KANO_SURVEY_INTRODUCTION.startsWith('(제품/서비스 소개) 안녕하세요.')).toBe(true);
        expect(KANO_SURVEY_INTRODUCTION).toContain('「　　　　　　　」 기술을 활용하여');
        expect(KANO_SURVEY_INTRODUCTION).toContain('좀 더 나은 서비스를 만드는데');
        expect(KANO_SURVEY_INTRODUCTION).not.toContain('나은 더 나은');
        expect(KANO_SURVEY_INTRODUCTION.endsWith('/(필요시 이미지 자료 첨부가능)')).toBe(true);
        expect(KANO_SURVEY_QUESTION_HEADER).toBe('질 문 문 항');
        expect(KANO_SURVEY_CLOSING).toBe(
            '긴 시간 질문에 성심껏 응답해 주셔서 감사합니다. 귀하의 의견을 참고하여 좋은 자료로 활용 하겠습니다.'
        );
    });

    it('응답 척도는 앱의 라벨 5개를 점수 순서로 쓴다', () => {
        expect(kanoSurveyAnswerLabels()).toEqual([1, 2, 3, 4, 5].map((s) => getKanoAnswerLabel(s)));
        expect(kanoSurveyAnswerLabels()).toEqual(['마음에 든다', '당연하다', '아무런느낌이 없다', '하는수 없다', '마음에 안든다']);
        expect(buildKanoSurveyDocumentModel([]).answerLabels).toEqual(kanoSurveyAnswerLabels());
    });

    it('요구사항마다 N-1(긍정)·N-2(부정) 두 행을 순서대로 만든다', () => {
        const model = buildKanoSurveyDocumentModel(REQS);
        expect(model.rows).toEqual([
            { no: '1-1', text: '가-긍정' },
            { no: '1-2', text: '가-부정' },
            { no: '2-1', text: '나-긍정' },
            { no: '2-2', text: '나-부정' },
        ]);
    });

    it('요구사항이 없으면 행이 없다', () => {
        expect(buildKanoSurveyDocumentModel([]).rows).toEqual([]);
    });

    it('저장되지 않은 요구사항은 기본 문구로 채운다', () => {
        const model = buildKanoSurveyDocumentModel([{ requirement: '오경보를 억제해야 한다' }]);
        expect(model.rows[0].text).toMatch(/라면 어떻게 생각하십니까\?$/);
        expect(model.rows[1].text).toMatch(/아니라면 어떻게 생각하십니까\?$/);
    });
});

describe('kanoSurveyFileName', () => {
    it('프로젝트명을 붙인 .docx 이름을 만든다', () => {
        expect(kanoSurveyFileName('스마트팜')).toBe('Kano_설문지_스마트팜.docx');
    });

    it('경로 구분자와 제어 문자는 밑줄로 바꾼다', () => {
        expect(kanoSurveyFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('Kano_설문지_a_b_c_d_e_f_g_h_i_j.docx');
        expect(kanoSurveyFileName('줄\n바꿈')).toBe('Kano_설문지_줄_바꿈.docx');
    });

    it('연속 공백은 하나로 줄이고 앞뒤 공백은 잘라 낸다', () => {
        expect(kanoSurveyFileName('  스마트   팜  ')).toBe('Kano_설문지_스마트 팜.docx');
    });

    it('비어 있거나 없으면 기본 이름을 쓴다', () => {
        expect(kanoSurveyFileName('')).toBe('Kano_설문지_프로젝트.docx');
        expect(kanoSurveyFileName('   ')).toBe('Kano_설문지_프로젝트.docx');
        expect(kanoSurveyFileName(null)).toBe('Kano_설문지_프로젝트.docx');
        expect(kanoSurveyFileName(undefined)).toBe('Kano_설문지_프로젝트.docx');
    });

    it('너무 긴 이름은 60자에서 자른다', () => {
        const long = '가'.repeat(80);
        expect(kanoSurveyFileName(long)).toBe(`Kano_설문지_${'가'.repeat(60)}.docx`);
    });
});
```

- [x] **Step 4: stryker `mutate` 목록에 올린다**

`stryker.crap.config.json` 의 `mutate` 배열 끝에 `"lib/kano-survey-document.ts"` 를 더한다.

- [x] **Step 5: 검증하고 커밋한다**

> 감리 기록(2026-09-03): lock 커밋 `447e6af`(docx 9.7.1). 픽스처 결함(`e4c83f2`) 수정 뒤 로컬 게이트 재실행: vitest **98파일/1129테스트 통과**, `next lint` 통과(경고 1건은 이 파일의 unused `eslint-disable`, 감리자가 제거) — 스크린샷으로 확인. **stryker 점수(`lib/kano-survey-document.ts`, 기준 100%)는 아직 미보고**라 Step 5 를 닫지 않는다. 대체 검증 결과는 `docs/superpowers/reports/2026-09-03-kano-survey-docx/task-1.md` 에 있다. **stryker 1차(2026-09-04): 94.34%, survived 3** — 전부 `KANO_SURVEY_INTRODUCTION` 의 이어 붙인 조각(43·45·46행)을 "" 로 바꾼 StringLiteral 뮤턴트로, 테스트가 소개문을 부분 문자열로만 검사해 contains 에 안 걸린 조각이 살아남았다. 등가 뮤턴트가 아니므로 disable 이 아니라 테스트를 전문 일치로 보강했고, 감리자가 세 뮤턴트를 각각 시뮬레이션해 보강 테스트가 죽이는 것을 역검증했다. 사용자 재실행에서 100% 가 나오면 이 Step 을 닫는다. **재실행(2026-09-04, 사용자 보고): 100% — Step 을 닫는다.** 게이트 3종·vitest 98파일·전문 일치 보강 테스트까지 전부 그린.

```sh
npm install
npx tsc --noEmit && npx vitest run && npx next lint
npx stryker run stryker.crap.config.json --mutate lib/kano-survey-document.ts
```

`package-lock.json` 을 함께 커밋한다. 뮤테이션은 100% 여야 한다. `getKanoTopic` 은 이 모듈 밖이라 뮤테이션 대상이 아니다.

---

### Task 2: `.docx` 렌더러

**Files:**
- Create: `lib/kano-survey-docx.ts`
- Create: `tests/kano-survey-docx.test.ts`

**Interfaces:**
- Consumes: `KanoSurveyDocumentModel`.
- Produces: `renderKanoSurveyDocx(model): Promise<Buffer>`. Task 3 의 라우트가 쓴다.

- [x] **Step 1: 렌더러를 만든다**

`docx` 의 API 이름은 설치된 버전의 타입으로 확인한다(`node_modules/docx/build/index.d.ts`). 아래는 v9 기준이다.

```ts
// 설문지 모델을 Word(.docx)로 그린다. 문구와 행 규칙은 kano-survey-document.ts 에 있고
// 여기서는 배치와 서식만 정한다 — 그래서 이 파일은 스모크 테스트만 한다.
import {
    AlignmentType, Document, HeadingLevel, Packer, PageOrientation, Paragraph,
    Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType, convertMillimetersToTwip,
} from 'docx';
import type { KanoSurveyDocumentModel } from './kano-survey-document';

// A4 세로. 양식이 그렇다.
const PAGE = {
    size: { orientation: PageOrientation.PORTRAIT, width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
    margin: {
        top: convertMillimetersToTwip(20), bottom: convertMillimetersToTwip(20),
        left: convertMillimetersToTwip(20), right: convertMillimetersToTwip(20),
    },
};

// 열 너비(%). 질문 열이 넓고 응답 칸 5개가 같은 폭이다.
const COLUMN_WIDTHS = [8, 52, 8, 8, 8, 8, 8];

function cell(text: string, options: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width: number } ) {
    return new TableCell({
        width: { size: options.width, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
            alignment: options.align ?? AlignmentType.LEFT,
            children: [new TextRun({ text, bold: options.bold })],
        })],
    });
}

function headerRow(model: KanoSurveyDocumentModel): TableRow {
    return new TableRow({
        // 2쪽으로 넘어가면 머리글을 다시 찍는다. 양식도 그렇다.
        tableHeader: true,
        children: [
            new TableCell({
                columnSpan: 2,
                width: { size: COLUMN_WIDTHS[0] + COLUMN_WIDTHS[1], type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: model.questionHeader, bold: true })] })],
            }),
            ...model.answerLabels.map((label, i) => cell(label, { bold: true, align: AlignmentType.CENTER, width: COLUMN_WIDTHS[i + 2] })),
        ],
    });
}

function questionRow(no: string, text: string, answerCount: number): TableRow {
    return new TableRow({
        children: [
            cell(no, { align: AlignmentType.CENTER, width: COLUMN_WIDTHS[0] }),
            cell(text, { width: COLUMN_WIDTHS[1] }),
            // 응답 칸은 빈칸이다. 양식이 그렇다.
            ...Array.from({ length: answerCount }, (_, i) => cell('', { width: COLUMN_WIDTHS[i + 2] })),
        ],
    });
}

export async function renderKanoSurveyDocx(model: KanoSurveyDocumentModel): Promise<Buffer> {
    const doc = new Document({
        styles: { default: { document: { run: { font: '맑은 고딕', size: 20 } } } },
        sections: [{
            properties: { page: PAGE },
            children: [
                new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: model.title, bold: true })] }),
                new Paragraph({ spacing: { before: 200, after: 200 }, children: [new TextRun(model.guide)] }),
                new Paragraph({ spacing: { after: 300 }, children: [new TextRun(model.introduction)] }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [headerRow(model), ...model.rows.map((row) => questionRow(row.no, row.text, model.answerLabels.length))],
                }),
                new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER, children: [new TextRun(model.closing)] }),
            ],
        }],
    });
    return Packer.toBuffer(doc);
}
```

- [x] **Step 2: 스모크 테스트를 쓴다**

.docx 는 ZIP 이라 내용을 열어 보려면 ZIP 판독기가 더 필요하다. 문구와 행은 Task 1 이 고정하므로 여기서는 **파일이 만들어지는가**만 본다.

```ts
// 렌더러가 유효한 .docx(ZIP) 바이너리를 내는지 확인하는 스모크 테스트입니다.
// 문구와 행 규칙은 kano-survey-document.test.ts 가 고정한다.
import { describe, expect, it } from 'vitest';
import { buildKanoSurveyDocumentModel } from '../lib/kano-survey-document';
import { renderKanoSurveyDocx } from '../lib/kano-survey-docx';

describe('renderKanoSurveyDocx', () => {
    it('ZIP 서명으로 시작하는 바이너리를 만든다', async () => {
        const buffer = await renderKanoSurveyDocx(buildKanoSurveyDocumentModel([
            { requirement: '가', kanoPositiveQ: '가-긍정', kanoNegativeQ: '가-부정' },
        ]));
        expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
        expect(buffer.length).toBeGreaterThan(1000);
    });

    it('요구사항이 없어도 만들어진다', async () => {
        const buffer = await renderKanoSurveyDocx(buildKanoSurveyDocumentModel([]));
        expect(buffer.subarray(0, 2).toString()).toBe('PK');
    });

    it('요구사항이 많아도 만들어진다', async () => {
        const many = Array.from({ length: 40 }, (_, i) => ({ requirement: `요구 ${i + 1}` }));
        const buffer = await renderKanoSurveyDocx(buildKanoSurveyDocumentModel(many));
        expect(buffer.subarray(0, 2).toString()).toBe('PK');
    });
});
```

- [x] **Step 3: 검증하고 커밋한다**

> 게이트 기록(2026-09-03 감리): 사용자 로컬 vitest **98파일/1129테스트 통과**, `next lint` 통과(경고 1건 — `lib/kano-survey-document.ts` 의 unused `eslint-disable` 지시어, 감리자가 제거). 스크린샷으로 확인.

```sh
npx tsc --noEmit && npx vitest run && npx next lint
```

`tsc` 가 `docx` 의 API 이름에서 실패하면 설치된 버전의 `index.d.ts` 를 보고 맞춘다. 이 파일은 순수 모듈이 아니므로 뮤테이션 대상이 아니다.

---

### Task 3: 내려받기 API

**Files:**
- Create: `app/api/projects/[id]/kano/survey-document/route.ts`
- Create: `tests/api-kano-survey-document.test.ts`

**Interfaces:**
- Produces: `GET /api/projects/{id}/kano/survey-document` → `.docx` 첨부 파일. 읽기 권한이면 된다(`requireProjectAccess` 기본).

- [x] **Step 1: 라우트를 만든다**

`app/api/projects/[id]/kano/invite-template/route.ts` 와 같은 모양이다.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { buildKanoSurveyDocumentModel, kanoSurveyFileName } from '@/lib/kano-survey-document';
import { renderKanoSurveyDocx } from '@/lib/kano-survey-docx';

const log = createLogger('api/kano-survey-document');

// 종이 설문지(.docx)를 내려준다. 온라인 설문을 쓰기 어려운 현장 조사용이다.
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId);
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true },
        });
        if (!project) {
            return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
        }

        // 화면의 「설문 질문 구성」과 같은 순서다. 저장하지 않은 편집은 여기 없다.
        const requirements = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
            select: { requirement: true, kanoPositiveQ: true, kanoNegativeQ: true },
        });

        const buffer = await renderKanoSurveyDocx(buildKanoSurveyDocumentModel(requirements));
        const fileName = encodeURIComponent(kanoSurveyFileName(project.name));

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        log.error('Kano 설문지 문서 생성 실패', error, { projectId });
        return NextResponse.json({ error: '설문지 문서 생성에 실패했습니다.' }, { status: 500 });
    }
}
```

- [x] **Step 2: 라우트 테스트를 쓴다**

```ts
// 설문지 내려받기 라우트가 권한을 확인하고 올바른 첨부 응답을 내는지 확인하는 테스트입니다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const findProject = vi.fn();
const findManyRequirement = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        project: { findUnique: findProject },
        customerRequirement: { findMany: findManyRequirement },
    },
}));

const requireProjectAccess = vi.fn();
vi.mock('../lib/authorization', () => ({
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...(args as [])),
}));

const { GET } = await import('../app/api/projects/[id]/kano/survey-document/route');

const USER = { userId: 'user_1', email: 'owner@x.com', name: '소유자' };

function call(projectId = 'proj_1') {
    const request = new NextRequest(`http://localhost/api/projects/${projectId}/kano/survey-document`);
    return GET(request, { params: Promise.resolve({ id: projectId }) });
}

beforeEach(() => {
    requireProjectAccess.mockResolvedValue({ user: USER, role: 'OWNER' });
    findProject.mockResolvedValue({ name: '스마트팜' });
    findManyRequirement.mockResolvedValue([
        { requirement: '가', kanoPositiveQ: '가-긍정', kanoNegativeQ: '가-부정' },
    ]);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/projects/[id]/kano/survey-document', () => {
    it('.docx 첨부 파일로 내려준다', async () => {
        const res = await call();
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe(
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        expect(res.headers.get('Content-Disposition')).toBe(
            `attachment; filename*=UTF-8''${encodeURIComponent('Kano_설문지_스마트팜.docx')}`
        );
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        const bytes = new Uint8Array(await res.arrayBuffer());
        expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe('PK');
    });

    it('요구사항을 화면과 같은 순서로 읽는다', async () => {
        await call();
        expect(findManyRequirement).toHaveBeenCalledWith(expect.objectContaining({
            where: { projectId: 'proj_1' },
            orderBy: { order: 'asc' },
        }));
    });

    it('프로젝트가 없으면 404 다', async () => {
        findProject.mockResolvedValue(null);
        const res = await call();
        expect(res.status).toBe(404);
    });

    it('권한이 없으면 접근 판정 결과를 그대로 돌려준다', async () => {
        requireProjectAccess.mockResolvedValue(NextResponse.json({ error: 'denied' }, { status: 403 }));
        const res = await call();
        expect(res.status).toBe(403);
        expect(findProject).not.toHaveBeenCalled();
    });

    it('문서 생성이 실패하면 500 이고 원인을 응답에 담지 않는다', async () => {
        findManyRequirement.mockRejectedValue(new Error('db down'));
        const res = await call();
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.error).toBe('설문지 문서 생성에 실패했습니다.');
        expect(JSON.stringify(body)).not.toContain('db down');
    });
});
```

- [x] **Step 3: 검증하고 커밋한다**

> 게이트 기록(2026-09-03 감리): 사용자 로컬 vitest **98파일/1129테스트 통과**, `next lint` 통과(경고 1건 — `lib/kano-survey-document.ts` 의 unused `eslint-disable` 지시어, 감리자가 제거). 스크린샷으로 확인.

```sh
npx tsc --noEmit && npx vitest run && npx next lint
```

---

### Task 4: 화면 버튼과 기본 문구 정본 통일

**Files:**
- Modify: `components/project/KanoManager.tsx`

**Interfaces:**
- Consumes: Task 3 의 라우트, Task 1 의 `resolveKanoQuestionPair`.

- [x] **Step 1: 기본 질문 문구를 모델의 것으로 바꾼다**

`KanoManager.tsx` 148~149행의 인라인 템플릿을 `resolveKanoQuestionPair` 로 바꾼다. 화면과 인쇄물의 정본을 하나로 만드는 것이 목적이다.

```tsx
import { resolveKanoQuestionPair } from '@/lib/kano-survey-document';
```

```tsx
                for (const r of reqs) {
                    qMap[r.id] = resolveKanoQuestionPair(r);
                }
```

`getKanoTopic` 은 설문 주제 표시(910행 부근)에 여전히 쓰이므로 import 를 지우지 않는다. 그 사용이 없어졌다면 지운다.

- [x] **Step 2: 내려받기 버튼을 더한다**

「질문 저장」 버튼 왼쪽에 둔다. 저장된 값이 나가므로 저장 중에는 잠근다.

```tsx
                                <div className="flex items-center gap-2">
                                    <a
                                        href={`/api/projects/${projectId}/kano/survey-document`}
                                        className={`btn-secondary text-sm flex items-center gap-2${isSavingQuestions ? ' pointer-events-none opacity-50' : ''}`}
                                        aria-disabled={isSavingQuestions}
                                        title="저장된 질문으로 종이 설문지(.docx)를 만듭니다"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        설문지 Word 내려받기
                                    </a>
                                    <button onClick={handleSaveKanoQuestions} ...기존 그대로...>
                                        질문 저장
                                    </button>
                                </div>
```

`btn-secondary` 클래스가 없으면 저장소의 기존 보조 버튼 클래스(`btn-ghost` 등)를 쓴다.

- [x] **Step 3: 안내 문구에 Word 를 더한다**

기존 노란 안내문 "저장된 질문이 미리보기 및 Google Forms에 반영됩니다" 를 "저장된 질문이 미리보기, Google Forms, Word 설문지에 반영됩니다" 로 고친다. 편집만 하고 저장하지 않은 질문은 인쇄물에 나가지 않는다는 것을 같은 자리에서 알린다.

- [x] **Step 4: 검증하고 커밋한다**

> 완료(2026-09-04, 사용자 실계정 실기동): 게이트 3종 그린에 더해 화면 3단계를 확인했다 — ① 「설문지 Word 내려받기」로 `.docx` 가 내려오고 Word·한글에서 열림, ② 문서 구조가 양식과 일치(제목·안내문·빈칸 소개·표 머리글+N-1/N-2 행+빈 응답 칸·맺음말), ③ 질문 수정·저장 후 재다운로드에 반영되고 미저장 수정은 반영되지 않음. 이로써 계획서의 전 Task 가 완결됐다.

```sh
npx tsc --noEmit && npx vitest run && npx next lint
```

화면 실기동 검증은 **감리자가 실계정으로 수행한다.** 확인할 것은 셋이다.

1. 버튼을 누르면 `Kano_설문지_<프로젝트명>.docx` 가 내려오고 Word 와 한글(HWP)에서 열리는가.
2. 열린 문서가 양식과 같은 구조인가 — 제목, 안내문, 소개(빈칸), 표(머리글 + N-1/N-2 행 + 빈 응답 칸), 맺음말. 2쪽으로 넘어갈 때 머리글이 반복되는가.
3. 화면에서 질문을 고치고 저장한 뒤 다시 내려받으면 바뀐 문구가 나오는가. 저장하지 않으면 예전 문구가 나오는가.

---

## 완료 후 남는 것

이번 범위에서 뺀 것이다.

- 소개 문단의 「　」 빈칸 자동 채움(프로젝트명·기업명). 결정 2 대로 양식 그대로 두었다.
- 응답자 정보란(이름·연락처). 양식에 없고, 개인정보를 인쇄물에 두는 일은 별도 판단이 필요하다.
- 종이 응답을 앱에 넣는 경로. 이미 있는 엑셀 업로드 양식(`upload-template`)이 그 역할이며, 응답 척도 문구를 맞춘 것(결정 3)이 그 연결이다.
