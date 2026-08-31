# Task 3 결과 보고서 — workbook-importer 미테스트 파서 5종

## RESULT

CRAP 위험 12건 중 5건이던 `workbook-importer.ts` 의 파서 다섯이 모두 위험 목록에서
빠졌다. 다섯 함수는 전부 커버리지 0% 였는데, 기존 워크북 픽스처가 해당 시트를 넣지
않아 한 번도 실행되지 않았기 때문이다.

| 함수 | 시트 | 이전 CRAP | 이후 |
| --- | --- | ---: | --- |
| `parseQfdTechnicals` (`:344`) | `QFD` | 132.0 | 목록에서 제외 |
| `parseTechRoadmap` (`:434`) | `향후목표고객LIST` | 132.0 | 목록에서 제외 |
| `parseAssets` (`:455`) | `핵심자산과 보완자산표` | 110.0 | 목록에서 제외 |
| `parseFundingPlans` (`:470`) | `자금소요계획표` | 110.0 | 목록에서 제외 |
| `parseFundingSources` (`:491`) | `자금조달계획표` | 72.0 | 목록에서 제외 |

다섯 함수 모두 module-private 이라 **테스트를 위해 `export` 를 열지 않았다.** 공개
진입점 `parseWorkbookImport()` 에 시트 픽스처를 먹여 덮었고, 기존 `sheet()`·`workbook()`
헬퍼를 그대로 썼다.

건수만 세면 파서가 빈 배열을 돌려줘도 통과하므로 실제 필드까지 고정했다. 표본은
천 단위 쉼표가 숫자로 바뀌는지(`'1,200'` → `1200`), `보완자산` 행 이후 항목의 타입이
`COMPLEMENTARY` 로 바뀌는지, 조달계획이 연차마다 조달처·금액 두 열을 `':'` 로 묶는지다.

## FILES CHANGED

- Modify: `tests/workbook-importer.test.ts` (`it` 1건 추가, 약 80줄)

## COMMIT

- `ae9b815` — test: QFD·로드맵·자산·자금 시트 파서를 덮는다

## VERIFIED BY

게이트는 GitHub Actions `.github/workflows/phase2-verify.yml`
(run 33389364539, job 99479172891, Node 22), CRAP 재측정은 같은 push 에서 함께 돈
`crap.yml` (run 33389364514, job 99479172763)이다.

```
$ npx tsc --noEmit && echo "tsc OK"
tsc OK

$ npx vitest run
 Test Files  93 passed (93)
      Tests  1049 passed (1049)

$ npm run lint && echo "lint OK"
lint OK

$ node scripts/crap-report.mjs
| 측정 함수 | 645 |
| 커버리지 100% 함수 | 508 (79%) |
| CRAP > 30 (위험) | 0 |
| 최대 CRAP | 29.5 |
```

Task 1 기준선 1028 에서 Task 3·4·5 를 합쳐 1049 로 늘었다(줄지 않음).

### 픽스처를 CI 왕복 없이 맞춘 방법

`workbook-importer.ts` 의 런타임 의존은 `lib/id.ts`(node `crypto`)뿐이고 나머지는
타입 전용 import 라, 사본을 만들어 `node --experimental-strip-types` 로 직접 실행했다.
로컬 npm 이 막힌 환경에서도 파서 출력을 실제로 보면서 픽스처를 맞출 수 있었고,
계획이 경고한 "픽스처가 틀려 파서가 빈 배열을 돌려주는데 테스트는 통과" 를 피했다.
저장소 파일은 건드리지 않았다(사본은 스크래치패드에만 둠).

## DEVIATIONS

계획 Step 2 의 예시 픽스처를 그대로 쓰지 않고 실제 시트 모양에 맞게 고쳤다. 계획도
"출발점이지 정답이 아니다" 라고 적어 둔 부분이다. 두 곳이 달라졌다.

1. **`자금조달계획표`** — 계획 예시는 `['구분', '조달처', '금액']` 한 줄짜리였으나,
   파서는 연차마다 **두 열**(조달처·금액)을 `':'` 로 묶는다. 연차 3개 = 7열 구조로 고쳤다.
2. **`QFD`·`핵심자산과 보완자산표`** — 실제 워크북처럼 제목 행을 넣었다. 자산 시트는
   제목에 `도출표` 가 들어가야 파서가 그 행을 건너뛰는데, 계획 예시에는 없었다.

## RISKS

없다. 테스트만 추가했고 `lib/workbook-importer.ts` 는 건드리지 않았다.

## QUESTIONS

**자산 시트의 구획 제목 행이 레코드로 들어온다.** `parseAssets` 는 `필요 항목`·
`해결방안`·`도출표` 가 든 행만 건너뛰므로, `핵심자산`·`보완자산` 이라고만 적힌 구획
제목 행이 `content` 가 비어 있는 자산 항목으로 그대로 들어온다.

```
{ type: 'CORE', category: '핵심자산', content: null, order: 0 }
{ type: 'COMPLEMENTARY', category: '보완자산', content: null, order: 2 }
```

의도된 동작인지 확실하지 않아 **고치지 않고 현재 동작을 테스트로 고정만 했다.**
실제 워크북에서 구획 제목이 어떤 모양인지 확인이 필요하다. 고쳐야 한다면 별도 Task 로
다루는 편이 맞다 — 이 Task 는 커버리지 확보가 목적이고, 동작 변경은 범위를 벗어난다.
