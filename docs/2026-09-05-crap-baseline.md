# CRAP · 뮤테이션 기준선 (main, 2026-09-05)

측정 대상 커밋 `985a47e`. 실행: [CRAP / Mutation run #21](https://github.com/cavinseo/codetest2/actions/runs/33972939960) (`workflow_dispatch`, main).

`.github/workflows/crap.yml` 과 `scripts/crap-report.mjs` 를 미병합 브랜치
`claude/carp-inspection-46phhc` 에서 `main` 으로 옮긴 직후, **처음으로** `main` 을 잰 값이다.
그전까지 `main` 의 워크플로는 `ci.yml` 하나뿐이라 뮤테이션 점수가 떨어져도 CI 는 초록불이었다.

## 결과 요약

| 지표 | 값 |
| --- | --- |
| 뮤테이션 대상 파일 | 21 |
| 죽인 뮤턴트 / 살아남은 뮤턴트 | 966 / 15 |
| 전체 뮤테이션 점수 | **98.47%** |
| CRAP 측정 함수 | 682 |
| 커버리지 100% 함수 | 535 (78%) |
| CRAP > 30 (위험) | **12** |
| 15 < CRAP ≤ 30 (주의) | 17 |
| 최대 CRAP | 306.0 |

`Build report` 단계가 `--fail-over=30` 에 걸려 실패한다. 아래 "위험 12건" 때문이다.

## 살아남은 뮤턴트 — 기존 파일 3개

| 점수 | 죽임 | 생존 | 파일 |
| ---: | ---: | ---: | --- |
| 88.9% | 56 | 7 | `lib/import-cascade-guard.ts` |
| 90.3% | 65 | 7 | `lib/invite-code.ts` |
| 92.3% | 12 | 1 | `lib/import-json-schema.ts` |

나머지 18개 파일은 전부 100% 다. CLAUDE.md 가 경고 사례로 든 `lib/ai/personal-vendors.ts`
(100% → 68.75% 회귀)는 현재 100%(32 죽임)로 복구돼 있다.

`import-json-schema.ts:21` 의 생존 1건은 도구 한계다 — 그 뮤턴트는 모듈 로드 자체를 깨므로
실패를 귀속할 테스트가 없다(브랜치 Task 7 보고서의 결론이며 이번 측정도 같다).

## 위험 12건 — CRAP > 30

| CRAP | 복잡도 | 커버리지 | 함수 | 위치 |
| ---: | ---: | ---: | --- | --- |
| 306.0 | 17 | 0% | Arrow function | `lib/google-forms.ts:209` |
| 132.0 | 11 | 0% | `parseQfdTechnicals` | `lib/workbook-importer.ts:344` |
| 132.0 | 11 | 0% | `parseTechRoadmap` | `lib/workbook-importer.ts:434` |
| 110.0 | 10 | 0% | `parseAssets` | `lib/workbook-importer.ts:455` |
| 110.0 | 10 | 0% | `parseFundingPlans` | `lib/workbook-importer.ts:470` |
| 90.0 | 9 | 0% | `createKanoForm` | `lib/google-forms.ts:42` |
| 90.0 | 9 | 0% | `getFormResponses` | `lib/google-forms.ts:164` |
| 72.0 | 8 | 0% | `parseFundingSources` | `lib/workbook-importer.ts:491` |
| 56.0 | 7 | 0% | `buildAttributeDraftPrompts` | `lib/ai/prompts.ts:59` |
| 56.0 | 7 | 0% | `translateKanoCategory` | `lib/kano-algorithm.ts:95` |
| 42.0 | 6 | 0% | `sendSurveyInvitation` | `lib/email.ts:68` |
| 42.0 | 6 | 0% | `getCellValue` | `lib/excel-parser.ts:109` |

### 이 12건은 새로 쌓인 부채가 아니다

`claude/carp-inspection-46phhc` 브랜치의 커밋 메시지는 "위험을 12건에서 0건으로 만들어
놓아도"라고 적었는데, 지금 `main` 의 위험 수가 정확히 그 12다. 확인해 보니 위험한 6개 파일
(`google-forms`, `workbook-importer`, `ai/prompts`, `kano-algorithm`, `email`, `excel-parser`)의
내용이 `main` 과 그 브랜치에서 **바이트 단위로 동일**하다. 즉 그 브랜치는 **테스트를 더해**
위험을 없앴고, 워크플로와 마찬가지로 **그 테스트들이 병합되지 않았다.** 게이트만 옮겨 왔으므로
게이트가 원래의 부채를 그대로 비춘 것이다.

포팅 규모(참고): 브랜치 전용 테스트 5개 — `api-spec-save`(188줄), `excel-parser`(45),
`google-forms`(251), `signup-prefill`(87), `unsaved-changes`(134). 여기에 양쪽에 다 있으나
내용이 다른 테스트가 16개 더 있고, 그 차이에는 브랜치의 커버리지 작업과 `main` 의 73 커밋
변경이 섞여 있어 기계적 복사가 통하지 않는다.

## 현재 운용 방식과 남은 결정

Task 1~3 의 테스트 포팅으로 CRAP 위험을 **12 → 9 → 4 → 0** 으로 상환했다.
최대 CRAP 은 **306.0 → 132.0 → 56.0 → 29.5** 로 줄었다. 감리자가 확인한 마지막 실행은
[CRAP / Mutation run #24](https://github.com/cavinseo/codetest2/actions/runs/33980340505) 이며,
`--fail-over=30` 을 켠 채 `success` 였다. Task 1~3 은 병합 커밋 `b6f15e1` 로 `main` 에 반영됐다.

사용자 결정(2026-09-05)인 **부채를 갚을 때까지 계측기로만 둔다**는 조건이 충족돼,
`push: branches: [main]` 트리거를 더해 자동 게이트로 무장했다. 기존 `pull_request: [main]` 과
`workflow_dispatch` 도 유지한다. PR 없이 `main` 에 직접 커밋하는 이 저장소에서 이제 푸시마다
자동 실행된다. 별도 워크플로가 `ci.yml` 과 병렬로 돌아 기본 CI 를 늦추지 않는다.

임계값 `--fail-over=30` 을 낮춰 초록불을 만드는 것은 게이트 변조이므로 하지 않는다.

최대 CRAP **29.5** 는 임계값 30 에 가까우므로 새 부채가 들어오면 게이트가 실패할 수 있다.
재측정은 `main` 푸시로 자동 실행되며 GitHub Actions 에서 "CRAP / Mutation" 워크플로를
`main` 기준으로 수동 실행할 수도 있다. 결과 보고서 전문은 실행 로그 맨 끝에 실린다.
