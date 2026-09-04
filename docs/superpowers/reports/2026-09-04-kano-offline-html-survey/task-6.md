# Task 6 결과 보고서

## RESULT

계획서(`docs/superpowers/plans/2026-09-04-kano-offline-html-survey.md`) Task 6의 Step 0~5를 완료했다. Task 5 라우트의 append 정책과 파일 10개 경계를 지키는 회귀 테스트를 먼저 보강한 뒤, 브라우저용 순수 모듈과 테스트를 만들고 오프라인 HTML 내려받기·답변 파일 배치 업로드·오프라인 초대 라벨을 화면에 연결했다.

파일을 선택하면 순수 모듈이 HTML 응답 섬 또는 JSON 형식과 프로젝트를 사전 판정한다. 업로드는 10개씩 순차 실행하며 서버의 배치 내부 실패 인덱스를 전체 파일 인덱스로 바꿔 표시한다. 질문 세트 변경과 기존 외부 응답자 충돌은 사용자가 안내를 읽고 각각 부분 수입 또는 파일별 덮어쓰기를 명시적으로 선택해야 재전송한다. 새 화면은 모두 `NEXT_PUBLIC_KANO_OFFLINE_SURVEY=on`일 때만 노출된다.

## FILES CHANGED

- `tests/api-kano-offline-responses.test.ts` — append 정책과 정확히 10개인 배치를 지키는 회귀 테스트 두 개를 추가했다.
- `lib/kano-offline-upload-client.ts` — 브라우저에서 쓰는 파일 사전검사, 10개 배치 분할, 절대 파일 인덱스 계산을 추가했다.
- `tests/kano-offline-upload-client.test.ts` — 판정 결과, 응답 섬 선택, 배치 경계, 인덱스와 서버 형식 상수 일치를 검증했다.
- `components/project/KanoManager.tsx` — 내려받기 링크, 파일 사전검사 목록, 순차 배치 업로드, 충돌·실패 결과와 오프라인 초대 표시를 연결했다.
- `components/KanoSurveyPreview.tsx` — 오프라인 HTML 링크 prop과 제어바 링크를 추가하고 기본 문구를 공용 질문 규칙으로 통일했다.
- `.env.example` — 오프라인 설문 화면 플래그와 설명을 추가했다.
- `stryker.crap.config.json` — 새 순수 모듈을 뮤테이션 대상으로 추가했다.
- `docs/superpowers/plans/2026-09-04-kano-offline-html-survey.md` — Task 6 Step 0~5를 완료로 표시했다.
- `docs/superpowers/reports/2026-09-04-kano-offline-html-survey/task-6.md` — 이 결과 보고서를 추가했다.

## COMMIT

- Step 0 커밋은 `c65ed15c6a9335a4c331771b7d34644865045188`(`test: 오프라인 응답 수입 회귀 경계를 고정한다`)이다.
- Task 6 본체 커밋은 `6cd62e41a69a4ba0e9b359fc65886daca96ca76f`(`feat: Kano 오프라인 설문 화면을 연결한다`)다.
- 보고서 커밋은 이 파일과 계획서 체크박스를 포함한다. 자기 자신의 해시는 본문에 넣을 수 없어 커밋 후 `git log`로 확인한다.
- 기준 커밋은 `46b8c41`이고 브랜치는 `claude/admin-account-password-recovery-o93xgy`다. push·배포·dev 서버·build는 실행하지 않았다.

## VERIFIED BY

### Step 0 GREEN

`npx vitest run tests/api-kano-offline-responses.test.ts`.

```text
 Test Files  1 passed (1)
      Tests  23 passed (23)
   Duration  625ms (transform 102ms, setup 0ms, import 177ms, tests 47ms, environment 0ms)
```

### Step 0 결함 주입 확인

`writePolicy: 'append'`를 임시로 `'replace'`로 바꾼 뒤 같은 테스트를 실행했다.

```text
 Test Files  1 failed (1)
      Tests  1 failed | 22 passed (23)
   Duration  607ms (transform 95ms, setup 0ms, import 171ms, tests 48ms, environment 0ms)
```

새 17번 테스트 한 건만 실패했고 라우트를 즉시 원복했다.

`entries.length > MAX_FILES`를 임시로 `>=`로 바꾼 뒤 같은 테스트를 실행했다.

