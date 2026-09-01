# 감리 지시서 — 워크시트 입력 개선 검증 (1·2단계)

**대상 커밋:** `c310d15` (Task A~E 완료 상태)
**근거 계획서:** `docs/superpowers/plans/2026-08-31-worksheet-input-remediation.md`
**작성:** 2026-09-01

---

## 수행 주체가 셋으로 갈린다

| 구분 | 내용 | 수행 |
| --- | --- | --- |
| **Part A** | 실기동 검증 9건 | **감리자 또는 사용자 직접** |
| **Part B** | 통합 테스트 1회 | **감리자 직접** |
| **Part C** | 검증 전에 먼저 고칠 결함 2건 | **실행 AI 위임 가능** |

### ⚠️ Part A·B 를 실행 AI 에게 위임하지 않는 이유

`CLAUDE.md` 의 최우선 환경 제약이다.

> **절대 금지**: `prisma migrate deploy`/`db push`/`studio`, DB에 쓰는 스크립트,
> **dev 서버 기동**(신설 API 라우트라도 dev 서버로 실기동 검증하지 않는다).
> 화면·API 실기동 검증이 필요하면 **감리자가 직접 수행하거나, 사용자의 실계정으로
> 검증하는 단계로 명시적으로 이월한다. 실행 AI에게 위임하지 않는다.**

Part A 는 dev 서버가 필요하고, Part B 는 DB 에 쓴다. 둘 다 위임 금지 대상이다.
아래 절차는 **사람이 읽고 그대로 따라 하는 명령**이지, 실행 AI 프롬프트가 아니다.

---

## ⚠️ Part C 를 먼저 하라 — 검증 준비 중 발견한 결함 2건

이 지시서를 쓰면서 화면 코드를 다시 훑다가 두 가지를 찾았다. **둘 다 Part A 검증
결과를 왜곡하므로 검증보다 먼저 고친다.**

### 발견 1 — Task D 가 워크시트 하나를 빠뜨렸다 (내 실수)

Task D 보고서에 **"저장 버튼 계열 12개 전부"**라고 적었는데 **틀렸다.**
`components/project/*.tsx` 만 훑고 `app/project/[id]/**/page.tsx` 아래를 보지 않았다.

```
$ wc -l "app/project/[id]/attributes/fitness/page.tsx"
457
$ grep -c useUnsavedChanges "app/project/[id]/attributes/fitness/page.tsx"
0
```

**`app/project/[id]/attributes/fitness/page.tsx` 는 457줄짜리 자체 구현 워크시트**다.
공용 컴포넌트를 쓰지 않고 직접 표를 그리며, 저장 버튼 방식인데 미저장 경고가 없다.

나머지 페이지 13개는 공용 컴포넌트를 감싸는 18~41줄 껍데기라 Task D 가 이미 덮는다.
**빠진 것은 이 하나뿐이다.** 그리고 **검토서 초판이 적은 "13개"가 맞았다** — 내가
12개로 "정정"한 것이 오히려 틀렸다.

### 발견 2 — WS-3 "리셋" 버튼은 적합도를 말없이 지운다

Task B 는 **POST**(저장) 경로만 고쳤다. WS-3 화면의 **"리셋"** 버튼은 다른 길로 간다.

```
ProductAttributesTable "리셋" → handleReset → fetch(DELETE /api/projects/<id>/attributes)
                                            → deleteMany({ projectId })   ← 가드 없음
```

**더 파괴적인 동작에 더 약한 경고가 붙어 있다.**

| | 저장(POST) | 리셋(DELETE) |
| --- | --- | --- |
| 적합도 건수를 세는가 | ✅ `countAttributeCascadeImpact` | ❌ |
| 사용자에게 알리는가 | ✅ "적합도 N건이 함께 삭제됩니다" | ❌ "모든 데이터가 삭제됩니다"만 |
| 확인 절차 | 409 → `window.confirm` | 배너 확인 1회 |

**Part A 의 V-3 이 이 경로를 밟으므로 먼저 고쳐야 결과가 의미 있다.**

---

## Part C 위임 프롬프트 (실행 AI)

### 공통 머리 — 아래 블록 앞에 반드시 붙인다

