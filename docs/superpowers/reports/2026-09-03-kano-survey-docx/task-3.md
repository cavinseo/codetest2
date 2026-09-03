# Task 3 결과 보고서

## RESULT

계획서(`docs/superpowers/plans/2026-09-03-kano-survey-docx.md`) Task 3 의 Step 1·2 를 구현했다. 종이 설문지(.docx)를 내려주는 라우트 `app/api/projects/[id]/kano/survey-document/route.ts`(`GET /api/projects/{id}/kano/survey-document`)와, Prisma·authorization 을 전부 mock 해 그 라우트의 200 헤더·본문, 요구사항 조회 순서, 404, 403 통과, 500 본문 비노출을 보는 `tests/api-kano-survey-document.test.ts`(`it()` 5개)를 새로 만들었다. **두 파일 모두 계획서 Step 1·2 코드 블록과 바이트 단위로 동일하다** — 감리자가 계획서에서 뽑아 둔 원문 파일과 `diff` 한 결과가 둘 다 비어 있고(exit 0), 그 원문 파일이 계획서의 해당 코드 블록과 같다는 것도 Python 으로 다시 확인했다. [확정된 계약]의 값(읽기 권한 — `requireProjectAccess(request, projectId)` 에 `{ write: true }` 없음, 프로젝트 `select: { name: true }`, 요구사항 `select` 세 열 + `orderBy: { order: 'asc' }`, 응답 헤더 세 개, 404/500 문구)은 계획서 그대로다. 이 라우트는 순수 모듈이 아니므로 `stryker.crap.config.json` 의 `mutate` 목록에 올리지 않았다. Step 3(게이트 검증)은 열어 두었다.

이 컨테이너는 `node_modules` 가 없고 npm 레지스트리가 403 이라 `tsc`·`vitest`·`next lint` 를 돌릴 수 없고 `next/server`·`@prisma/client` 도 없다(위임 프롬프트 [배경] 절의 확인된 사실이며, `npm install` 은 시도하지 않았다). 그 간극은 감리자가 둔 **로더 훅 + 감리 하네스(12 시나리오, 전부 스텁 경유)** 로 메웠다: RED(라우트 없이 실행 → `Cannot find module`) → GREEN(라우트 생성 후 `12건 전부 통과`) 을 원문 출력으로 확보했고, Task 1 테스트 17/17·Task 2 테스트 3/3 무회귀와 `npm run check:encoding` 통과를 확인한 뒤 커밋했다. **하네스 통과가 증명하는 것은 "라우트가 스텁 위에서 계약대로 분기·헤더·본문·호출 인자를 낸다"는 것뿐이다.** 내가 쓴 테스트 파일은 이 컨테이너에서 실행되지 않았고(셰임이 `vi.mock` 호이스팅·`vi.fn` 매처를 지원하지 않는다), 진짜 Next 런타임·Prisma 타입 정합·`tsc` 는 사용자 로컬 게이트 몫이다 — RISKS 참고.

## FILES CHANGED

