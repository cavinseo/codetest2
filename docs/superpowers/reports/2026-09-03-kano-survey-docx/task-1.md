# Task 1 결과 보고서

## RESULT

계획서(`docs/superpowers/plans/2026-09-03-kano-survey-docx.md`) Task 1 의 Step 1~4 를 전부 구현했다. 종이 설문지("고객니즈조사 설문지") 문구·행 번호 규칙·파일명 규칙을 담은 순수 모듈 `lib/kano-survey-document.ts` 를 새로 만들고, 그 모듈을 고정하는 테스트 `tests/kano-survey-document.test.ts`(17개 `it()`)를 작성했다. `package.json` 에 `docx` 의존성을, `stryker.crap.config.json` 의 `mutate` 배열에 새 파일을 추가했다.

**이 Task 는 한 번 잘못 판단했다가 감리자의 지적으로 정정한 이력이 있다.** 계획서 Step 2 코드 블록의 `kanoSurveyFileName` 정규식에는 제어 문자 범위(U+0000~U+001F)가 날 바이트로 박혀 있었는데, 이 세션이 쓰는 Read 도구가 그 바이트를 화면에 렌더하지 못해 `| -`(파이프-공백-하이픈)처럼 보였다. 그걸 그대로 읽고 "계획서 원안이 자기모순"이라 잘못 판단해 줄바꿈만 잡는 정규식으로 고쳐 커밋했다(1차 커밋, 이후 amend 로 대체됨). 감리자가 `repr()` 로 원본 바이트를 까 보여줘 정정했고, 정정 과정에서 **감리자가 예시로 준 코드 한 줄도 그대로 베끼지 않고 감리자 자신의 테스트 표로 재검증해 문제를 하나 더 찾았다** — 아래 DEVIATIONS 참고. 최종 구현은 제어 문자 전 범위(`\x00-\x1f`, 이스케이프 표기)를 밑줄로 바꾸고 일반 공백만 하나로 줄인다. 탭·NUL 회귀 테스트 2개를 추가해 이전(1차) 구현에서 실패하고 지금 구현에서 통과하는 것을 직접 확인했다.

이 환경은 `node_modules` 가 없고 `npm install` 이 반드시 실패해 `vitest`/`tsc`/`next lint`/`stryker` 를 실행할 수 없다. 위임 프롬프트 [중요] 절이 지시한 대체 검증(모듈을 실제로 import 해 단언을 `node:assert/strict` 로 실행)으로 17/17 통과를 확인한 뒤 커밋했다.

## FILES CHANGED

- `lib/kano-survey-document.ts` (신규) — 순수 모델. `buildKanoSurveyDocumentModel`, `resolveKanoQuestionPair`, `kanoSurveyAnswerLabels`, `kanoSurveyFileName`, 상수 5개, interface 3개를 export 한다. `kanoSurveyFileName`(93~119행)의 파일명 정리 규칙은 예약 문자(`\ / : * ? " < > |`)와 제어 문자 전 범위(`\x00-\x1f`, 114행)를 밑줄로 바꾼 뒤 남은 공백만 하나로 줄인다.
- `tests/kano-survey-document.test.ts` (신규) — 계획서 Step 3 코드 15개에 탭·NUL 회귀 테스트 2개(118~129행)를 더해 `it()` 17개.
- `package.json` — `dependencies` 블록의 `"bcryptjs"`(22행) 다음, `"exceljs"`(24행) 앞에 `"docx": "^9.5.0",` 추가(23행). `package-lock.json` 은 건드리지 않았다.
- `stryker.crap.config.json` — `mutate` 배열 마지막 항목 `"lib/account-deletion.ts"`(26행) 뒤에 쉼표를 붙이고 `"lib/kano-survey-document.ts"` 를 27행에 추가했다.
- `docs/superpowers/plans/2026-09-03-kano-survey-docx.md` (보고서 커밋에 포함) — Task 1 의 Step 1~4 를 `- [x]` 로 갱신했다. **Step 5 는 `- [ ]` 로 남겨 두고** 그 아래에 왜 열려 있는지(원격 세션은 레지스트리가 막혀 게이트·stryker 미실행, 사용자 로컬 확인 대기) 한 줄을 넣었다. 이 파일 211행에는 날 제어 바이트가 있어 **Edit 로 그 줄을 건드리지 않았다** — 체크박스 줄만 바이트 단위로 고쳤고, 고친 뒤 제어 바이트가 있는 줄이 여전히 211행 하나뿐인 것을 확인했다.

## COMMIT

