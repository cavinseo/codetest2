# Task 1 결과 보고서 — 캐스케이드 경고의 벤치마크 분기 단언

## RESULT

`hasCascadeImpact` 의 `impact.benchmarks > 0` 항을 겨눈 뮤턴트가 죽었다.

기존 단언은 `kanoResponses` 와 `qfdMatrices` 만 확인해, 벤치마크 항이 `false` 로
바뀌어도 전체 테스트가 통과했다. 그 항이 망가지면 벤치마크만 있는 프로젝트가
"삭제될 데이터 없음"으로 판정돼 확인 절차 없이 덮어써진다. 세 항을 각각 단독으로
확인하는 단언을 더해 그 경로를 막았다.

`lib/import-cascade-guard.ts` 는 고치지 않았다. 코드는 정상이고 빠진 것은 단언이다.

| 지표 | 이전 | 이후 |
| --- | ---: | ---: |
| `import-cascade-guard.ts` 뮤테이션 점수 | 88.89% | **90.48%** |
| 죽인 뮤턴트 | 56 | **57** |
| 살아남은 뮤턴트 | 7 | **6** |
| 전체 테스트 | 1028 | 1028 |
| 전체 테스트 파일 | 91 | 91 |

전체 뮤턴트 수는 63으로 변함이 없고 생존이 하나 줄었다. 테스트 수가 그대로인 것은
새 `it` 을 만들지 않고 기존 `it('하나라도 0 이 아니면 true')` 안에 단언을 더했기
때문이다. 기준선은 직전 커밋 `b41a741` 의 테스트 파일로 되돌려 같은 잡에서 따로 쟀다.

### 남은 생존 뮤턴트 6건 (이 Task 의 범위 밖 — 계획 Task 6)

| 위치 | 원본 → 치환 | 분류 |
| --- | --- | --- |
| `:50` ×2, `:51` ×2 | `{ where: { projectId } }` → `{ where: {} }` | mock 흡수 |
| `:65` | `parts.join(', ')` → `parts.join("")` | 표시 문자열 |
| `:27` | `EMPTY_CASCADE_IMPACT` 객체 → `{}` | 표시/상수 |

`:50`·`:51` 은 테스트의 `CascadeCounter` 스텁이 인자를 보지 않아 살아남는다. 설정
주석이 "라우트 핸들러는 mock 이 뮤턴트를 흡수한다"고 밝힌 현상이 대상 파일 안에서
일어나는 사례이며, 계획 Task 6 Step 3 에서 인자 단언으로 처리한다.

## FILES CHANGED

- Modify: `tests/import-cascade-guard.test.ts` (단언 1건 + 이유 주석 2줄)

## COMMIT

- `9248b0f` — test: 캐스케이드 경고의 벤치마크 분기를 단언한다

## VERIFIED BY

측정 환경은 GitHub Actions `.github/workflows/phase1-verify.yml`
(run 33388101281, job 99475203811, Node 22)이다. 로컬은 npm 레지스트리가 조직 egress
정책으로 차단돼 설치가 되지 않는다.

```
$ npx vitest run          # 기준선 — b41a741 의 테스트 파일로 되돌린 상태
      Tests  1028 passed (1028)

$ npx tsc --noEmit && echo "tsc OK"
tsc OK

$ npx vitest run          # Task 1 적용 후
      Tests  1028 passed (1028)

$ npm run lint && echo "lint OK"
lint OK

$ npx next lint
✔ No ESLint warnings or errors

$ npx stryker run stryker.crap.config.json --mutate lib/import-cascade-guard.ts
 import-cascade-guard.ts |  90.48 |   90.48 |       57 |         0 |          6 |        0 |        0 |
```

`:34` 의 `ConditionalExpression` 생존이 목록에서 사라진 것을 clear-text 출력에서
확인했다.

## DEVIATIONS

1. **기준선 측정 방식.** 계획 Step 1 은 "착수 전 `npx vitest run`" 이었으나 로컬에서
   설치가 불가능하다. 같은 CI 잡 안에서 `git checkout b41a741 -- tests/import-cascade-guard.test.ts`
   로 되돌려 재고, 원복 후 다시 쟀다. 결과적으로 이전·이후를 같은 환경에서 비교했다.
2. **임시 검증 워크플로 추가 후 제거.** `ci.yml` 은 `main`·PR 에서만 돌아 기능
   브랜치의 변경을 검증할 경로가 없다. `.github/workflows/phase1-verify.yml` 을
   만들어 게이트를 돌린 뒤 제거했다. 계획에 없던 파일이지만 검증 수단이며 산출물이
   아니다.

## RISKS

없다. 테스트에 단언 한 줄을 더한 변경이며 프로덕션 코드는 건드리지 않았다.

## QUESTIONS

없다.
