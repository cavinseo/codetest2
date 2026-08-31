# Task 7 결과 보고서 — 남은 두 건 규명

## RESULT

### Step 1 — `import-json-schema.ts:21` 생존 원인: **도구 한계, 테스트 공백 아님**

계획은 "예상과 어긋나므로 테스트 공백으로 단정하지 않는다" 고 적었다. 그 파일만
따로 돌려 실행을 직접 봤고, 근거는 다음과 같다.

**1. 이 파일의 뮤턴트는 13개 전부가 static mutant 다.** 스트라이커가 스스로 그렇게
분류한다.

```
WARN MutantTestPlanner Detected 13 static mutants (100% of total) …
  You might want to enable "ignoreStatic" …
```

`importJsonSchema` 는 모듈 최상위에서 `z.object({ … })` 를 조립하므로, 이 파일의
코드는 테스트 실행 중이 아니라 **모듈 로드 시점에** 돈다.

**2. 그런데 13개 중 12개는 죽었다.** 즉 "static 이라서 못 죽인다" 는 설명은 틀렸다.

```
 import-json-schema.ts |  92.31 |   92.31 |  12 killed | 0 timeout | 1 survived | 0 no cov |
```

**3. 살아남은 하나는 모듈 평가 자체를 깨는 유일한 뮤턴트다.**

```
- const rows = <T extends z.ZodTypeAny>(schema: T) => z.array(schema).max(MAX_IMPORT_ROWS);
+ const rows = () => undefined;
```

`rows(...)` 는 `z.object({ … })` 안에서 7번 불린다. 뮤턴트가 켜지면 `rows(requirementRow)`
가 `undefined` 이므로 이어지는 `.optional()` 에서 TypeError 가 나고 **모듈이 로드되지
않는다.** 스트라이커는 `Ran all tests for this mutant.` 를 남기고 Survived 로 적었다 —
로드되지 못한 모듈에서는 실패로 귀속할 테스트가 없었다는 뜻이다.

**4. 행수 상한 자체는 이미 단언돼 있다.** `tests/api-import-json-guards.test.ts:138` 이
`MAX_IMPORT_ROWS + 1` 행을 보내 400 과 상한값 문구를 확인한다. 즉 이 생존은 검증
공백이 아니라 측정 도구의 한계다.

**조치하지 않는다.** `ignoreStatic: true` 를 켜면 이 하나와 함께 **실제로 죽고 있는
12개까지 측정에서 빠진다.** 순손실이라 그대로 두고 기록만 남긴다.

### Step 2 — `oauth-nonce` payload 형태 가드

| 지표 | 이전 | 이후 |
| --- | ---: | ---: |
| 뮤테이션 점수 | 80.85% | **89.36%** |
| 죽인 뮤턴트 | 38 | **42** |
| 살아남은 뮤턴트 | 9 | **5** |

테스트 4건으로 겨눈 뮤턴트 4개가 모두 죽었다.

| 죽인 뮤턴트 | 어떻게 |
| --- | --- |
| `:65` catch 블록 (NoCoverage 였음) | 서명은 맞지만 JSON 이 아닌 payload 로 진입 |
| `:61` `!parsed?.userId` → `false` | userId 가 빠진 정상 서명. 뮤턴트는 `{ userId: undefined }` 를 돌려준다 |
| `:62` `typeof parsed.exp !== 'number'` → `false` | exp 가 문자열. 뮤턴트는 JS 가 숫자로 바꿔 비교해 통과시킨다 |
| `:62` `parsed.exp <= nowInSeconds()` → `<` | `vi.setSystemTime` 으로 exp 를 현재 시각과 같게 맞춘 경계값 |

**만료 검증 자체는 원래도 정상이었고 건드리지 않았다.** 이번에 덮은 것은 서명 검증을
통과한 뒤의 형태 계약이다. 공격자는 HMAC 을 위조할 수 없으므로 지금 악용 가능한
취약점은 아니었고, payload 구조를 손대는 리팩터링에 대한 안전망이다.

### Step 3 — 남은 5건은 등가 뮤턴트다

테스트로 죽일 수 없다. 없애려면 코드를 고쳐야 하는데 그것은 이 계획의 범위가 아니다.