```text
 Test Files  1 failed (1)
      Tests  1 failed | 22 passed (23)
   Duration  483ms (transform 93ms, setup 0ms, import 161ms, tests 41ms, environment 0ms)
```

새 18번 테스트 한 건만 실패했고 라우트를 즉시 원복했다. 최종 `git diff`에서 라우트 차이가 없음을 확인했다.

### 순수 모듈 RED

`npx vitest run tests/kano-offline-upload-client.test.ts`.

```text
 Test Files  1 failed (1)
      Tests  no tests
   Duration  433ms (transform 42ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)
```

신규 순수 모듈이 없어 import 단계에서 실패했다.

### 순수 모듈 GREEN

`npx vitest run tests/kano-offline-upload-client.test.ts`.

```text
 Test Files  1 passed (1)
      Tests  22 passed (22)
   Duration  367ms (transform 51ms, setup 0ms, import 74ms, tests 4ms, environment 0ms)
```

### 타입 검사

`npx tsc --noEmit`.

```text
(출력 없음, exit 0)
```

### 전체 테스트

`npx vitest run`.

```text
 Test Files  104 passed (104)
      Tests  1321 passed (1321)
   Duration  3.84s (transform 6.28s, setup 0ms, import 20.16s, tests 5.16s, environment 10ms)
```

### lint

`npx next lint`.

```text
✔ No ESLint warnings or errors
```

### 인코딩

`npm run check:encoding`.

```text
> kano-qfd-webapp@0.1.0 check:encoding
> node scripts/check-text-encoding.mjs

한글 인코딩 검사 통과.
```

### 뮤테이션 테스트

`npx stryker run stryker.crap.config.json --mutate lib/kano-offline-upload-client.ts`.

```text
All files                      | 100.00 |  100.00 |       68 |         0 |          0 |        0 |        0 |
 kano-offline-upload-client.ts | 100.00 |  100.00 |       68 |         0 |          0 |        0 |        0 |
```

빈 `catch`를 제거해도 다음 형태 검사에서 같은 `not-offline-file` 결과가 나오는 등가 `BlockStatement` 뮤턴트 한 개만 이유 주석으로 제외했다. 계측된 69개 중 정확히 한 개가 분모에서 빠져 최종 68개가 되었고, 68개를 모두 제거했다.

## DEVIATIONS

승인된 이번 위임문의 확정 계약에 따라 `.env.example`은 계획서의 `NEXT_PUBLIC_KANO_OFFLINE_SURVEY=off` 대신 저장소 문체와 같은 `NEXT_PUBLIC_KANO_OFFLINE_SURVEY=""`로 추가했다. 화면 판정은 여전히 문자열 `'on'`과 정확히 비교한다.

계획서 Step 5에는 `npm run build`가 적혀 있지만 이번 위임문이 build를 명시적으로 금지하므로 실행하지 않았다. 클라이언트 모듈의 node 전용 import 부재는 정적 검색과 타입 검사로 확인했다.

컴포넌트에는 `offlineFiles`·파일별 미리보기·업로드 진행·결과·충돌 상태를 두었다. 파일 텍스트 판정은 `inspectKanoOfflineFileText`, 배치 분할은 `chunkKanoOfflineFiles`, 배치 실패 인덱스 변환은 `absoluteFileIndex`로 밀었다. 컴포넌트에는 동일한 정규식·`JSON.parse`·배치 크기 상수를 복사하지 않았고 요청 전송, 상태 갱신, 한국어 안내 마크업만 남겼다.

## RISKS

화면 실동작인 브라우저 링크 클릭, 파일 선택, 여러 배치 업로드, 질문 변경·기존 응답자 버튼, 결과 패널 표시는 검증하지 않았다. 감리자가 코드를 확인하고 사용자가 실계정으로 검증해야 한다.

build를 실행하지 않았으므로 실제 Next.js 클라이언트 번들 생성은 검증하지 않았다. 원격 실DB, dev 서버, 배포도 실행하지 않았다.

최종 Stryker는 exit 0과 100% 결과를 냈지만 Windows에서 무시 대상 임시 sandbox 디렉터리 하나를 정리하지 못했다는 경고를 남겼다.

## QUESTIONS

없음.
