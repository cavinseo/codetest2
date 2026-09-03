# Task 2 결과 보고서

## RESULT

계획서(`docs/superpowers/plans/2026-09-03-kano-survey-docx.md`) Task 2 의 Step 1·2 를 구현했다. Task 1 의 순수 모델 `KanoSurveyDocumentModel` 을 `docx` 라이브러리로 .docx 바이너리로 바꾸는 렌더러 `lib/kano-survey-docx.ts`(`renderKanoSurveyDocx(model): Promise<Buffer>`)와, 그 렌더러가 ZIP 서명으로 시작하는 버퍼를 내는지만 보는 스모크 테스트 `tests/kano-survey-docx.test.ts`(`it()` 3개)를 새로 만들었다. 두 파일 모두 계획서 Step 1·2 코드 블록을 옮겨 적은 것이다 — 테스트 파일은 계획서와 바이트 단위로 동일하고, 렌더러는 군더더기 공백 하나(아래 DEVIATIONS 1)만 다르다. [확정된 계약]의 값(A4 세로·20mm 여백·맑은 고딕 size 20·열 너비 `[8, 52, 8, 8, 8, 8, 8]`·`tableHeader: true`·`columnSpan: 2`·본문 순서·`HeadingLevel.TITLE`·셀 세로 가운데)과 `docx` import 이름 13개는 계획서 그대로다. Step 3(게이트 검증)은 열어 두었다.

이 컨테이너는 `node_modules` 가 없고 npm 레지스트리·CDN 이 막혀 `docx` 를 설치할 수 없어 `tsc`·`vitest`·`next lint` 를 돌릴 수 없다(위임 프롬프트 [배경] 절의 확인된 사실이며, `npm install` 은 시도하지 않았다). 그 간극을 감리자가 둔 **docx v9 감리 스텁**으로 메웠다: RED(렌더러 없이 실행 → `Cannot find module`) → GREEN(렌더러 생성 후 3/3) 을 실행기 원문 출력으로 확보했고, Task 1 테스트가 같은 실행기에서 17/17 로 유지되는 것과 `npm run check:encoding` 통과를 확인한 뒤 커밋했다. **스텁 통과가 증명하는 것은 "import 한 이름이 v9 에 있다"와 "렌더러가 던지지 않고 끝까지 돈다" 뿐이다.** 진짜 `docx` 가 그 인자를 받아 유효한 .docx 를 만드는지, `tsc` 가 타입을 통과하는지는 이 세션에서 확인하지 못했다 — RISKS 참고.

## FILES CHANGED

- `lib/kano-survey-docx.ts` (신규, 77행) — 렌더러. `docx` 에서 `AlignmentType, Document, HeadingLevel, Packer, PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType, convertMillimetersToTwip` 13개를 import 하고, `KanoSurveyDocumentModel` 은 `import type` 으로만 가져온다. export 는 `renderKanoSurveyDocx(model: KanoSurveyDocumentModel): Promise<Buffer>` 하나다. 내부 헬퍼 `cell`/`headerRow`/`questionRow` 와 상수 `PAGE`/`COLUMN_WIDTHS` 는 계획서 그대로이며 export 하지 않는다.
- `tests/kano-survey-docx.test.ts` (신규, 26행) — 계획서 Step 2 의 `it()` 3개("ZIP 서명으로 시작하는 바이너리를 만든다" / "요구사항이 없어도 만들어진다" / "요구사항이 많아도 만들어진다"). 그 이상 추가하지 않았다 — 트리 구조 검사는 스텁에 의존하게 되고 진짜 `docx` 에서는 ZIP 판독기가 필요해 금지된 항목이다.
- `docs/superpowers/plans/2026-09-03-kano-survey-docx.md` (보고서 커밋에 포함) — Task 2 의 Step 1·2 를 `- [x]` 로 바꾸고, Step 3 은 `- [ ]` 로 두고 그 아래에 왜 열려 있는지 한 줄 인용문(`> ...`)을 넣었다(Task 1 Step 5 아래 문장을 본떴다). 211행에 날 제어 바이트가 있어 Edit 도구를 쓰지 않고 Python 으로 문자열 치환만 했으며(Task 3 에도 같은 제목의 Step 3 이 있어 뒤따르는 문장으로 Task 2 의 것만 잡았다), 고친 뒤 제어 바이트가 있는 줄이 여전히 `[211]` 하나뿐인 것을 확인했다.
- `docs/superpowers/reports/2026-09-03-kano-survey-docx/task-2.md` (이 파일, 보고서 커밋에 포함).

건드리지 않은 것: `package.json`, `package-lock.json`, `lib/kano-survey-document.ts`, `tests/kano-survey-document.test.ts`, `stryker.crap.config.json`(이 파일은 순수 모듈이 아니라 `mutate` 목록에 올리지 않는다 — 계획서 Step 3), `components/project/KanoManager.tsx`, `app/api/**`, Task 1 보고서, 계획서 211행, scratchpad 의 스텁·훅·실행기.

## COMMIT

