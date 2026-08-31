# Task 6 결과 보고서 — 뮤테이션 대상 확대와 표시 문자열 정책

## RESULT

대상을 15개에서 21개로 넓히고, D-1 결정에 따라 UX 카피를 제외했으며, mock 이 흡수하던
뮤턴트를 단언으로 잡았다.

| 지표 | 이전 | 이후 |
| --- | ---: | ---: |
| 대상 파일 | 15 | **21** |
| 죽인 뮤턴트 | 672 | **870** |
| 살아남은 뮤턴트 | 33 | 44 |
| 측정된 뮤턴트 총계 | 705 | **914** |
| 전체 뮤테이션 점수 | 95.32% | 95.19% |
| 100% 파일 | 10 / 15 | **13 / 21** |

**점수는 0.13%p 내렸지만 측정 면적이 30% 늘었다.** 새로 넣은 여섯 모듈은 그동안 한
번도 측정되지 않았고, 그 안에서 나온 생존이 이번 Task 의 실제 산출물이다.

### 기존 대상에서 개선된 것

| 파일 | 이전 | 이후 | 이유 |
| --- | ---: | ---: | --- |
| `lib/ai/personal-vendors.ts` | 68.8% | **100%** | UX 카피 10건 제외 (D-1) |
| `lib/import-cascade-guard.ts` | 90.5% | **100%** | 조회 범위·구분자·상수 단언 (Step 2·3) |
| `lib/invite-code.ts` | 90.3% | **97.0%** | 문구 5건 제외, 2건 잔존 |

`import-cascade-guard.ts` 가 100% 가 된 과정에서 **왜 살아남았는지가 흥미로웠다.**

- `EMPTY_CASCADE_IMPACT` — 기존 테스트가 `expect(impact).toEqual(EMPTY_CASCADE_IMPACT)`
  로 **상수 자신과 비교**하고 있었다. 상수가 `{}` 가 되면 반환값도 `{}` 라 양쪽이 같이
  비어 통과한다. 값을 직접 적어 끊었다.
- `', '` 구분자 — `toContain('Kano 설문 응답 12건')` 과 `toContain('QFD 관계 4건')` 은
  구분자가 사라져도 각각 통과한다. 이어진 형태로 단언해 잡았다.
- `{ where: { projectId } }` 4건 — 스텁이 인자를 보지 않아 흡수됐다. `benchmark`·
  `qFDMatrix` 조회의 인자를 단언해 잡았다. 실제로는 **다른 프로젝트의 건수까지 세게
  되는** 변형이다.

### 새로 측정된 여섯 모듈

| 파일 | 점수 | 죽임 | 생존 |
| --- | ---: | ---: | ---: |
| `lib/bulk-save-schemas.ts` | **65.5%** | 19 | 10 |
| `lib/rate-limit.ts` | **76.5%** | 39 | 12 |
| `lib/settings-crypto.ts` | **85.4%** | 35 | 6 |
| `lib/qfd-benchmark-guards.ts` | 93.3% | 28 | 2 |
| `lib/upload-guard.ts` | 95.8% | 46 | 2 |
| `lib/password-policy.ts` | **100%** | 25 | 0 |

2026-08-20 종합검진은 이 모듈들을 "코어 인프라 상급 품질" 로 평가했다. 그 평가는 코드를
읽어 내린 것이었고, 뮤테이션은 **테스트가 그 코드를 실행하기는 하지만 산술과 상수를
단언하지는 않는다**는 것을 보여준다. 셋은 그대로 두기 아깝다.

## FILES CHANGED

- Modify: `stryker.crap.config.json` (대상 6개 추가, 들여쓰기 정렬)
- Modify: `lib/ai/personal-vendors.ts` (`Stryker disable` 주석, 두 상수 맵)
- Modify: `lib/invite-code.ts` (`Stryker disable` 주석, 메시지 맵)
- Modify: `tests/import-cascade-guard.test.ts` (단언 5건 추가·1건 수정, `describe` 1개)
- Modify: `docs/superpowers/plans/2026-08-27-crap-remediation.md` (D-1 결정 기록)

## COMMIT

- `79c0029` — chore: 뮤테이션 대상을 순수 모듈 21개로 넓힌다
- `7d6188d` — chore: UX 카피 상수를 뮤테이션 대상에서 뺀다 (D-1 결정)
- `f664a2f` — test: 캐스케이드 가드의 조회 범위와 경고 문구를 단언한다
- `7c49555` — docs: D-1 결정을 계획서에 기록한다

## VERIFIED BY

게이트는 `.github/workflows/phase3-verify.yml` (run 33391768846, job 99486822228,
Node 22), 재측정은 `crap.yml` (run 33391768936, job 99486822469)이다. 둘 다 커밋
`7c49555` 기준이다.