```
[환경 제약 — 위반 시 즉시 중단]
- .env 의 POSTGRES_PRISMA_URL 은 실데이터가 있는 원격 Supabase 다.
- 절대 금지: prisma migrate deploy / db push / studio, DB 에 쓰는 스크립트,
  dev 서버 기동(신설·수정 API 라우트라도 dev 서버로 실기동 검증하지 않는다).
- 안전: npx prisma validate, npx prisma generate.
- 화면·API 실기동 검증이 필요하다고 판단되면 하지 말고 QUESTIONS 에 적어 올린다.
- 키·비밀번호·이메일을 로그·응답 본문에 남기지 않는다 (lib/logger.ts 규칙).

[저장소 관례]
- 커밋 메시지는 한국어. 본문에 "무엇"이 아니라 "왜"를 적는다.
  트레일러: Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
- 들여쓰기 4칸. 주석은 한국어 "~다" 체, 이유 중심.
- 새 소스 파일에는 한 줄짜리 한국어 머리 주석을 단다.
- 테스트는 tests/ 평면 배치. Prisma 는 vi.mock('../lib/prisma', ...) 로 전부 mock 한다.

[게이트 — 전부 통과해야 완료다]
    npx tsc --noEmit && npx vitest run && npx next lint
- 한국어 파일을 새로 만들면 npm run check:encoding 도 함께 돌린다.
- ci.yml 은 main 으로 가는 PR 에서만 도므로 작업 브랜치에서는 게이트가 자동으로
  돌지 않는다. 게이트를 로컬에서 돌릴 수 없으면 그 사실을 VERIFIED BY 에 적는다.

[산출물·보고]
  docs/superpowers/reports/2026-08-31-worksheet-input-remediation/task-<식별자>.md
  RESULT / FILES CHANGED / COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS
VERIFIED BY 에는 각 게이트의 실행 명령과 출력 마지막 줄을 원문으로 담는다.
보고서는 작업 커밋과 별도의 둘째 커밋으로 남긴다 (docs: Task <식별자> 결과 보고서).
두 커밋 뒤 git status 는 깨끗해야 한다.
```

### Task F — WS-4 적합도 페이지에 미저장 이탈 경고를 붙인다

```
docs/superpowers/plans/2026-08-31-worksheet-input-verification.md 의 "발견 1" 을
읽고 수행하라.

[문제]
Task D 가 저장 버튼 계열 워크시트에 미저장 이탈 경고를 붙였는데, 한 곳을 빠뜨렸다.
components/project/*.tsx 만 훑고 app/project/[id]/**/page.tsx 아래를 보지 않았다.

  $ grep -c useUnsavedChanges "app/project/[id]/attributes/fitness/page.tsx"
  0

이 파일은 457줄짜리 자체 구현 워크시트다. 공용 컴포넌트를 쓰지 않고 직접 표를 그리며,
handleSave 로 명시적 저장을 하는데 미저장 경고가 없다. 나머지 페이지 13개는 공용
컴포넌트를 감싸는 18~41줄 껍데기라 이미 덮인다. 빠진 것은 이 하나뿐이다.

[할 일]
1. app/project/[id]/attributes/fitness/page.tsx 에 useUnsavedChanges 를 붙인다.
   - lib/use-unsaved-changes.ts 의 훅을 그대로 쓴다. 새로 만들지 마라.
   - 추적할 값은 이 화면이 저장하는 것 전부다. handleSave(:186-203)가 무엇을
     보내는지 읽고 그 조합을 넘긴다(fitnessMap 이 본체로 보이나 직접 확인하라).
   - markClean 은 서버와 값을 맞춘 직후에만 부른다:
     로드 성공(:139-160 부근)과 저장 성공(:196 부근).
   - markClean 은 받은 값을 그대로 돌려주므로 setX(markClean(next)) 로 감쌀 수 있다.
     state 가 아직 갱신 전이라 훅이 스스로 읽으면 한 박자 늦은 값을 굳힌다.

2. 다른 워크시트 페이지에 같은 누락이 더 없는지 확인한다.
   app/project/[id]/**/page.tsx 를 전부 훑어, 공용 컴포넌트를 감싸기만 하는 것과
   자체 구현인 것을 가른다. 자체 구현인데 저장 버튼 방식이면 같이 붙인다.
   즉시 저장(onBlur·클릭 즉시 POST) 방식이면 붙이지 마라 — 오탐이 된다.

3. 문서의 "12개" 를 바로잡는다. 검토서 초판의 "13개" 가 맞았고 12개로 고친 것이
   틀렸다. 실제 수를 직접 세어 아래 세 곳을 같은 수로 맞춘다.
   - docs/2026-08-31-worksheet-input-review.md (§1-3 표, §4 표, §4-4 본문)
   - docs/superpowers/plans/2026-08-31-worksheet-input-remediation.md (Task 표, Task D)
   - docs/superpowers/reports/.../task-d.md (RESULT 표, DEVIATIONS)
   task-d.md 에는 "왜 틀렸는가"(components/project 만 훑었다)를 남긴다.

4. 테스트. 훅 자체는 tests/unsaved-changes.test.ts 가 이미 덮으므로, 이 Task 에서
   새로 단언할 순수 로직이 없으면 테스트를 억지로 만들지 마라. 대신 게이트에
   npm run build 를 포함해 화면이 깨지지 않는지 본다.

[하지 말 것]
- 탭 전환 경고(Task E)를 이 페이지에 적용하려 시도하는 것. 이 화면은 탭이 아니라
  별도 라우트다. UnsavedChangesProvider 가 없으므로 창 닫기 경고만 걸린다 — 그것이
  설계대로다. 라우터 이동 가로채기는 별건이다(task-e.md QUESTIONS).
- 이 페이지를 공용 컴포넌트로 리팩터링하는 것. 별건이고 범위가 크다.
- dev 서버 기동으로 화면 확인

[커밋]
fix: WS-4 적합도 화면에도 미저장 이탈 경고를 붙인다
본문에 왜를 적는다 — Task D 가 components/project 만 훑어 자체 구현 페이지를
빠뜨렸다는 것, 그래서 "12개"가 틀리고 "13개"가 맞았다는 것.
```

