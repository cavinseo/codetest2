# 위임 프롬프트 — 결과보고서 보강 Task A (Word 다운로드 서버 렌더 + 정리 + 개선 조사)

감리자가 발행한다. 아래 코드블록 안이 실행 AI 에게 그대로 주는 프롬프트다.
좌표는 `origin/main` `b794064` 기준으로 감리자가 직접 확인했다(2026-10-01).

```
[역할]
너는 codetest2(KS-QFD 웹앱)의 수정 담당 엔지니어다. 이번 작업은 결과보고서 기능의
감리 검토 결과를 반영하는 것이다. 두 부분으로 나뉜다.
- Part A(수정): 아래 [작업 내용] A1~A5 를 구현한다.
- Part B(조사·제안): B1~B6 은 **코드를 고치지 말고** 조사해 제안서 1개만 쓴다.
  설계 결정이 필요한 항목이라 감리자·사용자가 제안서를 보고 다음 계획서를 정한다.

먼저 정독하라:
- CLAUDE.md, AGENTS.md
- docs/superpowers/plans/2026-09-11-mentor-final-report.md (보고서 저장·공개 계약)
- docs/superpowers/specs/2026-09-27-report-pdf-template.md (현행 PDF·템플릿 구조)

[배경 — 검증된 사실이니 재조사하지 마라]
1. Word 다운로드는 화면이 가진 문서 모델을 요청 본문으로 보내 서버가 그대로
   직렬화한다.
   - 화면: app/project/[id]/report/page.tsx:422-447 handleDownload —
     POST /report/docx 에 body = withReportOutputDate(shownDocument)
   - 서버: app/api/projects/[id]/report/docx/route.ts:13-19 — requireProjectAccess
     만 확인한 뒤 reportDocumentSchema 로 검증하고 renderFinalReportDocx 를 호출한다.
   그래서 멘티를 포함한 프로젝트 참여자 누구나 임의 내용의 3.5MB 문서를 서버에서
   docx 로 변환시킬 수 있다. 내려받은 Word 가 DB 의 완료본(published)과 같다는
   보장도 없다.
2. 보고서 열람 권한 판정은 app/api/projects/[id]/report/route.ts:24-35 getAccess
   하나뿐이다. canEdit = 배정 멘토(MENTOR·PROGRAM_MANAGER), canReadDraft =
   canEdit || ADMIN. 미배정 PROGRAM_MANAGER 는 초안을 못 읽는다 —
   tests/api-final-report.test.ts 의 "미배정 %s는 명시적으로 초안을 요청해도
   기존 완료본만 읽는다" 테스트가 이것을 고정한다. 의도된 동작이다.
3. 같은 GET 의 view 규칙(route.ts:78): canReadDraft 이고 view!=='published' 면
   draft, 아니면 published. 완료본은 report.published, 초안 문서는
   report.draft.document 다(reportDraftSchema 로 파싱).
4. PDF 다운로드(page.tsx:449-467, lib/final-report-pdf.ts)는 브라우저에서 미리보기
   DOM 을 찍어 만든다. 서버를 거치지 않는다. **이번 범위가 아니다.**
5. Word 표지 출력일은 다운로드 시점에 withReportOutputDate 로 덮어쓴다
   (lib/final-report-layout.ts:40). PDF 는 미리보기를 만든 날짜(page.tsx:346
   reportOutputDate())가 그대로 찍힌다. 이 불일치는 Part B 항목이고 A1 에서는
   **현재 Word 의 의미(다운로드 날짜)를 유지**한다.
6. 사용되지 않는 코드:
   - components/project/FinalReportFreeInputs.tsx — 어디에서도 import 하지 않는다
     (저장소 전체 grep 결과 자기 자신뿐).
   - lib/final-report-inputs.ts:46 pickCoachName — 앱 코드에서 쓰지 않는다. 코치명은
     report API 의 mentorName 으로 온다. 사용처는 tests/final-report-inputs.test.ts:6,
     62-93 뿐이다.
   - page.tsx:21-24 EMPTY_FREE_INPUT 은 lib/final-report-payload.ts 의
     EMPTY_REPORT_FREE_INPUT 과 값이 같은 중복이다.
7. lib/final-report-template.ts:122 Kano 집계표가 행마다 requirements.find 를
   부른다(O(n²)). lib/final-report-inputs.ts 의 toKanoChartPoints 는 같은 일을
   Map 으로 한다.
8. 문서와 코드가 어긋난다:
   - docs/superpowers/plans/2026-09-11-mentor-final-report.md:6 "관리자·프로그램
     매니저는 초안을 조회할 수 있다" — 실제로는 배경 2 대로 ADMIN 과 배정 멘토만.
   - docs/superpowers/specs/2026-09-08-final-report-design.md:23, 78 — 코치명을
     GET /mentors 에서 가져온다고 적었지만 실제로는 mentorAssignment 에서 온다.
9. stryker mutate 목록(stryker.crap.config.json)에 lib/final-report-inputs.ts,
   lib/final-report-edit.ts, lib/final-report-document.ts 가 있다.
   lib/final-report-template.ts 와 API 라우트는 목록에 없다.

[용어·규칙]
- 들여쓰기 4칸. 주석은 한국어 "~다" 체이고, 무엇이 아니라 **왜**를 적는다.
- 테스트는 tests/ 평면 배치. Prisma 는 vi.mock('../lib/prisma', ...) 로 전부 mock.
- 키·비밀번호·이메일을 로그·응답 본문에 남기지 않는다(lib/logger.ts 규칙).
  보고서 본문·이미지도 로그에 남기지 마라.
- 커밋 메시지는 한국어, 본문에 "왜"를 적는다.
  트레일러: Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

[확정된 계약 — 감리자 승인, 이 결정을 따르라]
1. Word 다운로드 권한(A1):
   - GET /api/projects/[id]/report/docx?view=published — 프로젝트 접근 권한이 있는
     누구나. **DB 의 report.published** 를 렌더한다. 완료본이 없으면 404.
   - GET ...?view=draft — canReadDraft 만. **DB 의 draft.document** 를 렌더한다.
     권한이 없으면 403, 저장된 초안 문서가 없으면 404. view 생략은 published 로 본다.
   - POST(요청 본문 렌더) — **canEdit(배정 멘토)만** 허용, 나머지 403. 저장하지 않은
     교정본을 내려받는 용도로만 남긴다.
   - 세 경로 모두 렌더 직전에 withReportOutputDate 를 서버에서 적용한다(배경 5).
   - 응답 헤더(Content-Type, Content-Disposition filename*=UTF-8'', Cache-Control
     no-store)는 현행과 같다.
2. 권한 판정은 report/route.ts 의 getAccess 와 **같은 함수**를 쓴다. 복사하지 말고
   lib/ 아래 새 모듈(예: lib/final-report-access.ts)로 옮겨 두 라우트가 공유한다.
   판정 결과(canEdit·canReadDraft·mentorName·companyName)는 바뀌면 안 된다.
3. 화면(A1): activeView==='published' → GET ?view=published.
   activeView==='draft' 이고 editing(배정 멘토) → POST(로컬 교정 포함).
   activeView==='draft' 이고 읽기 전용(관리자) → GET ?view=draft.
4. 스키마·마이그레이션·PDF 경로·보고서 저장/완료 API(PUT·POST·PATCH /report)의
   동작은 바꾸지 않는다.
5. 테스트를 삭제해도 되는 경우는 **삭제한 코드의 테스트**(pickCoachName)뿐이다.
   tests/api-report-docx.test.ts 의 기존 POST 케이스는 계약 1 때문에 권한 전제를
   바꿔야 한다. 단언을 약화하지 말고 전제(mock)만 바꾸고, 바꾼 케이스 이름을 모두
   보고서 DEVIATIONS 에 적어라.
지시와 기존 계약이 충돌하면: 기존 계약을 따르고 이유를 보고하라.

[작업 내용]

── Part A: 수정 ──

A1. Word 다운로드를 서버의 저장본 기준으로 바꾼다 (배경 1·2·3, 계약 1·2·3)
   - lib/final-report-access.ts(이름 재량)로 getAccess 를 옮기고 report/route.ts 가
     그것을 쓰게 한다.
   - report/docx/route.ts 에 GET 을 추가하고, POST 에 canEdit 게이트를 단다.
   - page.tsx handleDownload 를 계약 3 대로 분기한다.
   - 테스트(tests/api-report-docx.test.ts 확장 또는 새 파일):
     a. 멘티(접근 권한 있음·canEdit 아님)의 POST → 403, renderFinalReportDocx 미호출
     b. GET view=published → DB published 를 렌더(호출 인자 단언). 완료본 없으면 404
     c. 멘티의 GET view=draft → 403, 초안 내용이 응답에 없음
     d. 관리자의 GET view=draft → draft.document 를 렌더
     e. 세 경로 모두 표지(cover) outputDate 가 서버 시점 값으로 바뀌어 렌더됨
     f. 기존 POST 의 입력 검증 케이스(400·413·500)가 배정 멘토 전제로 그대로 통과
   - tests/api-final-report.test.ts 는 수정 없이 통과해야 한다(계약 2 의 회귀 검사).

A2. 사용하지 않는 코드 제거 (배경 6)
   - components/project/FinalReportFreeInputs.tsx 삭제.
   - pickCoachName 과 그 테스트 블록 삭제.
   - page.tsx EMPTY_FREE_INPUT 을 EMPTY_REPORT_FREE_INPUT import 로 교체.
     두 타입(FinalReportFreeInput 과 z.infer)이 다르면 컴파일 오류로 드러난다 —
     그때는 Ask First.

A3. Kano 집계표 조회를 Map 으로 바꾼다 (배경 7)
   - 출력은 바뀌면 안 된다. 기존 tests/final-report-template.test.ts 가 그대로
     통과해야 하고, 요구사항 미확인 행('요구사항 미확인')을 검사하는 케이스가
     없으면 하나 추가한다.

A4. 문서 정정 (배경 8)
   - 두 문서의 본문을 고쳐 쓰지 말고 해당 위치 바로 아래에
     "> 2026-10-01 정정: …" 인용 한 줄을 덧붙여 현재 동작과 근거(파일:라인)를 적는다.
     당시 결정 기록은 보존해야 하기 때문이다.

A5. 뮤테이션 회귀 확인 (배경 9)
   - lib/final-report-inputs.ts 를 고쳤으므로
     npx stryker run stryker.crap.config.json --mutate lib/final-report-inputs.ts
     를 실행해 점수 줄 원문과 총 뮤턴트 수(작업 전/후)를 보고한다. pickCoachName
     삭제로 뮤턴트 수가 줄어드는 것은 정상이며, 줄어든 수를 적어라.
   - 새로 만든 lib/final-report-access.ts 는 Prisma 를 쓰므로 mutate 목록에
     넣지 않는다.

── Part B: 조사·제안 (코드 수정 금지) ──

각 항목에 대해 ①현재 동작(파일:라인) ②문제가 실제로 일어나는 재현 조건
③선택지 2개 이상과 각각의 비용·위험 ④추천안 을 쓴다. 추측과 확인한 사실을 구분해
표시하라.

B1. 저장 용량. 초안 JSON 에 들어가는 base64 이미지(캡처 3장, 제품 사진)의 실제
    크기 분포를 추정하라. 제품 사진이 free.productImageDataUrl 과 문서 image 블록에
    두 번 저장되는 경로(usesOverview=false)를 확인하라. 3,500,000 바이트 한도에
    언제 걸리는지, 미리보기 직후 크기 경고 vs Supabase Storage 참조 저장을 비교하라.
    **원격 실DB·Storage 에 접근하지 마라** — 코드와 테스트 fixture 로만 추정한다.
B2. 표·그림 기준 시점 불일치. 표는 page.tsx 의 payloads, 그림은 캡처 컴포넌트가
    각자 불러온다. handleBuildPreview(page.tsx:319-)는 보고서 version 만 재확인한다.
    다른 탭에서 워크시트가 바뀌었을 때의 결과를 서술하라.
B3. reloadSources(page.tsx:379-397)가 실제 변경이 없어도 previewNeedsRefresh=true,
    hasLocalChanges=true 로 만드는 문제(389-390행). 워크시트 updatedAt 비교 같은
    대안을 제시하라.
B4. 표지 날짜. Word = 다운로드 날짜, PDF = 미리보기 생성 날짜(배경 5). 완료본의
    표지 날짜가 무엇이어야 하는지(출력일·완료일·둘 다) 선택지를 정리하라.
B5. Ⅲ절(WS-5·7·9·10·11) 멘토 분석. lib/final-report-template.ts 는 이 절에
    '입력란이 없어 저장된 분석이 없습니다' 안내만 넣는다. 입력란을 추가하는 데
    필요한 변경(lib/mentor-worksheet-analysis.ts 스키마, 각 워크시트 화면)의 범위를
    추정하라.
B6. page.tsx(588줄)의 미저장 이동 방지 로직(214행 useEffect)을
    useUnsavedChangesGuard 훅으로 분리하는 안. 분리 시 테스트 가능해지는 범위와
    tests/final-report-navigation.test.ts 에 미치는 영향을 적어라.

[환경]
- **최우선 제약 — 원격 실DB.** .env 의 POSTGRES_PRISMA_URL 은 실데이터가 있는
  원격 Supabase 다. prisma migrate deploy / db push / studio, DB 에 쓰는 스크립트,
  **dev 서버 기동** 전부 금지. 신설 GET 라우트도 dev 서버로 실기동하지 마라 —
  라우트 실기동·브라우저 다운로드 검증은 감리자가 한다.
- 안전한 명령: npx prisma validate, npx prisma generate.
  generate 가 EPERM ... query_engine-windows.dll.node 로 실패하면 중단·보고.
- 게이트: npx tsc --noEmit && npx vitest run && npx next lint

[브랜치·커밋]
- 분기 기준: origin/main b794064.
  git fetch origin && git switch -c claude/final-report-hardening b794064
  (b794064 이후 main 에 커밋이 더 있으면 그대로 b794064 에서 시작하고 보고하라.)
- 완결 단위마다 커밋한다(A1 / A2·A3 / A4 를 각각 나눠도 된다).
- push·병합·배포 하지 마라. push 는 사용자 지시가 있을 때 감리자가 한다.
- 건드리지 마라: prisma/**, lib/final-report-pdf.ts, lib/final-report-layout.ts,
  app/api/projects/[id]/report/route.ts 의 GET·PUT·POST·PATCH 동작
  (getAccess 를 옮기는 import 변경만 허용).

[작업 방식]
RED → GREEN: A1 테스트 a~e 를 먼저 쓰고 실패를 확인한 뒤 구현하라.
- **작업 시작 전 npx vitest run 의 파일 수·테스트 수를 재서 보고서에 적어라.**
- 무회귀: tests/api-final-report.test.ts, tests/final-report-template.test.ts,
  tests/final-report-navigation.test.ts, tests/final-report-capture-state.test.ts 는
  수정하지 않고 통과해야 한다.
- 기존 테스트를 skip·삭제하지 마라(계약 5 의 예외만 허용).

[Ask First — 다음이 필요해지면 중단하고 보고하라]
- 스키마·마이그레이션이 필요해 보일 때
- getAccess 를 옮기면서 판정 결과가 하나라도 달라질 때
- 관리자 외의 역할(미배정 PROGRAM_MANAGER 등)에게 초안 다운로드를 열어야 할 것 같을 때
- EMPTY_REPORT_FREE_INPUT 과 화면 타입이 맞지 않을 때
- lib/final-report-inputs.ts 의 stryker 점수가 작업 전보다 떨어질 때
- Part B 조사 중 실DB·Storage 조회가 필요해 보일 때(하지 말고 필요한 쿼리만 적어라)

[완료 판정 — 전부 만족해야 완료]
1. npx tsc --noEmit 오류 0.
2. npx vitest run 전체 통과. 작업 전/후 파일 수·테스트 수를 보고서에 둘 다 적었다.
3. npx next lint 오류 0.
4. A1 테스트 a~f 가 존재하고 통과한다. 각 테스트의 파일:라인을 보고서에 적었다.
5. A1 회귀 역검증: docx POST 의 canEdit 게이트만 임시로 지운 상태에서 테스트 a 가
   실패하는 것을 확인하고 원복했다. 실패 출력 한 줄을 보고서에 적었다.
6. 배경 6 의 세 항목이 저장소에서 사라졌다:
   grep -rn "FinalReportFreeInputs\|pickCoachName" app components lib tests 결과 0줄,
   page.tsx 에 "const EMPTY_FREE_INPUT" 0줄.
7. lib/final-report-template.ts 에 requirements.find 0줄.
8. stryker(lib/final-report-inputs.ts) 점수 줄 원문과 작업 전/후 총 뮤턴트 수를
   보고서에 적었고, 점수가 작업 전보다 낮지 않다.
9. 두 문서에 "2026-10-01 정정" 인용이 각 1개 이상 있다.
10. 제안서 docs/superpowers/reports/2026-10-01-final-report-hardening/proposals.md
    에 B1~B6 이 모두 있고, 각 항목에 ①~④ 네 소제목이 있다.
11. git status 가 깨끗하고, push 하지 않았다.

[산출물·보고]
- 코드 + 테스트 + 문서 정정 (커밋 완료 상태)
- 제안서: docs/superpowers/reports/2026-10-01-final-report-hardening/proposals.md
- 결과 보고서: docs/superpowers/reports/2026-10-01-final-report-hardening/task-a.md
  형식: RESULT / FILES CHANGED / COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS
  - VERIFIED BY 에는 각 게이트의 실행 명령과 출력 마지막 줄을 원문으로 담는다.
  - RISKS 에는 검증하지 못한 것(라우트 실기동, 브라우저 다운로드 등)을 적는다 —
    하지 않은 것을 했다고 쓰지 마라.
- 보고서와 제안서는 **작업 커밋과 별도의 마지막 커밋**으로 남긴다
  (docs: Task A 결과 보고서). 작업 커밋 해시가 보고서 본문에 들어가야 하므로
  순서를 바꾸지 마라.
```

## 감리자 메모 (프롬프트에 넣지 않는다)

- 판정 시 표본 1순위: 계약 2 — `getAccess` 이동 후 `tests/api-final-report.test.ts`가
  **수정 없이** 통과했는지 diff로 확인한다.
- 표본 2순위: 기존 docx POST 테스트의 단언이 약화되지 않았는지(전제 mock만 바뀌었는지).
- 화면 검증은 감리자가 직접 한다. 멘티 계정으로 완료본 Word를 내려받아 DB 공개본과
  내용이 같은지 확인하고, 배정 멘토 계정으로 저장하지 않은 교정본 Word를 내려받는다.
  실DB이므로 사용자 실계정으로 하는 단계로 이월할 수 있다.
- Part B 제안서를 받으면 B1~B6 중 채택안으로 다음 계획서
  (`docs/superpowers/plans/2026-10-xx-…`)를 쓴다.
