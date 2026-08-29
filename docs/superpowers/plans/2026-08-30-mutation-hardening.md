# 뮤테이션 커버리지 보강 (oauth-nonce · personal-vendors) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 뮤테이션 대상 15개 모듈 중 기준 미달인 두 모듈을 100%로 올린다. 소스의
동작은 바꾸지 않는다 — 테스트 보강과 등가 뮤턴트 주석만으로 달성한다.

**Background (감리자 실측, 2026-08-30):** `npx stryker run stryker.crap.config.json`
전체 실행 결과 `All files 95.18% (668 killed / 3 timeout / 33 survived / 1 no-cov)`.
미달 모듈:

| 모듈 | 점수 | 생존 |
|---|---|---|
| `lib/ai/personal-vendors.ts` | 68.75 | 10 |
| `lib/oauth-nonce.ts` | 80.85 | 8 + 미커버 1 |

`personal-vendors.ts` 는 `2026-08-25-personal-ai-keys.md` Task 2 Step 5 가 100%를
요구했으나 그 체크박스는 지금도 열려 있고, 이후 `2026-08-25-member-ai-modes.md`
Task B(커밋 `c6b2992`)가 같은 파일에 4모드 상수를 얹으면서 점수가 떨어졌다.
게이트 3종(tsc·vitest·lint)이 뮤테이션 하락을 못 잡은 구조적 결과다 —
재발 방지 규칙은 CLAUDE.md 「검증 게이트」에 반영했다.

**Tech Stack:** 기존과 동일. 외부 라이브러리 추가 없음.

## Global Constraints

- CLAUDE.md 최우선 제약 그대로: 원격 실DB — migrate/db push/DB 쓰기 스크립트/dev 서버 기동 금지.
- git reset/checkout/브랜치 이동/push/reflog 조작 전면 금지. 커밋만 허용.
- **소스의 런타임 동작을 바꾸지 마라.** 이번 작업에서 `lib/` 소스에 허용되는 변경은
  `// Stryker disable next-line …` 주석 추가뿐이다. 가드 삭제·리팩터링 금지.
- 들여쓰기 4칸, 한국어 "~다" 주석. 테스트 `tests/` 평면 배치.
- 완료 기준: tsc 0건 + vitest 전체 통과 + lint 0건 + 해당 모듈 stryker 100%.
- 계획서 체크박스 `[x]` 갱신·동커밋 허용 (FILES CHANGED + DEVIATIONS 선언).
- 보고서는 `docs/superpowers/reports/2026-08-30-mutation-hardening/task-<n>.md` 로
  작업 커밋과 **별도의 둘째 커밋**.

## 확정 설계 (감리자 실측 근거 — 재조사하지 마라)

감리자가 `stryker-crap-report.json` 을 파싱해 생존 뮤턴트의 정확한 위치·원본·변이를
확정했고, 각 뮤턴트가 죽일 수 있는지를 Node 로 실측 검증했다. 그 결과가 아래다.

### 죽일 수 있는 뮤턴트 (테스트로 잡아라)

| 위치 | 원본 | 변이 | 죽이는 방법 |
|---|---|---|---|
| `oauth-nonce.ts:61:13` | `!parsed?.userId` | `false` | 올바르게 서명됐지만 `userId` 가 없고 `exp` 는 미래인 payload → `null` 이어야. 가드가 없으면 `{ userId: undefined }` 를 돌려준다 |
| `oauth-nonce.ts:62:13` | `typeof parsed.exp !== 'number'` | `false` | `exp: 'abc'`(숫자 아님) → `null` 이어야. `'abc' <= now` 는 `false` 라 가드가 없으면 통과한다 |
| `oauth-nonce.ts:62:47` | `parsed.exp <= nowInSeconds()` | `parsed.exp < …` | `exp` 가 **정확히 현재 초**일 때 `null` 이어야. `vi.useFakeTimers()` + `vi.setSystemTime()` 으로 시각을 고정하라 |
| `oauth-nonce.ts:65` (catch, NoCoverage) | `catch { return null }` | `{}` | 서명은 유효하지만 payload 가 JSON 이 아닌 값(예: `not-json`) → `JSON.parse` 가 던진다 → `null` 이어야. 현재 catch 는 **한 번도 실행된 적이 없다** |
| `personal-vendors.ts:41~46` | `MEMBER_AI_MODE_LABELS` | `{}` / 각 값 `""` | 4개 모드 라벨의 **정확한 문자열**을 단언 |
| `personal-vendors.ts:48~53` | `MEMBER_AI_MODE_DESCRIPTIONS` | `{}` / 각 값 `""` | 4개 모드 설명의 **정확한 문자열**을 단언 |