### Task G — WS-3 리셋이 적합도 삭제를 알리게 한다

```
docs/superpowers/plans/2026-08-31-worksheet-input-verification.md 의 "발견 2" 를
읽고 수행하라.

[문제]
Task B 는 저장(POST) 경로만 고쳤다. WS-3 화면의 "리셋" 버튼은 DELETE 로 가는데,
그 경로에는 캐스케이드 가드가 없다.

  ProductAttributesTable "리셋" → handleReset(:417) → fetch(DELETE .../attributes)
  app/api/projects/[id]/attributes/route.ts:128 DELETE → deleteMany({ projectId })

결과적으로 더 파괴적인 동작에 더 약한 경고가 붙어 있다. 저장은 "적합도 N건이 함께
삭제됩니다"를 띄우는데, 전량 삭제인 리셋은 "모든 데이터가 삭제됩니다"라고만 한다.
사용자는 적합도가 함께 사라진다는 것을 모른 채 누른다.

[할 일]
1. app/api/projects/[id]/attributes/route.ts 의 DELETE 핸들러에 가드를 단다.
   POST 가 쓰는 것과 같은 함수를 인자 없이 부른다 — 리셋은 진짜 전량 삭제이므로
   살아남을 id 가 없다.

     const impact = await countAttributeCascadeImpact(prisma, projectId);
     if (impact.fitnesses > 0 && <확인 안 됨>) → 409 needsCascadeConfirm

   확인 신호를 어떻게 받을지는 DELETE 의 관례를 따라 판단하라. body 를 쓸지
   쿼리스트링(?confirmCascade=true)을 쓸지는 실행자가 정하되, 정한 이유를
   DEVIATIONS 에 적는다. POST 쪽 응답 형태(error / needsCascadeConfirm /
   cascadeImpact)는 그대로 맞춰 화면이 같은 코드로 다룰 수 있게 한다.

2. components/project/ProductAttributesTable.tsx 의 handleReset 이 409 를 받으면
   무엇이 사라지는지 보여주고 한 번 더 확인받게 한다. 같은 파일 handleSave(:352)에
   이미 그 형태가 있으니 맞춘다.

3. 리셋 확인 배너(:722-740)의 문구도 손본다. 지금은 "모든 데이터가 삭제됩니다.
   되돌릴 수 없습니다." 인데, 무엇이 함께 사라지는지 말하지 않는다.

4. tests/api-worksheet-cascade.test.ts 에 DELETE 절을 더한다.
   - 적합도가 있으면 409 이고 deleteMany 가 호출되지 않는다
   - 확인 신호가 오면 진행한다
   - 적합도가 없으면 확인 없이 통과한다
   - 권한이 없으면 403 이고 아무것도 지우지 않는다

5. npx stryker run stryker.crap.config.json --mutate lib/import-cascade-guard.ts
   — 이 Task 는 그 파일을 안 건드릴 수도 있으나, 호출 방식이 바뀌면 점수가 흔들릴
   수 있으니 100% 를 확인한다.

[하지 말 것]
- 리셋 버튼을 없애거나 POST({attributes: []}) 로 바꾸는 것. 화면 흐름이 바뀐다.
- countAttributeCascadeImpact 의 시그니처를 또 바꾸는 것. 인자 없이 부르면 전량을
  세도록 이미 되어 있다.
- 실DB 에 붙는 확인

[커밋]
fix: 제품속성 리셋도 적합도가 사라진다는 것을 알린다
본문에 왜를 적는다 — 저장보다 파괴적인 동작에 더 약한 경고가 붙어 있었다는 것.
```