- `app/api/projects/[id]/kano/survey-document/route.ts` (신규, 49행, 디렉터리도 신규) — 계획서 Task 3 Step 1 코드 블록 그대로. `next/server`·`@/lib/prisma`·`@/lib/authorization`·`@/lib/logger`·`@/lib/kano-survey-document`(`buildKanoSurveyDocumentModel`, `kanoSurveyFileName`)·`@/lib/kano-survey-docx`(`renderKanoSurveyDocx`) 를 import 하고 `GET` 하나를 export 한다. 본뜬 `app/api/projects/[id]/kano/invite-template/route.ts` 와 같은 모양(권한 판정 → 프로젝트 조회 → 404 → 생성 → `new NextResponse(new Uint8Array(buffer), { headers })` → catch 에서 로거 + 500)이다.
- `tests/api-kano-survey-document.test.ts` (신규, 84행) — 계획서 Task 3 Step 2 코드 블록 그대로. `it()` 5개(".docx 첨부 파일로 내려준다" / "요구사항을 화면과 같은 순서로 읽는다" / "프로젝트가 없으면 404 다" / "권한이 없으면 접근 판정 결과를 그대로 돌려준다" / "문서 생성이 실패하면 500 이고 원인을 응답에 담지 않는다"). 그 이상 추가하지 않았다. `vi.mock('../lib/prisma', ...)` + `vi.mock('../lib/authorization', ...)` + `await import(route)` 패턴은 선례 `tests/api-admin-project-delete.test.ts:10-25` 와 같다.
- `docs/superpowers/plans/2026-09-03-kano-survey-docx.md` (보고서 커밋에 포함) — Task 3 의 Step 1·2 를 `- [x]` 로 바꾸고, Step 3 은 `- [ ]` 로 두고 그 아래에 왜 열려 있는지 한 줄 인용문(`> ...`)을 넣었다(Task 2 Step 3 아래 문장을 본떴다). 211행에 날 제어 바이트가 있어 Edit 도구를 쓰지 않고 Python 으로 문자열 치환만 했다(Task 2 에도 같은 제목의 Step 3 이 있어, 뒤따르는 ```` ```sh ```` 블록과 `### Task 4` 까지 묶어 Task 3 의 것만 잡았다 — 치환 전 각 패턴의 출현 횟수가 1 임을 assert 했다). 고친 뒤 제어 바이트가 있는 줄이 여전히 `[211]` 하나뿐인 것을 확인했다.
- `docs/superpowers/reports/2026-09-03-kano-survey-docx/task-3.md` (이 파일, 보고서 커밋에 포함).

건드리지 않은 것: `package.json`, `package-lock.json`, `lib/**`(전부 — `lib/kano-survey-document.ts`·`lib/kano-survey-docx.ts` 동결), `tests/kano-survey-document.test.ts`, `tests/kano-survey-docx.test.ts`, `stryker.crap.config.json`, `components/**`, `app/api/projects/[id]/kano/invite-template/**`, Task 1·2 보고서, 계획서 211행, scratchpad 의 도구 파일(훅·하네스·실행기·추출 원문). 새 의존성 없음.

## COMMIT

- 작업 커밋: `06f2d42 feat: WS-6 설문지 Word 출력 - 종이 설문지(.docx) 내려받기 API 를 추가한다` (`app/api/projects/[id]/kano/survey-document/route.ts`, `tests/api-kano-survey-document.test.ts`)
- 보고서 커밋: 이 파일과 계획서 체크박스. 해시는 커밋 후 `git log` 로 확인한다(이 본문에 자기 자신의 해시를 넣을 수 없다 — Task 1·2 보고서와 같다).
- 기준 커밋 `e4c83f2`, 브랜치 `claude/admin-account-password-recovery-o93xgy`. **push 하지 않았다.** amend·재작업은 없었다. 새 브랜치를 만들지 않았다.

## VERIFIED BY

이 환경에는 `node_modules` 가 없고 레지스트리가 403 이라 `npx tsc --noEmit`·`npx vitest run`·`npx next lint` 를 실행할 수 없다(시도하지 않았다). 아래는 감리자가 둔 로더 훅·하네스·실행기로 얻은 원문 출력이다. `ExperimentalWarning`·`MODULE_TYPELESS_PACKAGE_JSON`·"Reparsing as ES module" 류 stderr 는 지시대로 걸러 냈다. `S=/tmp/claude-0/-home-user-codetest2/ba61c08e-745b-5107-af5a-9b724672f95c/scratchpad` 다.

**1. RED — `tests/api-kano-survey-document.test.ts` 를 먼저 옮겨 적고, 라우트 디렉터리가 없는 상태에서 감리 하네스 실행**

```
$ ls "app/api/projects/[id]/kano/survey-document"
ls: cannot access 'app/api/projects/[id]/kano/survey-document': No such file or directory
$ node --experimental-strip-types --import $S/hook-route.mjs $S/verify-task3.mts
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/user/codetest2/app/api/projects/[id]/kano/survey-document/route.ts' imported from /tmp/claude-0/-home-user-codetest2/ba61c08e-745b-5107-af5a-9b724672f95c/scratchpad/verify-task3.mts
    at finalizeResolution (node:internal/modules/esm/resolve:275:11)
    at moduleResolve (node:internal/modules/esm/resolve:861:10)
    at defaultResolve (node:internal/modules/esm/resolve:985:11)
    at nextResolve (node:internal/modules/esm/hooks:748:28)
    (... 훅의 data: URL 스택 프레임 생략 ...)
    at nextResolve (node:internal/modules/esm/hooks:748:28)
    at Hooks.resolve (node:internal/modules/esm/hooks:240:30)
    at MessagePort.handleMessage (node:internal/modules/esm/worker:199:24)
    at [nodejs.internal.kHybridDispatch] (node:internal/event_target:843:20)
    at MessagePort.<anonymous> (node:internal/per_context/messageport:23:28) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///home/user/codetest2/app/api/projects/[id]/kano/survey-document/route.ts'
}

Node.js v22.22.2
exit=1
```

**2. GREEN — 라우트 생성 후 같은 명령**

```
$ node --experimental-strip-types --import $S/hook-route.mjs $S/verify-task3.mts
감리 하네스(Task 3, 스텁 경유): 12건 전부 통과
주의: prisma·authorization·next/server·docx 가 전부 스텁이다. Prisma 타입 정합과 Next 런타임은 로컬 게이트가 본다.
exit=0
```

**3. 계획서 원문과의 `diff` — 둘 다 비어 있다**

```
$ diff $S/plan-task3-route.ts "app/api/projects/[id]/kano/survey-document/route.ts"
diff route exit=0
$ diff $S/plan-task3-test.ts tests/api-kano-survey-document.test.ts
diff test exit=0
```

**4. 감리자의 추출 원문이 계획서 Task 3 의 ```` ```ts ```` 블록과 같은지** — 계획서에서 `### Task 3` ~ `### Task 4` 사이의 ```` ```ts ```` 블록 두 개를 Python 으로 뽑아 비교

```
ts blocks in Task 3: 2
plan-task3-route.ts identical: True
plan-task3-test.ts identical: True
```

**5. 무회귀 — 같은 실행기로 Task 1·2 테스트**

```
$ node --experimental-strip-types --import $S/hook-docx-stub.mjs $S/run-test-file.mjs /home/user/codetest2/tests/kano-survey-document.test.ts
17/17 통과, 0 실패
exit=0
$ node --experimental-strip-types --import $S/hook-docx-stub.mjs $S/run-test-file.mjs /home/user/codetest2/tests/kano-survey-docx.test.ts
3/3 통과, 0 실패
exit=0
```

**6. `npm run check:encoding`**

```
> kano-qfd-webapp@0.1.0 check:encoding
> node scripts/check-text-encoding.mjs

한글 인코딩 검사 통과.
exit=0
```

**7. 제어 바이트 검사** — 완료 판정 8 의 명령을 계획서·라우트·테스트에 실행(계획서는 체크박스 수정 뒤 다시 실행해 같은 결과)

```
docs/superpowers/plans/2026-09-03-kano-survey-docx.md: [211]
app/api/projects/[id]/kano/survey-document/route.ts: []
tests/api-kano-survey-document.test.ts: []
```

(이 보고서 자신에 대한 결과는 보고서 커밋 직전에 다시 돌려 `[]` 임을 확인했다. RED 출력의 `data:` URL 스택 프레임은 Task 2 보고서와 같은 이유로 생략했다.)

**8. 테스트 파일 수와 작업 커밋 후 상태**

```
$ ls tests/*.test.ts | wc -l
98
$ git status --short          # 작업 커밋 직후
(출력 없음)
```

**추가로 직접 확인한 것**

- 감리자의 추출 원문 두 파일에 제어 바이트가 없고(`ctrl []`) 끝이 개행으로 끝나는 것을 옮겨 적기 전에 확인했다.
- 옮겨 적기는 `cp` 로 했다 — 손으로 다시 치면서 생기는 오타·공백 차이를 원천 차단하기 위해서다. 그래서 `diff` 가 비어 있는 것이 자명해 보이지만, 위 4 에서 추출 원문 자체가 계획서와 같음을 별도로 확인했으므로 "계획서 == 저장소 파일" 이 성립한다.
- `node --check` 는 지시대로 근거로 쓰지 않았다.
- `git rev-list --count origin/claude/admin-account-password-recovery-o93xgy..HEAD` 가 작업 전 0 이었고, 보고서 커밋 후 2 가 되는 것과 `git diff e4c83f2 HEAD --name-only` 가 4개 파일인 것은 보고서 커밋 직후 확인한다.

## DEVIATIONS

**1) 코드·테스트에서 계획서와 다른 곳은 없다.** 라우트·테스트 모두 바이트 동일(VERIFIED BY 3·4). Ask First 항목(계획서 코드 변경, 접근 조건 변경, `lib/**`·Task 1·2 파일 변경, 새 의존성, 하네스 실패)은 하나도 발생하지 않았다.