```
$ npx tsc --noEmit && echo "tsc OK"
tsc OK

$ npx vitest run
 Test Files  93 passed (93)
      Tests  1050 passed (1050)

$ npm run lint && echo "lint OK"
lint OK

$ node scripts/crap-report.mjs
| 대상 파일 | 21 |
| 죽인 뮤턴트 | 870 |
| 살아남은 뮤턴트 | 44 |
| 전체 뮤테이션 점수 | 95.19% |

| CRAP > 30 (위험) | 0 |
| 최대 CRAP | 29.5 |
```

`import-cascade-guard.ts` 의 단언 5건은 푸시 전에 `node --experimental-strip-types` 로
모듈 사본을 실행해 확인했다.

## DEVIATIONS

**`lib/google-forms.ts` 를 대상에 넣지 않았다.** 계획 Step 1 은 "Task 4 가 끝났다면
함께 넣을 수 있다" 고 적었다. Task 4 로 순수 모듈 요건은 갖췄으나, 설문 설명 같은 긴
UX 카피가 **이름 있는 상수가 아니라 함수 안 인라인 문자열**로 들어 있다. 방금 정한
D-1 원칙을 적용하려면 문자열마다 위치를 잡아 주석을 넣어야 해서, 이번 Task 에 섞으면
정책 적용이 두 갈래가 된다. 별도로 다루는 편이 낫다고 판단했다.

## RISKS

`// Stryker disable all` 은 `restore` 를 만날 때까지 유효하다. 세 곳 모두 `restore` 를
짝지어 뒀지만, 나중에 그 사이에 코드를 넣으면 조용히 측정에서 빠진다. 상수 맵 바로
위·아래로 범위를 좁혀 두었고 주석에 이유를 적었으나, 구조적으로 취약한 방식인 것은
사실이다.

## QUESTIONS

계획 Step 4 는 "목적은 100% 달성이 아니라 현재값 파악" 이라고 못박았으므로 아래는
**이번 Task 에서 잡지 않고** 다음 계획의 입력으로 올린다. 위험도 순이다.

### Q-1. 설정 암호화의 salt 가 어떤 테스트에도 고정돼 있지 않다

```ts
const key = scryptSync(source, 'ks-qfd-service-settings', 32);
```

`lib/settings-crypto.ts:32` 의 salt 를 `""` 로 바꿔도 전부 통과한다. 테스트가 같은
실행 안에서 암호화하고 복호화하므로 salt 가 무엇이든 일관되기만 하면 되기 때문이다.

**실제로 이 값이 바뀌면 이미 저장된 SMTP 비밀번호와 API 키를 복호화할 수 없다.**
되돌릴 방법도 없다. 리팩터링 중 무심코 바뀌어도 CI 는 green 이다. 상수를 고정하는
단언 한 줄이면 막힌다.

같은 파일에서 `:52` 의 `!stored.startsWith(PREFIX)`(암호화된 값인지 판별)와 `:30`·`:69`
의 키 캐시 무효화도 단언되지 않았다.

### Q-2. 레이트리밋의 재시도 대기 계산이 통째로 미검증이다

`lib/rate-limit.ts:53` 에서 네 뮤턴트가 모두 살아남았다.

| 원본 | 치환 |
| --- | --- |
| `Math.max(1, …)` | `Math.min(1, …)` |
| `(oldest + rule.windowMs - now) / 1000` | `… * 1000` |
| `oldest + rule.windowMs - now` | `oldest + rule.windowMs + now` |
| `oldest + rule.windowMs` | `oldest - rule.windowMs` |

`retryAfterSeconds` 는 거부된 사용자에게 돌려주는 값이다. 지금은 **어떤 값이 나와도
테스트가 통과한다.** 또 `:26` 의 `SIGNUP_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 3 }`
도 `{}` 로 바뀌어 살아남는다 — 회원가입 제한 규칙이 단언되지 않았다는 뜻이다
(로그인 규칙 `:25` 는 죽었다).

`:48` 의 `store.set(key, hits)` 제거도 살아남는데, 이쪽은 거부 분기에서 만료된 기록을
솎아 다시 쓰는 부분이라 만료가 일어나야 차이가 드러난다. 앞의 둘보다는 가볍다.

### Q-3. bulk-save 스키마의 필드 목록이 단언되지 않는다

`lib/bulk-save-schemas.ts` 의 `z.object({ … })` 를 `z.object({})` 로 바꿔도 통과한다
(6곳). zod 의 기본 동작이 모르는 키를 버리는 것이라, 필드가 없는 스키마도 파싱에는
성공하기 때문이다. **대량 저장 입력 검증이 사실상 비어도 테스트는 모른다.**
`z.string().trim()` 에서 `.trim()` 을 빼는 뮤턴트 2건도 살아남는다.

### Q-4. `// Stryker disable` 방식의 대안

RISKS 에 적은 구조적 취약함 때문에, 문구 상수를 별도 파일(예: `lib/ai/labels.ts`)로
옮기고 그 파일을 `mutate` 목록에서 빼는 방법도 있다. 파일 단위라 범위가 새지 않는다.
다만 파일이 늘고 import 가 바뀌므로, 지금 할 일인지는 판단이 필요하다.