---

## Part A — 실기동 검증 (감리자 또는 사용자 직접)

### 사전 준비

**Part C 를 먼저 끝낸 뒤에 시작한다.** V-3 과 V-9 가 Part C 의 수정에 걸려 있다.

1. 검증용 프로젝트를 **하나 새로 만든다.** 실사용 프로젝트에서 하지 마라 — V-1 과
   V-3 은 데이터를 실제로 지운다.
2. dev 서버를 띄운다(감리자가 직접). `npx prisma generate` 가 `EPERM ...
   query_engine-windows.dll.node` 로 실패하면 dev 서버가 DLL 을 잡고 있는 것이니
   서버를 먼저 내린다.

### ⚠️ WS-4 화면이 둘이다 — 헷갈리면 엉뚱한 것을 검증하게 된다

| 경로 | 컴포넌트 | 저장 대상 | 캐스케이드 |
| --- | --- | --- | --- |
| 프로젝트 화면 탭 `[WS-4] 제품속성적합도` | `FitnessWrapper` | `FitnessMatrix` (JSON 덩어리) | **무관** |
| 별도 페이지 `/project/<id>/attributes/fitness` | 자체 구현 457줄 | `AttributeFitness` 행 (`attributeId` FK) | **대상** |

**Task B 가 지키려던 데이터는 아래쪽이다.** V-2·V-3 은 반드시 **별도 페이지**를 쓴다.
탭으로 하면 캐스케이드와 무관한 것을 보게 되어 **거짓 통과**가 난다.

### 검증 항목

각 항목은 **절차 → 통과 → 실패 시 적을 것** 순이다.

---

#### V-1. WS-2 초기화가 진짜로 지운다 (Task A)

1. `[WS-2] AS-IS 스펙표` 탭에서 행을 3개쯤 채우고 **저장**
2. **초기화** 버튼 → 확인 배너의 **모두 삭제**
3. `"AS-IS 스펙표가 초기화되었습니다."` 토스트 확인
4. **페이지를 새로고침**(F5)

- **통과:** 표가 비어 있다
- **실패:** 지웠던 행이 되살아난다 → **고치기 전 증상 그대로다.** 배포된 코드가
  `85339a0` 이후인지부터 확인하라

---

#### V-2. WS-3 정상 편집이 적합도를 지키고 경고도 안 뜬다 (Task B — 핵심)

**이 항목이 Task B 의 존재 이유다.**

1. `[WS-3] 제품속성서` 탭에서 속성 행을 3개 채우고 **저장**
2. **별도 페이지** `/project/<id>/attributes/fitness` 로 이동
   (좌측 워크시트 메뉴의 `WS-4 제품속성적합도`)
3. 속성 3개 각각에 적합도 값을 넣고 **적합도 저장**. `"적합도 분석이 저장되었습니다."` 확인
4. WS-3 으로 **돌아가서 글자 하나만 고친다**(예: 속성명 끝에 `.` 하나 추가)
5. **저장**
6. WS-4 적합도 페이지로 돌아가 **새로고침**

- **통과 (둘 다 만족해야 한다):**
  - 5번에서 **"적합도 N건이 함께 삭제됩니다" 확인창이 뜨지 않는다**
  - 6번에서 **적합도 값이 그대로 남아 있다**
- **실패 A** — 확인창이 뜬다 → 가드가 여전히 제출 id 를 보지 않는 것이다.
  **띄운 문구를 그대로 적어 보내라**
- **실패 B** — 확인창은 안 뜨는데 적합도가 비었다 → `deleteMany` 가 여전히 전량을
  지운다. **가장 나쁜 경우다.** 즉시 중단하고 알려라

