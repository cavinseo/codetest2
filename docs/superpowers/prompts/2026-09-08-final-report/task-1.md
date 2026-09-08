# 위임 프롬프트 — 결과보고서 Task 1 (순수 모델)

감리자가 발행한다. 아래 코드블록 안이 실행 AI 에게 그대로 주는 프롬프트다.

```
[역할]
너는 codetest2(KS-QFD 웹앱)의 기능 개발 담당 엔지니어다. 이번 작업은 결과보고서(.docx)
생성 기능의 Task 1 — 순수 모듈 2개(모델 조립, 그림 크기 계산)를 만드는 것이다.
화면·렌더러·API 는 이번 범위가 아니다.

먼저 정독하라(이번 작업의 근거 문서다):
- docs/superpowers/plans/2026-09-08-final-report.md  ← Task 1 절이 정본
- docs/superpowers/specs/2026-09-08-final-report-design.md  ← 양식 16쪽 절별 매핑
계획서와 이 프롬프트가 어긋나면 이 프롬프트가 이긴다.

[배경 — 검증된 사실이니 재조사하지 마라]
아래는 감리자가 라우트·스키마·화면 코드를 직접 읽고 확정한 좌표다. 계획서 초안의 추정
4개가 여기서 뒤집혔다. grep 으로 다시 확인하지 말고 이대로 써라.

1. 매출(WS-1) — `GET /api/projects/[id]/sales` → `{ rows }`.
   양식 3쪽의 "현재 매출"과 "향후 1년 목표매출"은 amount/futureAmount 두 컬럼이 아니라
   같은 컬럼을 `period` 로 가른다: `'Y'` = 기준연도, `'Y_PLUS_1'` = 향후 1년.
   근거: app/api/projects/[id]/sales/route.ts:11-19, prisma/schema.prisma 의 SalesEstimate.

2. QFD Competitive Assessment(9쪽) — `GET /api/projects/[id]/qfd/analysis` → `{ requirements }`.
   행 타입 정본은 lib/qfd-worksheet.ts:43-54 의 `QfdRequirementWorksheetRow` 다.
   자사·경쟁사 필드명은 `self`/`competitor` 가 아니라 **`selfScore`/`competitorScore`**.
   나머지: weight, weightPercent, planQuality, improvementRate, absoluteImportance,
   qualityImportancePercent, rank(number|null). 요구사항 문구는 같은 행의 `requirement`.

3. Kano 집계(8쪽) — `GET /api/projects/[id]/kano/analysis` → `{ requirements }`.
   행: { requirementId, responseCount, aggregated, better, worse, kanoWeight,
   autoKanoWeight, timkoCategory, quadrant }.
   **이 행에는 요구사항 문구가 없다** — `requirementId` 로 CustomerRequirement 와
   조인해야 항목명이 나온다. 양식 열 대응: better=만족계수, worse=불만족계수,
   timkoCategory=품질, kanoWeight=가중치.
   근거: app/api/projects/[id]/kano/analysis/route.ts:71-81.

4. 개선포인트(WS-11) — `GET /api/projects/[id]/improvements` → `{ items, qfdAnalysis }`.
   **ImprovementItem 은 같은 3개 컬럼을 `type` 에 따라 다른 뜻으로 재사용한다.** 이게
   이번 작업에서 가장 틀리기 쉬운 지점이다:
     type='need'    → content=고객니즈, improvementRate=경쟁사대비 수준향상율, devProportion=개발향상비중
     type='feature' → content=개선포인트 우선순위(고객니즈), improvementRate=추가 기능, devProportion=성능향상
   근거: components/project/ImprovementsTable.tsx:50-68 및 396-453 의 <th> 문구.
   스키마에 customerNeed/addedFeature/performanceImprovement 라는 컬럼은 **없다**.

5. 기능기술체계(WS-10) — `GET /api/projects/[id]/tech-tree` → **`{ entries }`**.
   이 라우트만 배열 키가 rows 가 아니다. 근거: app/api/projects/[id]/tech-tree/route.ts:4-7.

6. 개선 방향성(12쪽) — `GET /api/projects/[id]/tech-roadmap` → `{ rows }`(WS-13).
   Prisma 필드명이 옛 로드맵 잔재라 뜻이 안 보인다. 화면(components/project/
   TechRoadmapTable.tsx:143-148)이 부여한 의미가 정본이다:
     category=개선 방향(차별화), techItem=개선기능 및 성능향상,
     currentLevel=구현가능성, targetLevel=목표 고객.

7. 자금(WS-16·17) — 라우트는 `/funding-plan`+`/funding-source` 둘이 아니라
   **`GET /api/projects/[id]/funding` 하나**가 `{ plans, sources }` 를 함께 준다.

8. 자산(WS-15) — `GET /api/projects/[id]/assets` → `{ assets }`.
   type='CORE' 는 content=핵심자산, type='COMPLEMENTARY' 는 category=필요항목·content=해결방안.

9. 코치명(표지) — `GET /api/projects/[id]/mentors` → `{ mentors: [{ user: { name, email, role } }] }`.
   **응답에 이메일이 들어 있다.** 모델은 이름만 받는다(아래 [용어·규칙] 참조).

10. 참조 구현 — 이번 3층 구조(순수 모델 → 렌더러 → 다운로드)의 선례는
    lib/kano-survey-document.ts 다. 파일명 규칙은 그 파일 112-123 줄의
    `kanoSurveyFileNameStem`/`kanoSurveyFileName` 과 **같은 규칙**을 쓴다
    (금지문자 치환 → 공백 정리 → 길이 자르기 → 빈 값이면 '프로젝트').

[용어·규칙]
- 들여쓰기 4칸. 주석은 한국어 "~다" 체이고, 무엇을 하는지가 아니라 **왜** 그런지를 쓴다.
- 테스트는 tests/ 평면 배치. 이번 두 모듈은 순수 함수라 Prisma mock 이 필요 없다.
- **키·비밀번호·이메일을 문서·로그·응답 본문에 남기지 않는다.** 코치명은 이름만
  받는다 — 타입 정의에서부터 email 을 받지 못하게 막아라.
- 커밋 메시지는 한국어, 본문에 "왜"를 적는다.
  트레일러: Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

[확정된 계약 — 감리자 승인, 이 결정을 따르라]
1. 출력 형식은 .docx. 원본 양식이 PPT 슬라이드 인쇄물이지만 장식은 재현하지 않는다.
2. 그림 캡처 대상은 WS-4(적합도)·WS-7(Kano 산점도)·WS-9(QFD 관계도) 세 곳뿐.
   나머지 14개 절은 표 데이터로 재현한다.
3. 이 기능은 **스키마를 바꾸지 않는다.** 서술형 5항목은 화면에서 즉석 입력받고 DB 에
   저장하지 않는다.
4. 신규·수정 서버 라우트 없음. 기존 GET 만 쓴다.
5. `buildFinalReportModel` 은 시각을 스스로 만들지 않는다 — `generatedAt` 을 입력으로 받는다.
6. 위 [배경]의 필드명은 확정값이다. 다르게 하고 싶으면 고치지 말고 중단·보고하라.
지시와 기존 계약이 충돌하면: 기존 계약을 따르고 이유를 보고하라.

[작업 내용]
계획서 `docs/superpowers/plans/2026-09-08-final-report.md` 의 "Task 1" 절에 있는
인터페이스 정의를 그대로 구현한다. 그 절이 시그니처의 정본이다.

A. lib/report-image-fit.ts (순수)
   - A4_PORTRAIT_BODY = { widthMm: 170, heightMm: 257 }
   - A4_LANDSCAPE_BODY = { widthMm: 257, heightMm: 170 }
   - fitImageToBody(widthPx, heightPx, body) → { widthMm, heightMm }
     px→mm 은 96dpi 기준(1px = 25.4/96 mm). 본문을 넘으면 **비율을 유지한 채** 축소하고,
     넘지 않으면 원 크기를 그대로 둔다. 폭·세로 중 더 많이 넘치는 쪽을 기준으로 잡는다.
   - shouldUseLandscape(widthPx, heightPx, threshold?) → boolean
     WS-9 처럼 가로로 긴 캡처를 가로 페이지에 넣을지 판정한다. threshold 기본값은
     네가 정하고 근거를 보고서에 적어라(재량).

B. lib/final-report-document.ts (순수)
   - 계획서의 FinalReportFreeInput / FinalReportOverviewInput / FinalReportWorksheetData /
     CapturedWorksheetImage / FinalReportBlock / FinalReportModel 타입을 정의한다.
   - buildFinalReportModel(overview, worksheets, freeInput, images) → FinalReportModel
     양식 순서(표지 → Ⅰ → Ⅱ → Ⅲ → Ⅳ → Ⅴ)대로 blocks 를 만든다. 각 절의 배치는
     spec 문서의 매핑 표를 따른다.
   - finalReportFileName(projectName) → `결과보고서_<정리된 이름>.docx`
   - 규칙(테스트로 고정할 것):
     · 행이 0개인 절은 빈 표 대신 "입력된 데이터가 없습니다" 문단 하나만 넣는다.
     · coachName 이 null 이면 표지의 코치명 값은 빈 문자열이 아니라 '미배정'.
     · FREE 입력이 빈 문자열이면 그 문단을 아예 만들지 않는다(빈 절 방지).
     · images 에 없는 워크시트는 그 자리에 "그림을 캡처하지 못했습니다" 문단을 넣는다
       (블록을 통째로 빠뜨리지 않는다 — 절 번호가 밀리면 안 된다).
   - 표 헤더 문구는 양식(PDF)의 열 이름을 쓴다. spec 문서 매핑 표에 적힌 한국어 열
     이름이 있으면 그대로, 없으면 워크시트 화면의 <th> 문구를 쓴다.

C. 두 모듈을 stryker.crap.config.json 의 mutate 배열에 등록한다.

[환경]
- **최우선 제약 — 원격 실DB.** .env 의 POSTGRES_PRISMA_URL 은 실데이터가 있는 원격
  Supabase 다. `prisma migrate deploy`/`db push`/`studio`, DB 에 쓰는 스크립트,
  **dev 서버 기동** 전부 금지. 이번 작업은 순수 함수라 DB 를 건드릴 일이 없다 —
  건드려야 할 것 같으면 그건 설계가 틀린 것이니 중단하라.
- 안전한 명령: npx prisma validate, npx prisma generate.
- 게이트: npx tsc --noEmit && npx vitest run && npx next lint
- 뮤테이션: npx stryker run stryker.crap.config.json --mutate <파일>
  등가 뮤턴트는 테스트를 비틀지 말고
  `// Stryker disable next-line <Mutator>: <이유>` 로 제외한다. 이유 없는 disable 금지.
  disable 을 걸었으면 **총 뮤턴트 수가 몇 개 줄었는지 세어** 의도한 개수와 맞는지
  확인하고, 어긋나면 보고서에 적어라(한 줄에 같은 뮤테이터의 다른 뮤턴트가 있으면
  이미 죽고 있던 것까지 분모에서 빠진다).

