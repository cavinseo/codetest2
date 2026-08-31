# Task 5 결과 보고서 — 잔여 CRAP 위험 4건

## RESULT

남은 위험 4건을 덮어 **CRAP > 30 인 함수가 0건**이 됐다. 계획 Phase 2 의 목표를
달성했다.

| 함수 | 이전 CRAP | 한 일 |
| --- | ---: | --- |
| `lib/kano-algorithm.ts:95` `translateKanoCategory` | 56.0 | 7분기 전수 단언 |
| `lib/ai/prompts.ts:59` `buildAttributeDraftPrompts` | 56.0 | 채운 경우·빈 경우 2건 |
| `lib/email.ts:68` `sendSurveyInvitation` | 42.0 | 이스케이프·비노출 3건 |
| `lib/excel-parser.ts:109` `getCellValue` | 42.0 | 경계 조건 4건 |

### 전체 지표

| 지표 | 점검 시점 | Phase 2 이후 |
| --- | ---: | ---: |
| 측정 함수 | 645 | 645 |
| 커버리지 100% 함수 | 494 (77%) | **508 (79%)** |
| **CRAP > 30 (위험)** | **12** | **0** |
| 15 < CRAP ≤ 30 (주의) | 17 | 17 |
| 최대 CRAP | 306.0 | **29.5** |
| 테스트 | 1028 (91파일) | **1049 (93파일)** |
| 뮤테이션 점수 | 95.18% | **95.32%** (죽임 672 / 생존 33) |

뮤테이션 점수가 오른 것은 Task 1 의 효과다. Phase 2 는 뮤테이션 대상 목록을 건드리지
않았으므로(그건 Task 6), 여기서 추가된 테스트는 대상 15개 파일 밖이라 점수에 반영되지
않는다.

### 각 항목에서 실제로 고정한 것

- **`translateKanoCategory`** — `M`·`O`·`A`·`I`·`R`·`Q` 여섯과 기본값. 화면과 보고서에
  그대로 나가는 라벨이라 값을 직접 단언했다. 한 분기가 틀려도 계산은 정상이라
  드러나지 않는 자리다.
- **`getCellValue`** — 1-indexed 좌표를 0-indexed 배열로 바꾸는 곳이라 경계를 한 칸
  틀려도 예외가 나지 않는다. 0 이하·행 초과·열 초과, 그리고 **행마다 길이가 다를 때
  그 행의 길이를 기준으로 자르는지**를 덮었다. 시트 전체 `colCount` 를 기준으로 삼으면
  `undefined` 를 값처럼 돌려주게 된다.
- **`sendSurveyInvitation`** — 프로젝트 이름은 편집 권한자가 정하는데 이 메일은 외부
  응답자에게 나간다. 본문의 마크업이 이스케이프되는지, 제목에서 개행이 사라지는지,
  그리고 `lib/logger.ts` 규칙대로 **수신자 주소와 설문 링크(비밀 토큰)가 로그에
  남지 않는지**를 성공·미설정·거부 세 경로에서 확인했다.
- **`buildAttributeDraftPrompts`** — 계획대로 가볍게 잡았다. 분기가 없고 `??` 6개뿐이라
  CRAP 56 은 구조적으로 부풀려진 값이었다. 값 전체를 고정하지 않고, 답변이 비었을 때
  `undefined`·`null` 이 프롬프트에 찍히지 않는지만 본다 — 그것이 모델에 실제로 해가
  되는 유일한 실패다.

## FILES CHANGED

- Modify: `tests/kano-algorithm.test.ts` (import 1줄, `it` 1건)
- Create: `tests/excel-parser.test.ts` (`it` 4건)
- Modify: `tests/email-send.test.ts` (import 1줄, `describe` 1개 / `it` 3건)
- Modify: `tests/ai-spec-draft.test.ts` (import 1줄, `describe` 1개 / `it` 2건)

## COMMIT

- `ac80a44` — test: 남은 CRAP 위험 네 함수를 덮는다

## VERIFIED BY

게이트는 `.github/workflows/phase2-verify.yml` (run 33389364539, job 99479172891,
Node 22), CRAP·뮤테이션 재측정은 `crap.yml` (run 33389364514, job 99479172763)이다.

```
$ npx tsc --noEmit && echo "tsc OK"
tsc OK

$ npx vitest run
 Test Files  93 passed (93)
      Tests  1049 passed (1049)

$ npm run lint && echo "lint OK"
lint OK

$ npm run build
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

$ node scripts/crap-report.mjs
| 측정 함수 | 645 |
| 커버리지 100% 함수 | 508 (79%) |
| CRAP > 30 (위험) | 0 |
| 15 < CRAP ≤ 30 (주의) | 17 |
| 최대 CRAP | 29.5 |

CRAP 이 30 을 넘는 함수는 없다.
```

## DEVIATIONS

`buildAttributeDraftPrompts` 테스트를 새 파일이 아니라 `tests/ai-spec-draft.test.ts` 에
넣었다. 그 파일이 이미 `lib/ai/prompts.ts` 의 `buildSpecDraftPrompts` 를 다루고 있어,
같은 모듈의 테스트를 두 파일로 나눌 이유가 없다.

## RISKS

없다. 네 항목 모두 테스트만 추가했고 프로덕션 코드는 건드리지 않았다.

## QUESTIONS

없다. Phase 2 에서 발견한 동작 관련 문의는 Task 3(자산 시트 구획 제목 행)과
Task 4(`getKanoTopic` 문항 깨짐, 빠진 답변의 `NEUTRAL` 대체) 보고서에 있다.