---

#### V-3. WS-3 전량 삭제는 여전히 막는다 (Task B + Task G)

1. V-2 상태(속성 3개 + 적합도)에서 시작
2. WS-3 의 **리셋** 버튼을 누른다

- **통과 (Task G 이후):** 적합도가 함께 사라진다는 것을 **문구가 말한다**
- **실패:** "모든 데이터가 삭제됩니다"라고만 하고 적합도 얘기가 없다 → Task G 가
  반영되지 않았다
- 확인하고 나면 실제로 지워도 된다(검증용 프로젝트이므로)

---

#### V-4. WS-3 스펙 선택기에서 칸이 밀리지 않는다 (Task C)

1. `[WS-2]` 에서 **핵심기능(Core) 두 개**를 만들고, **각각에 같은 이름의 세부기능**
   을 넣는다. 예: `Core A / 설치`, `Core B / 설치`
2. 저장 → `[WS-3]` 으로 이동 → 스펙 선택기(AS-IS 스펙을 골라 넣는 표)를 연다

- **통과:** 두 행 모두 세부기능 칸에 `설치` 가 보이고, 오른쪽 열(적용 기술)이
  제 위치에 있다
- **실패:** 아래 행의 세부기능 칸이 비고 오른쪽 열이 한 칸 왼쪽으로 밀린다
  → **화면을 캡처해 보내라**
- **덤:** 하위가 없는 핵심기능 두 개를 나란히 두면 같은 버그를 밟는다. 함께 봐도 좋다

---

#### V-5. 저장 안 하고 창을 닫으면 경고한다 (Task D)

1. 아무 워크시트(예: `[WS-1] 자사매출추정표`)에서 한 칸 입력. **저장하지 않는다**
2. 브라우저 탭의 **X** 를 누르거나 **F5**

- **통과:** 브라우저 표준 확인창이 뜬다("변경사항이 저장되지 않을 수 있습니다" 류.
  문구는 브라우저마다 다르고 우리가 정할 수 없다)
- **실패:** 아무 경고 없이 닫힌다

---

#### V-6. 저장 안 하고 탭을 옮기면 경고한다 (Task E)

1. `[WS-3]` 에서 한 칸 입력. **저장하지 않는다**
2. 상단 탭에서 `[WS-5] 고객요구사항도출표` 를 클릭

- **통과:** `저장하지 않은 변경이 있습니다. 다른 워크시트로 이동하면 사라집니다.`
  확인창이 뜬다
- **취소를 눌러 본다:** WS-3 에 그대로 머물고 입력이 살아 있어야 한다

---

#### V-7. 저장한 뒤에는 탭을 옮겨도 안 묻는다 (Task E — 가장 중요)

**V-6 보다 이쪽이 중요하다.** 정리 함수와 `markClean` 이 제대로 도는지 보는 항목이고,
여기서 틀리면 사용자는 **저장했는데도 매번 경고를 보게 되어** 그다음부터 경고를
읽지 않는다.

1. V-6 에서 **취소**를 눌러 WS-3 에 머문다
2. **저장**을 누른다
3. 다시 `[WS-5]` 탭을 클릭
4. WS-5 에서 아무것도 하지 말고 `[WS-1]` 탭을 클릭

- **통과:** 3번과 4번 **모두 확인창이 뜨지 않는다**
- **실패 A** — 3번에서 뜬다 → `markClean` 이 저장 시점 값을 못 굳혔다
- **실패 B** — 4번에서 뜬다 → **정리 함수가 안 돈다.** WS-3 이 언마운트되며 dirty 를
  지우지 않아 경고가 따라다니는 것이다. **몇 번째 이동에서 떴는지 함께 적어라**

---

#### V-8. 즉시 저장 화면에는 경고가 안 붙는다 (Task D 범위 확인)

1. `[WS-7] TIMKO/만족계수 그래프` 에서 가중치 칸에 값을 넣고 **다른 곳을 클릭**
   (`onBlur` 로 자동 저장된다)
2. 탭을 옮기거나 창을 닫아 본다

- **통과:** 경고가 뜨지 않는다(이미 저장됐으므로)
- **실패:** 경고가 뜬다 → 오탐이다. **어느 화면인지 적어라**
- `[WS-9] QFD` 에서 관계 셀을 클릭한 뒤에도 같은 것을 확인한다

---