- 작업 커밋: `3c44e8b feat: WS-6 설문지 Word 출력 - 설문지 문서 모델(순수)과 docx 의존성을 추가한다`
- 이 커밋은 **amend 로 만들어졌다**. 최초 작업 커밋(해시 `f88e759`, `kanoSurveyFileName` 이 줄바꿈만 잡던 1차 버전)을 감리자 지적을 반영해 `git commit --amend` 로 대체했다. 원격에 push 한 적이 없어(아래 VERIFIED BY 참고) 이력을 다시 쓰는 데 문제가 없고, 저장소 관례("커밋은 두 개다: 작업 커밋, 보고서 커밋")를 지키기 위해 새 커밋을 얹지 않고 amend 를 택했다. `f88e759` 라는 해시는 이제 어떤 브랜치에서도 가리켜지지 않는다.

## VERIFIED BY

이 환경에는 `node_modules` 가 없고 `https://registry.npmjs.org` 가 403 이라 `npm install`·`npx tsc`·`npx vitest`·`npx next lint`·`npx stryker` 를 실행할 수 없다(위임 프롬프트 [중요] 절 사실 확인, 실제로 시도하지 않았다). 아래는 위임 프롬프트가 지시한 대체 검증 4가지와, 감리자가 재작업 지시에서 추가로 요구한 회귀 증명의 원문 출력이다.

**1. `node --check lib/kano-survey-document.ts`**

```
(출력 없음, 종료 코드 0)
```

이 검사는 이 Node 버전(v22.22.2)에서 신뢰도가 낮다는 것을 실행으로 직접 확인했다. `export` 가 있는(ESM 으로 취급되는) `.ts` 파일 끝에 명백히 깨진 텍스트(`this is not valid ts syntax {{{ &&&`)를 붙인 사본에 `node --check` 를 돌려도 **종료 코드 0, 출력 없음**이었다 — 반면 `export` 가 없는 순수 스크립트에 같은 텍스트를 붙이면 `SyntaxError` 로 정확히 실패했다(`--experimental-strip-types` 를 같이 줘도 결과는 같았다). 완료 판정 조건 2 는 문자 그대로 만족하지만 이 결과를 "구문이 옳다"는 근거로 쓰지 않았다 — 실제 근거는 항목 2(실제 import·실행)다.

**2. 테스트 17개를 `node:assert/strict` 로 옮긴 임시 스크립트로 실제 `lib/kano-survey-document.ts` 를 import 해 실행(최종본 검증)**

RED (구현 전, 모듈 없음, 최초 시도 때 확인):

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/user/codetest2/lib/kano-survey-document.ts' imported from
/tmp/.../scratchpad/verify-kano-survey-document.ts
```

GREEN (최종 구현, 17개 케이스):

```
resolveKanoQuestionPair
  PASS: 저장된 질문이 있으면 그대로 쓴다
  PASS: 저장된 질문이 없으면 화면과 같은 기본 문구를 만든다
  PASS: 공백뿐인 저장값은 없는 것으로 본다
  PASS: 저장값 앞뒤 공백은 잘라 낸다
buildKanoSurveyDocumentModel
  PASS: 양식의 고정 문구를 그대로 담는다
  PASS: 고정 문구가 양식 원문과 같다
  PASS: 응답 척도는 앱의 라벨 5개를 점수 순서로 쓴다
  PASS: 요구사항마다 N-1(긍정)·N-2(부정) 두 행을 순서대로 만든다
  PASS: 요구사항이 없으면 행이 없다
  PASS: 저장되지 않은 요구사항은 기본 문구로 채운다
kanoSurveyFileName
  PASS: 프로젝트명을 붙인 .docx 이름을 만든다
  PASS: 경로 구분자와 제어 문자는 밑줄로 바꾼다
  PASS: 줄바꿈 이외의 제어 문자(탭)도 밑줄로 바꾼다
  PASS: 공백류가 아닌 제어 문자(NUL)도 밑줄로 바꾸고 원문 그대로 남기지 않는다
  PASS: 연속 공백은 하나로 줄이고 앞뒤 공백은 잘라 낸다
  PASS: 비어 있거나 없으면 기본 이름을 쓴다
  PASS: 너무 긴 이름은 60자에서 자른다