[브랜치·커밋]
- 분기 기준: claude/notification-warning-position-p3vlxx 의 5893ca0
  ("docs: 결과보고서 Task 0 확정"). 이 브랜치에 이어서 커밋한다.
- 브랜치 이동·reset·checkout·force push 금지. 커밋만 한다. push 는 하지 마라.
- 건드리지 마라: prisma/schema.prisma, prisma/migrations/**, app/api/**, components/**,
  app/project/** — 이번 Task 는 lib/ 2개 + tests/ 2개 + stryker 설정 + 계획서 체크박스뿐이다.
- 완결 단위마다 즉시 커밋하라.

[작업 방식]
RED → GREEN: 실패하는 테스트를 먼저 작성하라.
- tests/final-report-document.test.ts, tests/report-image-fit.test.ts
- 최소 커버 항목:
  · 14개 DB 절 각각 최소 1개 표본 행 → dataTable/keyValueTable 블록이 나오는가
  · type='need' 와 type='feature' 가 **서로 다른 헤더**로 렌더되는가([배경] 4번)
  · 매출 표가 period 로 두 표로 갈리는가([배경] 1번)
  · Kano 집계 행이 requirementId 조인으로 항목명을 얻는가, 못 찾으면 어떻게 되는가
  · coachName null → '미배정'
  · FREE 빈 문자열 → 문단 없음
  · images 누락 → 대체 문단
  · 파일명 금지문자(/ \ : * ? " < > |) 치환, 빈 이름 → '프로젝트'
  · fitImageToBody: 폭만 초과 / 세로만 초과 / 둘 다 초과 / 둘 다 이내(원 크기 유지)
- 무회귀: 기존 테스트를 하나도 수정·skip·삭제하지 마라. `npx vitest run` 전체가
  지금도 그린이고 작업 후에도 그린이어야 한다.

[Ask First — 다음이 필요해지면 중단하고 보고하라]
- 스키마 변경(prisma/schema.prisma, migrations)이 필요해 보일 때
- 새 서버 라우트나 기존 라우트 수정이 필요해 보일 때
- [배경]의 필드명이 실제와 다를 때 (고치지 말고 보고하라 — 감리자가 확정한 값이다)
- 새 npm 패키지가 필요할 때 (이번 Task 는 신규 의존성 0개다. docx 는 Task 2 에서 쓴다)
- 기존 테스트가 깨질 때
- 등가 뮤턴트가 아닌데 stryker 100% 가 안 나올 때

[완료 판정 — 전부 만족해야 완료]
1. `npx tsc --noEmit` 오류 0.
2. `npx vitest run` 전체 통과. 기존 테스트 파일의 수정·skip·삭제 0건.
3. `npx next lint` 오류 0.
4. `npx stryker run stryker.crap.config.json --mutate lib/final-report-document.ts` 가
   mutation score 100%.
5. `npx stryker run stryker.crap.config.json --mutate lib/report-image-fit.ts` 가
   mutation score 100%.
6. lib/final-report-document.ts 와 lib/report-image-fit.ts 가
   stryker.crap.config.json 의 mutate 배열에 들어 있다.
7. 두 모듈 어디에도 'email' 을 받거나 담는 타입·필드가 없다.
8. buildFinalReportModel 이 Date/Date.now/new Date() 를 호출하지 않는다.
9. git diff 가 lib/final-report-document.ts, lib/report-image-fit.ts,
   tests/final-report-document.test.ts, tests/report-image-fit.test.ts,
   stryker.crap.config.json, docs/superpowers/plans/2026-09-08-final-report.md
   (체크박스만) 여섯 파일에 국한된다.
10. 계획서 Task 1 의 Step 체크박스가 [x] 로 갱신돼 작업 커밋에 포함됐다.
11. 두 번의 커밋 후 `git status` 가 깨끗하다.
12. push 하지 않았다 — push·병합·배포는 감리자가 한다.

[산출물·보고]
- 코드 + 테스트 + 계획서 체크박스 갱신 (커밋 완료 상태)
- 보고서 작성: docs/superpowers/reports/2026-09-08-final-report/task-1.md
  형식은 아래 그대로. **작업 커밋과 별도의 둘째 커밋**으로 남긴다
  (커밋 메시지: `docs: Task 1 결과 보고서`). 작업 커밋 해시가 보고서에 들어가야 하므로
  순서를 바꿀 수 없다.

  RESULT / FILES CHANGED / COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS

  - VERIFIED BY 에는 완료 판정 1~5번 각각의 **실행 명령과 출력 마지막 줄을 원문으로**
    담아라. stryker 는 점수뿐 아니라 총 뮤턴트 수도 적어라.
  - DEVIATIONS 에는 지시와 다르게 처리한 것과 그 이유를.
  - RISKS 에는 **검증하지 못한 것**을 적어라. 하지 않은 것을 했다고 쓰지 마라.
```

---

## 감리자 메모 (프롬프트에 넣지 않는다)

이 프롬프트 발행 전에 감리자가 끝낸 사전 조사:

- 좌표 확정: 위 [배경] 10개 항목 전부 라우트·스키마·화면 코드를 직접 열어 확인했다.
  계획서 초안의 추정 4개(매출 period, selfScore/competitorScore, ImprovementItem 컬럼
  재사용, /funding 단일 라우트)가 여기서 뒤집혔다. 이 조사를 실행 AI 에게 맡겼다면
  틀린 필드명으로 구현이 끝난 뒤 게이트는 그린으로 나왔을 것이다 — 순수 모듈이라
  tsc·vitest 가 "DB 응답과 다른 필드명"을 잡지 못한다.
- 공유 자원: 이번 Task 는 migration·시나리오 번호를 쓰지 않는다. 브랜치 기준 커밋만
  확정값으로 줬다(5893ca0).
- 결정권 경계: [확정된 계약] 6개와 [Ask First] 6개로 나눴다. 특히 "[배경]의 필드명이
  실제와 다르면 고치지 말고 보고" — 실행 AI 가 조용히 필드명을 바꾸면 감리자의
  사전 조사가 무력화된다.
- 완료 판정: 12개 전부 제3자가 참/거짓 판정 가능하게 썼다. threshold 기본값 선택 같은
  재량은 완료 판정이 아니라 [작업 내용] 절에 넣었다.

수령 후 판정 순서(스킬의 레시피대로):
1. 경계 확인 — diff 가 6개 파일에 국한되는지, 기존 테스트 약화나 stryker 설정 변조가
   없는지. **게이트 통과 확인보다 먼저 한다.**
2. 표본 대조 — 뒤집히면 판정이 뒤집히는 주장부터: ① ImprovementItem type 별 헤더
   분기 ② 매출 period 분기 ③ selfScore/competitorScore ④ email 미수용 ⑤ Date 미호출.
3. 회귀 역검증 — 해당 없음(신규 모듈, 회귀 아님). 대신 stryker 점수를 감리자가 재실행.
4. 게이트 직접 재실행 — 보고된 출력을 쓰지 않는다.
5. 신설 실행물 1회 실행 — Task 1 은 순수 함수라 실행물이 없다. **Task 4 병합 전에
   실화면에서 .docx 를 실제로 내려받아 Word 로 여는 것으로 이월한다.**
6. 화면 검증 — Task 1 에는 UI 가 없다. Task 4 에서 (a)존재 (b)동작 (c)실제 브라우저
   3단계로 한다.
7. `GET /funding` 의 기본행 생성 부수효과를 Task 4 실화면 검증 항목에 넣을 것.