**2) 커밋 트레일러는 `CLAUDE.md` 의 `Claude Opus 5` 가 아니라 위임 프롬프트가 지정한 두 줄(`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` + `Claude-Session: ...`)을 썼다.** 위임 프롬프트가 명시적으로 지정했고, Task 2 의 작업 커밋(`e464028`)도 같은 트레일러를 썼다. 저장소 관례와 어긋난다고 보면 감리자가 통일하면 된다.

**3) 보고서 COMMIT 절에 보고서 커밋 해시를 적지 않았다.** 자기 자신의 해시를 본문에 넣을 수 없어 작업 커밋 해시(`06f2d42`)만 적었다. Task 1·2 보고서와 같다.

**4) 계획서 Step 3 아래 인용문에 "감리 하네스(스텁 경유 12/12)" 를 덧붙였다.** Task 2 의 문장을 본뜨되, Task 2 는 대체 검증이 "감리 스텁" 이었고 이번에는 하네스라 그 차이를 한 단어로 적은 것이다. 문장 구조는 같다.

## RISKS

- **(a) 진짜 Next 런타임·Prisma 로 라우트를 한 번도 실행하지 못했다.** 하네스의 12/12 는 `next/server`(`NextRequest`/`NextResponse`)·`@/lib/prisma`·`@/lib/authorization`·`docx` 가 전부 감리 스텁인 상태의 결과다. 스텁이 증명하는 것은 라우트의 분기(403 통과·404·500)·헤더 세 개·본문 첫 바이트·`findMany`/`findUnique`/`requireProjectAccess` 호출 인자가 계약대로라는 것뿐이다. 진짜 `NextResponse` 가 `Uint8Array` 본문을 그 헤더로 내려보내는지, Prisma 가 그 `select`/`orderBy` 를 받아 `KanoSurveyRequirement[]` 모양의 배열을 주는지, 브라우저가 `filename*=UTF-8''...` 만 있는(폴백 `filename=` 없는) `Content-Disposition` 으로 한글 파일명을 저장하는지는 사용자 로컬의 `npx vitest run` 과 계획서 Task 4 Step 4 의 실기동 확인(감리자·실계정)으로 봐야 한다. dev 서버는 지시대로 기동하지 않았다.
- **(b) `tsc` 를 돌리지 못해 타입 정합이 미확인이다.** 특히 (1) `prisma.customerRequirement.findMany({ select: { requirement, kanoPositiveQ, kanoNegativeQ } })` 의 결과 타입(`{ requirement: string; kanoPositiveQ: string | null; kanoNegativeQ: string | null }[]`)이 `buildKanoSurveyDocumentModel(requirements: KanoSurveyRequirement[])` 의 `kanoPositiveQ?: string | null` 에 대입되는지 — 이론상 맞지만 실행으로 본 것은 아니다. (2) `new NextResponse(new Uint8Array(buffer), { headers })` 에서 `buffer` 가 `Packer.toBuffer` 의 `Buffer` 인데, 같은 생성자 패턴은 저장소의 `invite-template`·`upload-template`·`business-plan/template` 라우트 세 곳에 이미 있어 로컬 `tsc` 를 통과하고 있고 `upload-template` 쪽 인자도 `Buffer` 다(Task 2 보고서 RISKS (e)). 그래도 이 파일에 대해 돌린 것은 아니다. (3) `props: { params: Promise<{ id: string }> }` 는 `invite-template` 과 같은 형태라 Next 15 시그니처와 맞을 것으로 본다. 감리자가 grep 으로 확인한 좌표(`CustomerRequirement` 의 세 열·`order Int`, `requireProjectAccess` 시그니처, `createLogger().error` 3인자)는 [배경] 절의 사실로 받았고 재조사하지 않았다.
- **(c) 내가 쓴 `tests/api-kano-survey-document.test.ts` 는 이 컨테이너에서 실행되지 않았다 — 사용자 로컬 vitest 가 첫 실행이다.** 셰임이 `vi.mock` 호이스팅과 `vi.fn` 매처(`toHaveBeenCalledWith(expect.objectContaining(...))`, `not.toHaveBeenCalled`, `mockRejectedValue`)를 지원하지 않는다. 하네스 12/12 는 감리자의 시나리오이지 내 테스트 5개가 아니다. 다만 (1) `vi.mock` 팩토리가 상위 `const vi.fn()` 을 참조하는 패턴은 로컬을 통과하는 선례 `tests/api-admin-project-delete.test.ts:10-25` 와 동일하고, (2) `new NextRequest(url)` 은 `tests/` 의 30개 이상 파일이 이미 쓰고 있다. 확인하지 못한 것은 (3) 500 시나리오에서 진짜 `createLogger('api/kano-survey-document').error(...)` 가 vitest 환경에서 출력만 하고 던지지 않는지(`lib/logger.ts` 는 읽지 않았다 — 순수 모듈이라는 [배경] 사실만 받았다), (4) 첫 `it` 의 `res.arrayBuffer()` 가 진짜 `NextResponse` 에서 `Uint8Array` 본문을 그대로 돌려주는지, (5) 진짜 `docx` 의 출력이 `PK` 로 시작하는지(Task 2 보고서 RISKS (a)·(c) 와 같은 미확인). 세 번째 `it`(404) 는 `findManyRequirement` 가 호출되지 않는 것을 단언하지 않지만 계획서 그대로 두었다.
- **(d) 그 밖에 확인하지 못한 것.** `npx next lint` 를 돌리지 못했다(라우트는 `invite-template` 과 같은 모양이라 새로 걸릴 규칙은 없어 보이지만 실행하지 않았다). `Cache-Control: no-store` 와 `filename*` 만 있는 `Content-Disposition` 은 `invite-template` 의 기존 동작을 그대로 따른 것이라 브라우저 호환은 그쪽과 같다고 봤을 뿐 새로 시험하지 않았다. 계획서 Step 3 의 게이트 3종은 사용자 로컬에서 재현해야 하며 그 이유로 Step 3 을 열어 두었다. 이 라우트는 순수 모듈이 아니라 stryker 대상이 아니므로 뮤테이션 점수는 해당 없다.

## QUESTIONS

없다.