17/17 통과
```

종료 코드 0. 실행 명령: `node --experimental-strip-types --import <register-loader.mjs> <verify-kano-survey-document.ts>`. Node 의 기본 ESM 로더는 상대 경로 import 에 확장자를 요구하는데, 이 저장소 소스(`lib/kano-survey-document.ts` 가 `./utils/korean-utils`, `./kano-response-display` 를 확장자 없이 import 함)는 tsc/vitest 의 번들러식 resolution 을 전제한다. 소스를 고치지 않고 실제 파일을 그대로 import 하기 위해, 확장자 없는 상대 경로 해석이 실패하면 `.ts` 를 붙여 재시도하는 resolve 훅(`ts-extensionless-loader.mjs`)을 스크래치패드에만 만들어 썼다. 검증 스크립트는 전부 `/tmp/claude-0/.../scratchpad/` 에만 두었고 커밋하지 않았다.

**2-1. 회귀 증명 — 탭·NUL 테스트가 1차(줄바꿈만 잡는) 구현에서는 실패하는지 별도 확인**

감리자가 "수정 전에도 통과하면 회귀 테스트가 아니다"라고 명시적으로 요구해, amend 하기 전 커밋(`f88e759`)의 `lib/kano-survey-document.ts` 를 스크래치패드에 그대로 복사해 새 테스트 2개만 돌렸다.

```
  FAIL(예상대로): 줄바꿈 이외의 제어 문자(탭)도 밑줄로 바꾼다 -- Expected values to be strictly equal:
+ actual - expected
+ 'Kano_설문지_탭 칸.docx'
- 'Kano_설문지_탭_칸.docx'

  FAIL(예상대로): 공백류가 아닌 제어 문자(NUL)도 밑줄로 바꾸고 원문 그대로 남기지 않는다 -- Expected values to be strictly equal:
+ actual - expected
+ 'Kano_설문지_널\x00문자.docx'
- 'Kano_설문지_널_문자.docx'

구버전(f88e759) 대상 결과: PASS(예상 밖)=0, FAIL(예상대로)=2
=> 두 테스트 모두 구버전에서 실패함(회귀 테스트로 유효).
```

NUL 케이스는 1차 구현이 실제로 널 바이트를 파일명에 그대로 남기는 것을 보여준다 — 이 값이 Task 3 에서 `Content-Disposition` 헤더에 실릴 것이므로, 1차 구현은 단순한 완성도 문제가 아니라 실제 결함이었다.

**3. `node -e "JSON.parse(...)"` 로 JSON 유효성 확인**

```
package.json OK
stryker.crap.config.json OK
```

**4. `npm run check:encoding`**

```
> kano-qfd-webapp@0.1.0 check:encoding
> node scripts/check-text-encoding.mjs