| 위치 | 원본 → 치환 | 왜 등가인가 |
| --- | --- | --- |
| `:40` | `'utf8'` → `""` | Node 는 falsy 인코딩을 utf8 로 처리한다 |
| `:48` | `!payload \|\| !signature` → `false` | 가드를 지워도 뒤에서 `Buffer.from(undefined, …)` 가 던져 catch 가 같은 `null` 을 낸다 |
| `:48` | `\|\|` → `&&` | 위와 같은 이유로 결과가 같다 |
| `:54` | `actualBuffer.length !== expectedBuffer.length` → `false` | 길이가 다르면 `timingSafeEqual` 이 던지고 catch 가 같은 `null` 을 낸다 |
| `:61` | `parsed?.userId` → `parsed.userId` | `parsed` 가 null 이면 TypeError 가 나고 catch 가 같은 `null` 을 낸다 |

넷은 모두 "가드를 지워도 catch 가 같은 결과를 낸다" 는 같은 구조다. 이 가드들은
**중복 방어**이며, 없애도 동작은 같지만 의도가 드러나므로 남겨 두는 편이 낫다.

계획 Step 3 이 지목한 다른 두 건도 그대로 기록만 한다.

- `lib/oauth-nonce.ts:40` — 위 표와 같다.
- `lib/invite-code.ts:34` `value.trim()` → `value` — 뒤의 `.replace(/[^A-Z0-9]/g, '')`
  가 공백을 이미 지워 `trim()` 이 무의미하다. **죽은 코드로 보이지만 지우지 않는다**
  (AGENTS.md — 그 밖의 죽은 코드는 삭제하지 말고 보고한다).

## FILES CHANGED

- Modify: `tests/oauth-nonce.test.ts` (헬퍼 1개, `it` 4건)
- Modify: `.github/workflows/phase3-verify.yml` (조사용 단계 2개, 임시)

## COMMIT

- `21e5b81` — test: oauth-nonce payload 형태 가드를 단언한다
- (같은 푸시) chore: 임시 워크플로에 Task 7 조사 단계를 붙인다

## VERIFIED BY

GitHub Actions `.github/workflows/phase3-verify.yml` (run 33393924440,
job 99493815436, Node 22), 커밋 `21e5b81` 기준이다.

```
$ npx tsc --noEmit && echo "tsc OK"
tsc OK

$ npx vitest run
 Test Files  93 passed (93)
      Tests  1054 passed (1054)

$ npm run lint && echo "lint OK"
lint OK

$ npx stryker run stryker.crap.config.json --mutate lib/oauth-nonce.ts
 oauth-nonce.ts |  89.36 |   89.36 |  42 killed | 0 timeout | 5 survived | 0 no cov |

$ npx stryker run stryker.crap.config.json --mutate lib/import-json-schema.ts
WARN MutantTestPlanner Detected 13 static mutants (100% of total) …
 import-json-schema.ts |  92.31 |   92.31 |  12 killed | 0 timeout | 1 survived | 0 no cov |
```

테스트는 Task 6 시점 1050 에서 1054 로 늘었다.

## DEVIATIONS

계획 Step 1 은 "HTML 리포터를 켜면 뮤턴트별 상태를 볼 수 있다" 고 적었으나, HTML
리포트는 아티팩트로만 나오고 이 환경에서는 blob 저장소가 차단돼 내려받을 수 없다.
대신 clear-text 출력을 그대로 로그에 실어 같은 정보를 얻었다. 오히려 스트라이커의
static mutant 경고가 여기에만 나와 원인 규명에는 이쪽이 나았다.

## RISKS

없다. 테스트만 추가했고 프로덕션 코드는 건드리지 않았다.

## QUESTIONS

없다. 계획이 규명하라고 지목한 두 건 모두 결론에 도달했다.

다만 Step 1 에서 드러난 **static mutant 라는 개념 자체는 앞으로 대상을 넓힐 때 다시
만난다.** 모듈 최상위에서 스키마·상수를 조립하는 파일(`import-json-schema.ts`,
`bulk-save-schemas.ts` 등)은 뮤턴트가 전부 static 이 되고, 그중 모듈 평가를 깨는
종류는 구조적으로 Survived 로 남는다. 점수를 볼 때 이 점을 감안해야 한다.
