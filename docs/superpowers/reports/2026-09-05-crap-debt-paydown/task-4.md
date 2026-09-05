# Task 4 결과 보고서

## RESULT

PASS. `main` push에서 CRAP / Mutation 워크플로가 자동 실행되도록 트리거를 추가했다. 작업 커밋 `4e6a51d`의 자동 실행 #26은 `event: push`, `conclusion: success`이며 CRAP 위험 0과 최대 29.5를 확인했다. 로컬 타입·lint와 전체 107파일·1,227개 테스트가 통과했다.

## FILES CHANGED

- `.github/workflows/crap.yml`: 기존 D-3 주석을 보존하고 이유 주석 2줄과 main push 트리거 2줄을 추가했다.
- `docs/2026-09-05-crap-baseline.md`: “현재 운용 방식과 남은 결정” 절에 Task 1~3 상환, 병합 `b6f15e1`, 위험 0·최대 29.5와 자동 실행 상태를 기록했다.
- `docs/superpowers/plans/2026-09-05-crap-debt-paydown.md`: Task 4 Step 1·2 체크박스만 완료 처리했다.
- 이 결과 보고서를 별도 문서 커밋으로 추가한다.

## COMMIT

- 기준: `b6f15e18ae8c00772e5b1e43bdb9ef11cddf7e23`.
- 작업: `4e6a51d8ebb028202dc478cb68d855b2f24d5311` — `ci: main 푸시에 CRAP 게이트를 자동 실행한다`.
- 보고서: 이 문서를 포함하는 둘째 커밋 `docs: Task 4 결과 보고서`다. 자기 커밋 해시는 본문에 선기록할 수 없어 완료 채팅에서 알린다.

## VERIFIED BY

### 시작 기준과 보존

`git fetch origin`, `git checkout main` 뒤 오래된 main에서 측정 산출물 3개가 미추적으로 나타나 중단·보고했다. 사용자 승인 후 `git reset --hard origin/main`을 실행했다.

```text
HEAD is now at b6f15e1 Merge: CRAP 위험 12건 상환 (Task 1~3)
## main...origin/main
```

`crap-report.json`, `crap-report.md`, `eslint-complexity.json`은 삭제하지 않았고 동기화된 .gitignore의 기존 규칙으로 무시된다.

### 워크플로 변경 원문

`git diff b6f15e1 HEAD -- .github/workflows/crap.yml`.

```text
diff --git a/.github/workflows/crap.yml b/.github/workflows/crap.yml
index 901cc53..7550c87 100644
--- a/.github/workflows/crap.yml
+++ b/.github/workflows/crap.yml
@@ -5,7 +5,11 @@ name: CRAP / Mutation
 #
 # PR 에서만 도는 이유(D-3): 회귀는 결국 코드가 main 으로 들어올 때 생기고 그 관문이
 # PR 이다. ci.yml 에 합치면 모든 푸시가 약 4분 길어지는데, 거기서 얻는 것이 없다.
+# 이 저장소는 PR 없이 main 에 직접 커밋하므로 PR 트리거만으로는 돌지 않아 push 를 더한다.
+# 별도 워크플로로 ci.yml 과 병렬 실행되므로 기본 CI 를 늦추지 않는다.
 on:
+  push:
+    branches: [main]
   pull_request:
     branches: [main]
   workflow_dispatch:
```

기존 의존성 `js-yaml`로 YAML을 파싱하여 on 객체가 `push: { branches: ['main'] }, pull_request: { branches: ['main'] }, workflow_dispatch: null`과 동일한지 검증했다. Git 원본의 `permissions:`부터 EOF까지 줄바꿈 정규화 후 문자열 비교도 통과했다.

```text
YAML triggers PASS; permissions/jobs suffix unchanged
```

`grep -n "fail-over" .github/workflows/crap.yml` 원문이다.

```text
77:      # --fail-over=30 은 CRAP 원 논문의 기준선이다. Phase 2 에서 위험을 0건으로
82:        run: node scripts/crap-report.mjs --fail-over=30
```

`git diff --check`와 금지 경로 diff는 빈 출력이었다. 변경 파일은 작업 커밋의 세 파일뿐이다.

### 게이트 3종

`npx tsc --noEmit`.

```text
(stdout/stderr 출력 없음, exit code 0)
```

`npx vitest run`.

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.5 E:/Dropbox/codetest2


 Test Files  107 passed (107)
      Tests  1227 passed (1227)
   Start at  02:44:11
   Duration  4.42s (transform 7.68s, setup 0ms, import 22.58s, tests 5.51s, environment 13ms)