한글 인코딩 검사 통과.
```

종료 코드 0. 최종본(제어 문자 이스케이프를 `\x00-\x1f` 로, 날 바이트가 아니라 읽을 수 있는 문자로 소스에 적은 버전) 기준으로 다시 실행해 확인했다.

**추가로 직접 확인한 것**

- `grep -c '"lib/kano-survey-document.ts"' stryker.crap.config.json` → `1` (정확히 한 번).
- `ls tests/*.test.ts | wc -l` → 작업 전 95, 작업 후 `96`.
- `git status --short` → 보고서 파일을 제외하면 클린.
- `git log --oneline -3`:
  ```
  3c44e8b feat: WS-6 설문지 Word 출력 - 설문지 문서 모델(순수)과 docx 의존성을 추가한다
  a48827a feat: 벤더링된 스킬을 세션마다 자동 설치하는 SessionStart 훅을 추가한다
  6d9a54c chore: supervising-dual-ai-delivery 스킬을 벤더링한다
  ```
- `git status` → `Your branch is ahead of 'origin/claude/admin-account-password-recovery-o93xgy' by 1 commit.` — **push 하지 않았다.**

## DEVIATIONS

**1) 계획서 코드 블록의 날 바이트를 잘못 읽어 "계획서가 자기모순"이라 오판했다 — 이건 내 오류였고 계획서는 옳았다.** 계획서 Step 2 원문(`docs/superpowers/plans/2026-09-03-kano-survey-docx.md` 211행)을 Read 도구로 읽었을 때 `.replace(/[\\/:*?"<>| -]/g, '_')` 로 보였다. 이걸 곧이곧대로 구현해 계획서 Step 3 테스트에 돌려 보니(구현 전 임시 스크립트로 실측) 두 케이스가 실패했고("줄\n바꿈"→공백이 되어야 할 자리에 아무 변화 없음, "  스마트   팜  "→밑줄이 겹겹이 남음), 이를 근거로 "계획서 원안이 자기 테스트와 모순된다"고 판단해 `\n` 만 잡는 정규식으로 바꿔 커밋했다(1차 커밋 `f88e759`).

감리자가 `python3 -c "...repr(l)..."` 로 파일의 실제 바이트를 까 보여줬고, 나도 독립적으로 같은 명령을 돌려 직접 확인했다(위 VERIFIED BY 는 아니지만 과정을 남긴다):

```
$ grep -an "replace(" docs/superpowers/plans/2026-09-03-kano-survey-docx.md
211:        .replace(/[\\/:*?"<>| -]/g, '_')
212:        .replace(/\s+/g, ' ')

$ python3 -c "s=open('...',encoding='utf-8').read(); ..."
211 '        .replace(/[\\\\/:*?"<>|\x00-\x1f]/g, \'_\')'
```

(`grep` 이 이 파일을 `binary file matches` 로 취급한 것 자체가 제어 바이트가 실제로 있다는 정황 증거였다.) 즉 211행의 문자 클래스는 `\ / : * ? " < > |` 와 **제어 문자 범위 U+0000~U+001F** 이지, 내가 화면에서 본 "공백·하이픈"이 아니었다. Read 도구가 NUL(0x00)과 0x1F 를 렌더하지 못해 시각적으로 공백처럼 보였고, 그 사이의 리터럴 하이픈만 눈에 띄어 "범위 연산자가 아니라 끝에 붙은 리터럴 하이픈"으로 오독했다. **계획서는 자기모순이 아니었다** — 제어 문자 범위로 읽으면 `\n`(밑줄), 연속 공백(공백 하나로 축약) 두 테스트 모두 원안 그대로 통과한다.

**2) 감리자가 정정 지시에서 예시로 준 코드도 그대로 베끼지 않고 재검증해 오류를 하나 더 찾았다.** 감리자의 재작업 지시는 문자 클래스를 `.replace(/[\\/:*?"<>| -]/g, '_')`(공백+리터럴 하이픈)로 되돌리라고 예시를 줬는데, 이건 위 1)에서 내가 잘못 읽은 것과 **같은 모양**이다. 감리자 자신이 준 테스트 표(탭→밑줄, NUL→밑줄)에 이 예시 코드를 직접 돌려 보니:

```
TAB case, 감리자 예시(공백+하이픈): "탭 칸"        (기대값 "탭_칸" 과 다름)
NUL case, 감리자 예시(공백+하이픈): "널<NUL>문자"  (기대값 "널_문자" 과 다름, NUL 이 원문 그대로 남음)
```

감리자의 예시 코드도 감리자 자신이 요구한 테스트를 통과하지 못한다 — 아마 감리자의 메시지를 이 세션에 전달하는 과정에서 같은 종류의 날 바이트가 다시 한번 렌더링 과정을 거치며 뭉개진 것으로 보인다(추정이며 확인 수단은 없다). 그래서 감리자의 리터럴 코드를 그대로 베끼는 대신, 감리자 자신의 진단(`\x00-\x1f`)과 감리자 자신의 테스트 표 둘 다를 만족하는 **명시적 이스케이프** `\x00-\x1f` 를 구현에 썼다 — 날 바이트를 소스에 넣지 말라는 감리자의 원래 취지("명시적 이스케이프로 써라")에도 이게 더 맞다. 이 부분은 감리자가 준 예시 코드 문자열을 문자 그대로 따르지 않은 것이므로 이탈로 기록한다. 감리자의 지시 의도(제어 문자 전 범위를 밑줄로) 자체는 그대로 따랐다.

**3) 탭·NUL 회귀 테스트를 감리자 지시대로 추가하되, `String.fromCharCode` 로 코드포인트를 명시했다.** 소스 파일에 제어 문자를 날로 넣으면 이번 사고가 반복될 수 있어(에디터·git·encoding 검사에서 또 안 보이는 문자가 생긴다), 감리자 지시대로 `String.fromCharCode(9)`(탭), `String.fromCharCode(0)`(NUL)를 썼다. 이 두 테스트는 1차 구현(`f88e759`)에서 실패하고 최종 구현에서 통과하는 것을 위 VERIFIED BY 2-1 에서 직접 확인했다.

**3-1) 이 보고서가 처음에 같은 함정을 그대로 재생산했다.** 위 2)의 재현 출력을 옮겨 적으면서 실제 U+0000 바이트가 보고서 146행에 그대로 박혔고, 그 탓에 `grep` 이 이 보고서를 `binary file matches` 로 취급해 검색이 되지 않았다 — 이번 사고를 일으킨 바로 그 함정이다(감리자가 잡아냈다). 해당 바이트를 보이는 표기 `<NUL>` 로 바꿨고, 제어 문자가 있는 줄이 하나도 없는 것을 확인했다:

```
$ python3 -c "s=open('docs/superpowers/reports/2026-09-03-kano-survey-docx/task-1.md',encoding='utf-8').read()
print([ (n+1) for n,l in enumerate(s.split(chr(10))) if any(ord(c)<32 for c in l) ])"
[]
```

교훈이 한 번 더 확인된 셈이다 — 제어 문자는 "설명하는 글"에 옮겨 적는 순간에도 샌다. 재현 출력을 문서에 옮길 때는 반드시 보이는 표기로 바꿔 적어야 한다.

**4) 최초 작업 커밋(`f88e759`)을 새 커밋으로 쌓지 않고 amend 로 대체했다.** 저장소 관례가 "작업 커밋 + 보고서 커밋" 정확히 두 개를 요구하고, 이 최초 커밋은 아직 push 된 적이 없어 이력을 다시 써도 안전하다고 판단했다. amend 대신 새 커밋을 쌓는 편이 "무슨 일이 있었는지"를 더 투명하게 남긴다는 반론도 있을 수 있어, 그 과정 전체(오독 → 1차 커밋 → 감리자 지적 → 재검증 → 정정)를 이 보고서와 최종 커밋 메시지 본문에 상세히 남겼다.

## RISKS

- **실제 게이트(tsc/vitest/next lint/stryker mutation)를 이 환경에서 낼 수 없다.** 위 4가지 대체 검증(구문 검사·실행 단언 17/17·JSON 유효성·인코딩 검사)과 회귀 증명만 했다. `npx tsc --noEmit`, `npx vitest run`, `npx next lint` 는 사용자가 로컬에서 재현해야 한다.
- **뮤테이션 100% 를 이 환경에서 낼 수 없다.** 사용자가 로컬에서 `npx stryker run stryker.crap.config.json --mutate lib/kano-survey-document.ts` 로 확인해야 한다.
- **ESLint `no-control-regex` 규칙이 이 프로젝트 설정(`next/core-web-vitals`)에서 실제로 걸리는지 확인하지 못했다**(이 컨테이너는 `node_modules` 가 없다). `lib/kano-survey-document.ts:114` 의 정규식에 제어 문자 범위(`\x00-\x1f`)를 직접 썼고, 바로 위(113행)에 이유를 적은 `// eslint-disable-next-line no-control-regex` 주석을 미리 달아 뒀다 — 규칙이 걸리지 않으면 "미사용 disable 지시문" 경고가 날 수 있지만 이 프로젝트의 `lint` 스크립트는 `--max-warnings` 를 안 걸어 경고만으로는 실패하지 않는다(직접 실행해 확인하지 못했으므로 이 판단도 사용자가 로컬에서 재확인해야 한다). 규칙이 실제로 걸리는지, 미리 단 disable 주석이 적절한지 `npx next lint` 로 확인이 필요하다.
- **`package-lock.json` 갱신은 사용자 몫이다.** 이 세션은 `npm install` 을 실행할 수 없어(레지스트리 403) `package.json` 에 `docx` 항목만 추가했다. 사용자가 로컬에서 `npm install` 을 실행해 `package-lock.json` 을 커밋해야 하고, 설치된 `docx` 실제 버전이 `^9.5.0` 범위와 맞는지 `node_modules/docx/package.json` 으로 확인해야 한다.
- **`node --check` 는 이 Node 버전에서 ESM `.ts` 파일의 구문 오류를 사실상 못 잡는다** — 위 VERIFIED BY 항목 1 참고. 다음 Task(2~4)에서도 같은 방식으로 완료 판정하면 안 되고, 실제 import·실행 검증을 우선해야 한다.
- **문서 렌더링 경로가 제어 바이트를 눈에 안 보이게 뭉갤 수 있다는 사실 자체가 위험 요인이다.** 이번 Task 에서 계획서(내가 읽을 때)와 감리자의 정정 지시(내게 전달될 때) 둘 다에서 같은 현상이 관찰됐다. 앞으로 정규식·구분자처럼 "안 보이는 문자가 의미를 바꾸는" 코드 블록을 다룰 때는, 렌더된 화면을 믿지 말고 `grep -a`/`python3 repr()`/`od` 등으로 원본 바이트를 확인하는 것을 원칙으로 삼아야 한다(이 Task 에서 실제로 그렇게 해서 정정했다).

## QUESTIONS

없다. (감리자가 예시로 준 코드를 그대로 쓰지 않고 `\x00-\x1f` 로 바꾼 판단에 이견이 있다면, DEVIATIONS 2)의 재현 결과로 판정해 달라.)