- 작업 커밋: `24aa178 feat: WS-6 설문지 Word 출력 - 설문지 모델을 .docx 로 그리는 렌더러를 추가한다` (`lib/kano-survey-docx.ts`, `tests/kano-survey-docx.test.ts`)
- 보고서 커밋: 이 파일과 계획서 체크박스. 해시는 커밋 후 `git log` 로 확인한다(이 본문에 자기 자신의 해시를 넣을 수 없다).
- 기준 커밋 `a7a2714`, 브랜치 `claude/admin-account-password-recovery-o93xgy`. **push 하지 않았다.** amend·재작업은 없었다.

## VERIFIED BY

이 환경에는 `node_modules` 가 없고 레지스트리가 403 이라 `npx tsc --noEmit`·`npx vitest run`·`npx next lint` 를 실행할 수 없다(시도하지 않았다). 아래는 감리자가 둔 docx v9 스텁·vitest 셰임·실행기로 **실제 커밋된 테스트 파일을 그대로 실행**한 원문 출력이다. `ExperimentalWarning`·`MODULE_TYPELESS_PACKAGE_JSON` 류 stderr 는 지시대로 걸러 냈다.

실행 명령(공통):

```
node --experimental-strip-types --import /tmp/claude-0/-home-user-codetest2/ba61c08e-745b-5107-af5a-9b724672f95c/scratchpad/hook-docx-stub.mjs /tmp/claude-0/-home-user-codetest2/ba61c08e-745b-5107-af5a-9b724672f95c/scratchpad/run-test-file.mjs <테스트 파일 절대경로>
```

**1. RED — `tests/kano-survey-docx.test.ts` 를 먼저 쓰고 `lib/kano-survey-docx.ts` 가 없는 상태에서 실행**

```
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/user/codetest2/lib/kano-survey-docx.ts' imported from /home/user/codetest2/tests/kano-survey-docx.test.ts
    at finalizeResolution (node:internal/modules/esm/resolve:275:11)
    at moduleResolve (node:internal/modules/esm/resolve:861:10)
    at defaultResolve (node:internal/modules/esm/resolve:985:11)
    at nextResolve (node:internal/modules/esm/hooks:748:28)
    (... 훅의 data: URL 스택 프레임 생략 ...)
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///home/user/codetest2/lib/kano-survey-docx.ts'
}

Node.js v22.22.2
exit=1
```

**2. GREEN — `lib/kano-survey-docx.ts` 생성 후 같은 명령**

```
3/3 통과, 0 실패
exit=0
```

**3. 무회귀 — 같은 실행기로 `tests/kano-survey-document.test.ts`(Task 1)**

```
17/17 통과, 0 실패
exit=0
```

**4. `npm run check:encoding`**

```
> kano-qfd-webapp@0.1.0 check:encoding
> node scripts/check-text-encoding.mjs

한글 인코딩 검사 통과.
exit=0
```

**5. 제어 바이트 검사** — 완료 판정 8 의 명령을 신규 파일 둘과 계획서에 실행

```
lib/kano-survey-docx.ts: []
tests/kano-survey-docx.test.ts: []
docs/superpowers/plans/2026-09-03-kano-survey-docx.md: [211]
```

(이 보고서 자신에 대한 결과는 보고서 커밋 직전에 다시 돌려 `[]` 임을 확인했다 — Task 1 보고서 DEVIATIONS 3-1 의 함정을 피하기 위해 RED 출력의 스택 프레임을 옮길 때 `data:` URL 부분을 생략했다.)

**6. 계획서 코드 블록과의 diff** — 계획서 387~463행(Step 1)·471~496행(Step 2)을 Python 으로 파일로 뽑아 `diff` 했다

```
--- lib vs 계획서 Step 1 ---
21c21
< function cell(text: string, options: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width: number } ) {
---
> function cell(text: string, options: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width: number }) {
diff exit=1
--- tests vs 계획서 Step 2 ---
diff exit=0
```

**7. import 이름이 계약의 13개와 정확히 일치하는지** — `lib/kano-survey-docx.ts` 의 `import { ... } from 'docx'` 를 파싱해 계약 목록과 집합 비교

```
13 True []
```

**추가로 직접 확인한 것**

- `ls tests/*.test.ts | wc -l` → 작업 전 96, 작업 후 `97`.
- 계획서 Task 2 코드 블록(386~497행)에 제어 문자·C1·zero-width 문자가 없는 것을 Python 으로 먼저 확인하고 옮겨 적었다(Task 1 의 211행 사고 재발 방지).
- 작업 커밋 후 `git status --short` → 출력 없음(클린).
- `node --check` 는 Task 1 보고서 VERIFIED BY 1 의 결론대로 근거로 쓰지 않았다.

## DEVIATIONS

**1) 렌더러 21행의 군더더기 공백 하나를 뺐다.** 계획서 Step 1 의 `cell` 시그니처는 `width: number } ) {` 처럼 `}` 와 `)` 사이에 공백이 있다. 의미가 없는 서식이라 `}) {` 로 적었다. 위 VERIFIED BY 6 의 diff 가 이 한 곳뿐임을 보여 준다. 계획서 값·구조·주석은 전부 그대로다. 되돌리길 원하면 한 글자 수정이다.