### 등가 뮤턴트 (테스트로 죽일 수 없다 — 주석으로 제외하라)

감리자가 Node 로 실측한 근거다. **테스트를 비틀어 맞추려 하지 마라.**

| 위치 | 원본 | 왜 등가인가 (실측) |
|---|---|---|
| `oauth-nonce.ts:40:55` | `'utf8'` | `Buffer.from(s, '')` 는 utf8 로 폴백해 **바이트가 완전히 같다**(`Buffer.from('한글abc','').equals(Buffer.from('한글abc','utf8')) === true`) |
| `oauth-nonce.ts:48:9` | `!payload \|\| !signature` (`ConditionalExpression`, `LogicalOperator` 2개) | 가드를 없애도 `Buffer.from(undefined,'base64url')` 이 `ERR_INVALID_ARG_TYPE` 을 던지거나 길이 불일치로 걸려 **catch 가 같은 `null`** 을 낸다 |
| `oauth-nonce.ts:54:13` | `actualBuffer.length !== expectedBuffer.length` | 가드를 없애면 `timingSafeEqual` 이 `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` 를 던져 **catch 가 같은 `null`** 을 낸다 |
| `oauth-nonce.ts:61:14` | `parsed?.userId` (`OptionalChaining`) | `JSON.parse('null') === null` 이라 `parsed.userId` 는 `TypeError` → **catch 가 같은 `null`** 을 낸다 |

주의: `61행에는 죽여야 할 ConditionalExpression 과 제외할 OptionalChaining 이 함께
있다.` disable 주석에 뮤테이터 이름을 반드시 명시해 `OptionalChaining` 만 제외하라 —
`all` 로 끄면 죽여야 할 뮤턴트까지 사라져 점수가 거짓으로 100%가 된다.

---

### Task 1: `lib/oauth-nonce.ts` 뮤테이션 100%

**Files:** `tests/oauth-nonce.test.ts`(보강), `lib/oauth-nonce.ts`(주석만)

- [ ] **Step 1: RED — 실패 테스트 4개를 먼저 추가** (`tests/oauth-nonce.test.ts`).
  기존 7개 테스트는 **하나도 수정·삭제하지 마라**. 아래를 덧붙인다:
  1. `userId 가 없는 서명 payload 를 거부한다` — 기존 테스트(34~46행)의 수동 서명
     패턴을 그대로 재사용하되 payload 에서 `userId` 를 뺀다.
  2. `exp 가 숫자가 아니면 거부한다` — `exp: 'abc'`.
  3. `exp 가 정확히 현재 초면 거부한다` — `vi.useFakeTimers()`/`vi.setSystemTime()`
     으로 고정하고 `afterEach` 에서 `vi.useRealTimers()`.
  4. `payload 가 JSON 이 아니면 거부한다` — `Buffer.from('not-json','utf8')
     .toString('base64url')` 에 유효 서명을 붙인다 (catch 경로 커버).
  네 테스트 모두 `expect(verifyOAuthNonce(...)).toBeNull()` 로 단언한다
  (`toBeNull` 이어야 catch 를 `{}` 로 만든 뮤턴트가 `undefined` 로 죽는다 —
  `toBeFalsy` 로 쓰면 안 죽는다).
- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/oauth-nonce.test.ts`.
  4번은 현재 소스에서도 통과할 수 있다(정상 동작). 1·2·3 은 소스가 이미 올바르므로
  역시 통과한다 — 이 Task 의 RED 판정 기준은 vitest 가 아니라 **stryker 생존
  뮤턴트 수**다. Step 3 전후의 stryker 출력을 비교해 보고서에 담아라.
- [ ] **Step 3: 등가 뮤턴트 4곳에 disable 주석 추가** (`lib/oauth-nonce.ts`).
  형식: `// Stryker disable next-line <Mutator[,Mutator]>: <한국어 이유>`.
  이유에는 위 표의 실측 근거를 담는다. 40행 `StringLiteral`, 48행
  `ConditionalExpression,LogicalOperator`, 54행 `ConditionalExpression`,
  61행 `OptionalChaining` — **61행에 `ConditionalExpression` 을 넣지 마라.**
- [ ] **Step 4: 100% 확인** — Run:
  `npx stryker run stryker.crap.config.json --mutate lib/oauth-nonce.ts`
  → `oauth-nonce.ts | 100.00`. 미달이면 생존 뮤턴트를 보고서에 적고 보강한다.
- [ ] **Step 5: 전체 게이트 → 작업 커밋 1개**
  (`test: OAuth nonce 검증 가드를 뮤테이션으로 못 박는다`) → 보고서 커밋.

---

### Task 2: `lib/ai/personal-vendors.ts` 뮤테이션 100%

**Files:** `tests/ai-personal-vendors.test.ts`(보강)

`lib/ai/personal-vendors.ts` 는 **수정하지 않는다.** 생존 10개 전부 테스트로 죽는다.

- [ ] **Step 1: RED — 상수 단언 추가** (`tests/ai-personal-vendors.test.ts`).
  기존 테스트는 수정하지 않는다. `MEMBER_AI_MODE_LABELS` 와
  `MEMBER_AI_MODE_DESCRIPTIONS` 각각에 대해:
  - `MEMBER_AI_MODES` 4개 키가 모두 존재한다 (`ObjectLiteral → {}` 를 죽인다)
  - 4개 값이 소스의 문자열과 **정확히** 일치한다 (`StringLiteral → ""` 를 죽인다).
    값은 `lib/ai/personal-vendors.ts:42~45`, `49~52` 에서 그대로 옮긴다.
  - 어떤 값도 빈 문자열이 아니다
- [ ] **Step 2: 통과 확인** — Run: `npx vitest run tests/ai-personal-vendors.test.ts`
- [ ] **Step 3: 100% 확인** — Run:
  `npx stryker run stryker.crap.config.json --mutate lib/ai/personal-vendors.ts`
  → `personal-vendors.ts | 100.00`
- [ ] **Step 4: 선행 계획서 체크박스 정리** —
  `docs/superpowers/plans/2026-08-25-personal-ai-keys.md:243` 의 Task 2 Step 5
  체크박스를 `- [x]` 로 갱신하고, 그 줄 뒤에
  `(2026-08-30-mutation-hardening Task 2 에서 달성)` 을 덧붙인다. 같은 파일의
  나머지 열린 체크박스는 **건드리지 마라.**
- [ ] **Step 5: 전체 게이트 → 작업 커밋 1개**
  (`test: 회원 AI 모드 라벨·설명을 뮤테이션으로 못 박는다`) → 보고서 커밋.

---

## 감리 체크리스트 (Task 승인 게이트)

1. `lib/oauth-nonce.ts` 의 런타임 코드가 **한 줄도 바뀌지 않았다** (주석만 추가) —
   `git show <커밋> -- lib/oauth-nonce.ts` 로 확인
2. 61행 disable 주석에 `ConditionalExpression` 이 들어가 있지 않다 (거짓 100% 방지)
3. disable 주석 4개 모두 한국어 이유를 달고 있다 (이유 없는 disable 금지)
4. 기존 테스트 7개(oauth-nonce)가 수정·삭제되지 않았다
5. 감리자 직접 재실행: `npx stryker run stryker.crap.config.json` 전체 →
   `oauth-nonce.ts 100.00`, `personal-vendors.ts 100.00`, All files 이전(95.18%) 이상
6. tsc 0 · vitest 전체 · lint 0

## 계획 밖 (사람이 하는 일)

- 없다. 이 계획은 테스트·주석만 다루므로 실기동 검증이 필요 없다.