#### V-9. WS-4 적합도 화면에도 경고가 붙었다 (Task F)

**Task F 를 마친 뒤에만 유효하다.**

1. 별도 페이지 `/project/<id>/attributes/fitness` 에서 값을 하나 고친다.
   **저장하지 않는다**
2. 창을 닫거나 F5

- **통과:** 브라우저 확인창이 뜬다
- **참고:** 이 화면은 탭이 아니라 별도 라우트라 **탭 전환 경고는 해당 없다.**
  설계대로다

---

## Part B — 통합 테스트 1회 (감리자 직접)

절차 전문은 `docs/superpowers/reports/2026-08-31-worksheet-input-remediation/통합테스트-수동실행.md`
에 있다. 복사해 쓸 명령만 다시 싣는다.

```sh
# 1) 일회용 Postgres (포트 5433 — 로컬 Postgres 와 겹치지 않게)
docker run --rm -d --name codetest2-it -p 5433:5432 \
  -e POSTGRES_PASSWORD=it -e POSTGRES_USER=it -e POSTGRES_DB=it postgres:16

# 2) 스키마 — URL 이 localhost:5433 인지 눈으로 확인하고 실행한다
DATABASE_URL="postgresql://it:it@localhost:5433/it?schema=public" \
POSTGRES_PRISMA_URL="postgresql://it:it@localhost:5433/it?schema=public" \
POSTGRES_URL_NON_POOLING="postgresql://it:it@localhost:5433/it?schema=public" \
npx prisma db push --skip-generate

# 3) 실행 (POSTGRES_PRISMA_URL 은 .env 값 그대로 둔다 — 안전장치가 두 값을 비교한다)
INTEGRATION_DATABASE_URL="postgresql://it:it@localhost:5433/it?schema=public" \
npm run test:integration

# 4) 정리
docker rm -f codetest2-it
```

**기대:** `Test Files 1 passed (1)` / `Tests 5 passed (5)`

**`속성을 지우면 적합도가 함께 사라진다` 가 실패하면 즉시 알려라.** Task B 는 그
캐스케이드가 일어난다는 전제 위에 세운 것이라, 전제가 틀리면 고친 방향 자체를 다시
봐야 한다.

**이 테스트는 실데이터 DB 에 붙지 않는다.** 코드가 별도 `INTEGRATION_DATABASE_URL` 을
요구하고, 그 값이 앱 URL 과 같으면 모듈 로드 시점에 실패한다.

---

## 보고 형식

Part A 는 아래 표만 채워 보내면 된다. 통과한 것은 `O` 한 글자로 충분하다.

```
V-1 WS-2 초기화                      [ ]
V-2 WS-3 정상 편집 → 적합도 생존      [ ]   ← 핵심
V-3 WS-3 리셋 경고 문구               [ ]
V-4 WS-3 스펙 선택기 병합             [ ]
V-5 창 닫기 경고                      [ ]
V-6 탭 전환 경고                      [ ]
V-7 저장 후 탭 전환 (경고 없음)        [ ]   ← 핵심
V-8 WS-7·WS-9 오탐 없음               [ ]
V-9 WS-4 적합도 화면 경고 (Task F 후)  [ ]

Part B 통합 테스트                    [ ]
```

**실패한 항목은 이 셋을 적어 주면 원인을 좁힐 수 있다.**

1. 어느 항목의 몇 번 절차에서
2. 무엇이 보였는가(문구는 그대로, 화면은 캡처)
3. 브라우저와 그때 URL

---

## 감리 판정 기준

| 결과 | 판정 |
| --- | --- |
| V-2 실패 B(적합도가 사라짐) | **즉시 중단.** Task B 를 되돌리고 원인부터 다시 본다 |
| V-1 실패 | 배포 커밋 확인 → 그래도 실패면 Task A 재검토 |
| V-7 실패 B(정리 함수) | Task E 회귀. 경고가 헛돌면 Task D·E 전체가 무의미해진다 |
| V-8 실패(오탐) | Task D 범위가 잘못됐다. 즉시 저장 화면 목록을 다시 센다 |
| V-4 실패 | Task C 재검토. 게이트는 통과했으므로 렌더링 쪽 문제다 |
| Part B 실패 | Task B 의 전제가 흔들린다. 방향 재검토 |
| 전부 통과 | main 으로 PR 을 연다. `ci.yml`·`crap.yml` 이 자동으로 돈다 |