**2) 렌더러 파일의 주석은 계획서 것만 유지하고 보강하지 않았다.** 위임 프롬프트가 "필요하면 왜 를 보강해도 된다"고 했지만, 계획서 주석 5개(파일 머리·A4·열 너비·머리글 반복·빈 응답 칸)가 이미 전부 "왜"를 적고 있어 더할 것이 없었다.

**3) 보고서 COMMIT 절에 보고서 커밋 해시를 적지 않았다.** 자기 자신의 해시를 본문에 넣을 수 없어 작업 커밋 해시(`24aa178`)만 적었다. Task 1 보고서도 같다.

그 밖에 계획서·위임 프롬프트에서 이탈한 것은 없다. Ask First 항목(스텁이 거부하는 이름, 모델 계약 변경, 새 의존성, 계약 값 변경, 계획서 오류 의심)은 하나도 발생하지 않았다.

## RISKS

- **(a) 진짜 `docx` 를 한 번도 실행하지 못했다.** 이 컨테이너에는 `docx` 가 설치돼 있지 않고 설치할 수도 없다. GREEN 3/3 은 감리 스텁(`scratchpad/docx-stub/index.mjs`)이 낸 결과다. 스텁이 증명하는 것은 import 한 13개 이름이 v9 export 에 있다는 것과 렌더러가 예외 없이 끝까지 돈다는 것뿐이며, `docx` 가 `Document`·`Table`·`TableCell` 등의 옵션 객체(`styles.default.document.run`, `sections[].properties.page`, `tableHeader`, `columnSpan`, `width: { size, type: PERCENTAGE }`, `verticalAlign`)를 받아 Word·한글(HWP)에서 열리는 유효한 .docx 를 만드는지는 사용자 로컬에서 `npx vitest run` 과 계획서 Task 4 Step 4 의 실기동 확인(내려받은 파일을 Word·HWP 로 열기, 2쪽 머리글 반복)으로 봐야 한다.
- **(b) `tsc` 를 돌리지 못해 `docx` 타입과의 정합이 미확인이다.** 특히 (1) `cell()` 의 `align` 매개변수 타입 `(typeof AlignmentType)[keyof typeof AlignmentType]` 이 v9 의 `Paragraph.alignment` 가 받는 타입과 맞는지, (2) `Packer.toBuffer` 의 반환 타입이 `Promise<Buffer>` 로 선언돼 있어 `renderKanoSurveyDocx` 의 반환 타입과 맞는지, (3) `TableCell` 의 `width`·`verticalAlign`·`columnSpan`, `TableRow` 의 `tableHeader`, `Document` 의 `styles.default.document.run.font` 가 문자열을 받는지 — 전부 설치된 `node_modules/docx/build/index.d.ts` 로 확인해야 한다. 계획서 Step 3 도 "tsc 가 docx 의 API 이름에서 실패하면 index.d.ts 를 보고 맞춘다"고 이미 예고하고 있다.
- **(c) 스모크 테스트의 `length > 1000` 은 스텁의 직렬화(트리 JSON)로 충족된 것이다.** 진짜 `docx` 의 ZIP 출력이 요구사항 1개짜리 문서에서도 1000 바이트를 넘는지는 이 세션에서 확인하지 못했다(일반적인 .docx 는 최소 수 KB 이지만 실측하지 않았다). 첫 `it` 이 실제 환경에서 그 단언으로 실패하면 임계값을 조정해야 한다.
- **(d) `npx next lint` 를 돌리지 못했다.** 렌더러는 한 줄이 긴 곳(21·43·65행 등 계획서 그대로)이 있어 프로젝트의 ESLint 설정에 줄 길이 규칙이 있다면 걸릴 수 있다. 저장소의 `next/core-web-vitals` 기본 설정에는 `max-len` 이 없지만 직접 확인하지 못했다.
- **(e) `Buffer` 타입이 전역으로 잡히는지** — 테스트 파일이 `Buffer.from` 을 쓰고 렌더러가 `Promise<Buffer>` 를 반환한다. 이 저장소의 `tsconfig` 가 `@types/node` 를 포함하는지 직접 확인하지 않았다(기존 `lib/kano-upload-template.ts` 가 `Buffer` 를 반환 타입으로 쓰고 있어 될 것으로 보이지만 실행으로 확인한 것은 아니다).
- **(f) vitest 셰임의 `toEqual` 은 `node:assert/strict` 의 `deepEqual` 이다.** 첫 `it` 의 `expect(buffer.subarray(0, 4)).toEqual(Buffer.from([...]))` 이 진짜 vitest 의 `toEqual` 에서도 같은 판정(Buffer 내용 비교)이 되는지는 셰임 통과로는 보장되지 않는다. 계획서가 이 단언을 그대로 쓰고 있어 바꾸지 않았다.
- 실제 게이트(`npx tsc --noEmit && npx vitest run && npx next lint`)는 사용자 로컬에서 재현해야 하며, 계획서 Task 2 Step 3 을 그 이유로 열어 두었다.

## QUESTIONS

없다.