```

종료 코드 0이다.

`npx next lint`.

```text
`next lint` is deprecated and will be removed in Next.js 16.
For new projects, use create-next-app to choose your preferred linter.
For existing projects, migrate to the ESLint CLI:
npx @next/codemod@canary next-lint-to-eslint-cli .

✔ No ESLint warnings or errors
```

종료 코드 0이다.

### main push와 자동 실행

`git push origin main`.

```text
To https://github.com/cavinseo/codetest2.git
   b6f15e1..4e6a51d  main -> main
```

`gh run watch 33981952694 --exit-status --interval 30`은 종료 코드 0이었다. 잡은 2분 18초에 완료됐고 Coverage·Mutation testing·Build report를 포함한 모든 단계가 통과했다.

`gh run view 33981952694 --json number,url,event,headSha,status,conclusion`.

```text
{"conclusion":"success","event":"push","headSha":"4e6a51d8ebb028202dc478cb68d855b2f24d5311","number":26,"status":"completed","url":"https://github.com/cavinseo/codetest2/actions/runs/33981952694"}
```

자동 실행은 [CRAP / Mutation #26](https://github.com/cavinseo/codetest2/actions/runs/33981952694)이다.

`gh run view 33981952694 --log | Select-String -Pattern 'CRAP > 30|최대 CRAP|CRAP 이 30|측정 함수|커버리지 100% 함수|15 < CRAP' | Select-Object -Last 7`.

```text

CRAP index / Mutation score	UNKNOWN STEP	2026-09-05T17:47:55.2727715Z | 측정 함수 | 682 |
CRAP index / Mutation score	UNKNOWN STEP	2026-09-05T17:47:55.2727931Z | 커버리지 100% 함수 | 549 (80%) |
CRAP index / Mutation score	UNKNOWN STEP	2026-09-05T17:47:55.2728151Z | CRAP > 30 (위험) | 0 |
CRAP index / Mutation score	UNKNOWN STEP	2026-09-05T17:47:55.2728356Z | 15 < CRAP ≤ 30 (주의) | 17 |
CRAP index / Mutation score	UNKNOWN STEP	2026-09-05T17:47:55.2728564Z | 최대 CRAP | 29.5 |
CRAP index / Mutation score	UNKNOWN STEP	2026-09-05T17:47:55.2728757Z CRAP 이 30 을 넘는 함수는 없다.
CRAP index / Mutation score	UNKNOWN STEP	2026-09-05T17:47:55.2729132Z ### 주의 — 15 < CRAP ≤ 30
```

로그 요약 표의 값이다.

| 지표 | 값 |
| --- | --- |
| 측정 함수 | 682 |
| 커버리지 100% 함수 | 549 (80%) |
| CRAP > 30 (위험) | 0 |
| 15 < CRAP ≤ 30 (주의) | 17 |
| 최대 CRAP | 29.5 |

보고서는 위 작업 커밋의 성공을 확인한 뒤 작성했다. 이 문서를 둘째 커밋으로 push한 후 원격 main과 작업 트리 상태를 최종 확인한다.

## DEVIATIONS

- 이전 Task 산출물이 오래된 로컬 main에서 미추적으로 표시되어 사용자에게 중단 보고하고 재승인받았다. 파일을 보존한 채 요청된 동기화를 마쳤다.
- 선택적 YAML 검사에서 `yaml` 패키지는 없었으므로 이미 설치된 `js-yaml`을 사용했다. 의존성 파일은 변경하지 않았다.
- 사용자 지시대로 작업 커밋을 먼저 push해 자동 실행을 검증했다. 스킬의 기본 push 제한보다 명시된 사용자 계약을 우선했다.

## RISKS

- 최대 CRAP 29.5가 임계값 30에 가까우므로 새 부채가 들어오면 검사가 실패할 수 있다.
- 이 트리거는 push 이후 검사다. 직접 push 자체를 차단하는 브랜치 보호 설정은 이번 변경에 포함되지 않는다.
- CI에서 기존 v4 Actions의 Node.js 20 런타임 폐기 예정 경고가 표시됐지만 run은 성공했다. 계약상 Actions 버전은 수정하지 않았다.
- 기존 사용자 워크시트 변경을 보관한 `stash@{0}`은 그대로 남아 있다.

## QUESTIONS

- 없다.

