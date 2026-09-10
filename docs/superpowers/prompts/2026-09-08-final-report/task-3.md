# 위임 프롬프트 — 결과보고서 Task 3 (워크시트 화면 캡처)

감리자가 발행한다. 아래 코드블록 안이 실행 AI 에게 그대로 주는 프롬프트다.

```
[역할]
너는 codetest2(KS-QFD 웹앱)의 기능 개발 담당 엔지니어다. 이번 작업은 결과보고서
기능의 Task 3 — WS-4/WS-7/WS-9 화면 DOM 을 PNG dataURL 로 만드는 브라우저 전용
유틸 하나를 만들고, 그 의존성을 설치하는 것이다. 보고서 화면(Task 4)은 범위 밖이다.

먼저 정독하라:
- docs/superpowers/plans/2026-09-08-final-report.md 의 "Task 3" 절
- 네가 만든 lib/final-report-document.ts 의 CapturedWorksheetImage 타입

[배경 — 검증된 사실이니 재조사하지 마라]
1. 캡처 대상 세 곳의 **탭 id 가 CapturedWorksheetImage['worksheetId'] 와 이미 일치한다.**
   app/project/[id]/page.tsx 의 tabs 배열에서 확인했다:
     'fitness'          → [WS-4] 제품속성적합도   → components/project/FitnessWrapper.tsx
     'kano-aggregation' → [WS-7] TIMKO/만족계수 그래프 → components/project/KanoSatisfactionGraph.tsx
     'qfd'              → [WS-9] QFD              → components/project/QFDMatrix.tsx
   새 식별자를 만들지 마라. 이 세 문자열이 그대로 키다.
2. html-to-image 는 **아직 설치돼 있지 않다**(package.json 확인함). 이번 Task 에서
   설치한다 — 계획서가 승인한 유일한 신규 의존성이다.
3. 이 모듈은 순수하지 않다(DOM·브라우저 API). **stryker mutate 목록에 넣지 마라.**
   lib/final-report-docx.ts 를 넣지 않은 것과 같은 이유다.
4. 캡처 결과는 CapturedWorksheetImage 를 그대로 채운다:
   { worksheetId, title, pngDataUrl, widthPx, heightPx }. 이 타입을 바꾸지 마라 —
   buildFinalReportModel 이 이미 이 형태로 받는다.

[용어·규칙]
- 들여쓰기 4칸. 주석은 한국어 "~다" 체이고, 무엇이 아니라 **왜**를 적는다.
- 테스트는 tests/ 평면 배치.
- 커밋 메시지는 한국어, 본문에 "왜"를 적는다.
  트레일러: Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

[확정된 계약 — 감리자 승인, 이 결정을 따르라]
1. 캡처는 **라이트 테마**로 한다. 이 앱의 워크시트는 어두운 배경(text-white,
   bg-white/[0.04])이라 그대로 캡처하면 Word 문서에 검은 판이 박힌다.
   흰 배경으로 캡처되게 만들어라(방법은 재량 — [작업 내용] 참조).
2. 이 Task 는 서버 라우트·스키마·화면을 건드리지 않는다.
3. 신규 의존성은 html-to-image 하나뿐이다.
4. CapturedWorksheetImage 타입은 불변이다.
지시와 기존 계약이 충돌하면: 기존 계약을 따르고 이유를 보고하라.

[작업 내용]

A. 선행 수정 — lib/final-report-document.ts (감리 지적 사항)
   현재 문서의 첫 블록이 `heading('표지', 1)` 이라, 만들어진 .docx 를 Word 로 열면
   첫 줄에 "표지"라는 글자가 제목처럼 찍힌다. 보고서 제목은 model.title 에만 있는데
   그건 docx **메타데이터**(문서 속성)라 본문에 보이지 않는다. 양식 1쪽은
   제목·기업명·작성일·코치명 네 가지다 — 제목이 빠졌다.
   원인은 계획서 문서구조 표에 "표지 | 기업명·작성일"만 적힌 것이다(감리자 누락).
   - 첫 heading 의 문구를 '표지' 대신 보고서 제목으로 바꾼다.
   - 이 규칙을 tests/final-report-document.test.ts 에 케이스로 고정한다.
   - **lib/final-report-document.ts 는 stryker mutate 목록에 있다. 수정했으므로
     재실행해 100% 유지를 확인하고 총 뮤턴트 수와 함께 보고하라**(CLAUDE.md 규칙).

B. 의존성 설치
   npm install html-to-image
   package.json 과 package-lock.json 을 커밋한다. 다른 패키지를 함께 올리지 마라
   (lock 파일에 무관한 변경이 섞이면 감리 경계 확인에서 걸린다).

C. lib/worksheet-capture.ts (신규, 브라우저 전용)
   - DOM 노드 하나를 받아 PNG dataURL 과 실제 픽셀 크기를 돌려주는 함수를 만든다.
     반환 형태는 CapturedWorksheetImage 에 그대로 넣을 수 있어야 한다.
   - 라이트 테마 캡처: html-to-image 의 backgroundColor 지정, 또는 캡처 직전
     컨테이너에 라이트 클래스를 입히는 방식 중 **네가 판단해서 택하고 근거를
     보고하라**(재량). 이 저장소가 테마를 어떻게 전환하는지(app/globals.css 의
     `.light` 규칙)를 먼저 확인하고 정해라.
   - 캡처 실패 시 **어느 워크시트에서 실패했는지 식별 가능한 오류**를 던진다.
     Task 4 화면이 그 정보로 사용자에게 알린다.
   - 픽셀 크기는 캡처된 실제 크기를 쓴다(devicePixelRatio 로 확대해 캡처했다면
     그 값을 그대로 넘겨야 fitImageToBody 가 맞는 mm 를 낸다 — 어느 값을
     넘기는지 주석에 이유를 적어라).

D. tests/worksheet-capture.test.ts (신규)
   - html-to-image 를 `vi.mock` 으로 대체해 **호출 인자와 실패 경로만** 검증한다.
     실제 렌더링은 jsdom 에서 의미가 없으므로 시도하지 마라.
   - 최소: 정상 캡처가 dataURL·크기를 그대로 전달하는가 / 실패 시 워크시트를
     식별할 수 있는 오류가 나오는가 / 라이트 배경 옵션이 실제로 전달되는가.

[환경]
- **최우선 제약 — 원격 실DB.** prisma migrate deploy/db push/studio, DB 에 쓰는
  스크립트, **dev 서버 기동** 전부 금지. 이번 작업은 DB 를 건드릴 일이 없다.
- 게이트: npx tsc --noEmit && npx vitest run && npx next lint
- 뮤테이션(A 항목 때문에 필수):
  npx stryker run stryker.crap.config.json --mutate lib/final-report-document.ts

[브랜치·커밋]
- 브랜치: claude/notification-warning-position-p3vlxx
- **작업 시작 전에 원격을 먼저 받아라**: `git fetch origin && git merge
  origin/claude/notification-warning-position-p3vlxx`
  감리자가 같은 브랜치에 위임 문서를 커밋하므로, 이걸 건너뛰면 마지막에 push 가
  거절된다(Task 2 에서 실제로 그랬다). **rebase 가 아니라 merge 를 써라** — 보고서에
  적은 커밋 해시가 바뀌면 안 된다.
- 끝나면 push 하라: `git push -u origin claude/notification-warning-position-p3vlxx`
  (네트워크 실패면 2s→4s→8s→16s 로 최대 4회 재시도. non-fast-forward 는 네트워크
  실패가 아니므로 재시도하지 말고 위 merge 를 다시 하라.)
- force push 금지. 병합·배포 금지.
- 건드리지 마라: prisma/**, app/**, components/**

[작업 방식]
RED → GREEN: 실패하는 테스트를 먼저 작성하라.
- **작업 시작 전 `npx vitest run` 의 파일 수·테스트 수를 먼저 재서 보고서에 적어라.**
- 기존 테스트를 수정·skip·삭제하지 마라(A 항목이 요구하는 케이스 추가는 예외).

[Ask First — 다음이 필요해지면 중단하고 보고하라]
- html-to-image 외에 패키지가 더 필요해 보일 때
- CapturedWorksheetImage 타입을 바꿔야 할 것 같을 때
- 라이트 테마 캡처를 위해 components/** 나 app/globals.css 를 고쳐야 할 것 같을 때
  (이번 범위 밖이다 — 방법을 제안만 하고 멈춰라)
- 스키마 변경이나 서버 라우트가 필요해 보일 때
- lib/final-report-document.ts 의 stryker 점수가 100% 아래로 떨어질 때

[완료 판정 — 전부 만족해야 완료]
1. `npx tsc --noEmit` 오류 0.
2. `npx vitest run` 전체 통과. 작업 전/후 테스트 수를 보고서에 둘 다 적었다.
3. `npx next lint` 오류 0.
4. `npx stryker run stryker.crap.config.json --mutate lib/final-report-document.ts`
   가 100%. **점수 줄 원문**과 총 뮤턴트 수를 보고서에 적었다.
5. package.json 의 신규 의존성이 html-to-image 하나뿐이다(diff 로 확인 가능).
6. lib/worksheet-capture.ts 가 stryker mutate 목록에 **없다**.
7. 만들어진 .docx 의 본문 첫 줄이 '표지'가 아니라 보고서 제목이고, 그것을
   테스트가 고정한다.
8. `git push` 성공. origin 브랜치에 Task 3 커밋이 올라가 있다.
9. 병합·배포하지 않았다.

[산출물·보고]
- 코드 + 테스트 + 계획서 Task 3 체크박스 갱신 (커밋 + push 완료)
- 보고서: docs/superpowers/reports/2026-09-08-final-report/task-3.md
  **별도의 둘째 커밋**(`docs: Task 3 결과 보고서`).

  RESULT / FILES CHANGED / COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS

  - VERIFIED BY 에는 완료 판정 1~4번의 실행 명령과 **출력 마지막 줄 원문**을.
    stryker 는 점수 줄 원문을 담아라.
  - DEVIATIONS 에 라이트 테마 캡처 방식으로 무엇을 택했고 왜인지 반드시 적어라.
  - RISKS 에는 검증하지 못한 것을. 하지 않은 것을 했다고 쓰지 마라.
```

---

## 감리자 메모 (프롬프트에 넣지 않는다)

### Task 1·2 판정 결과 (2026-09-09)

**조건부 승인.** 경계 확인 통과, 표본 대조 7/7 통과. 게이트 독립 재실행은
**하지 못했다**(이 감리 세션에 node_modules 없음, npm 레지스트리 403).

경계 확인:
- 변경 파일이 lib 3 · tests 3 · stryker 설정 · docs 뿐. app/·components/·prisma/·
  package.json 미변경 확인.
- stryker.crap.config.json diff 는 두 파일 추가만. 기존 항목 삭제나 ignorePatterns
  변조 없음.
- tests/ 에서 변경된 파일이 신규 3개뿐 — **기존 테스트 파일 수정 0건.**

표본 대조(뒤집히면 판정이 뒤집히는 것부터):
1. ImprovementItem type 별 헤더 분기 — final-report-document.ts:165-166 vs 170-171.
   'need' 는 [고객니즈/경쟁사대비 수준향상율/개발향상비중], 'feature' 는
   [개선포인트 우선순위(고객니즈)/추가 기능/성능향상]. 정확히 다르다. ✅
2. 매출 period 분기 — :143 'Y' / :145 'Y_PLUS_1'. ✅
   (futureAmount 를 쓰지 않는 것도 옳다 — sales 라우트가 항상 0 으로 저장한다.)
3. selfScore/competitorScore — :164. ✅
4. email 미수용 — FinalReportOverviewInput 에 coachName 만. ✅
5. Date 미호출 — 세 모듈 전부 grep 결과 0건. ✅
6. 제품 이미지 비율 폴백 — :135-137, 둘 다 non-null 이면 fitImageToBody, 아니면
   120×80. ✅
7. FinalReportBlock never 검사 — final-report-docx.ts:66-69. ✅

신규 import 4개의 순수성도 확인했다(순수 모듈이 오염되면 stryker 점수가 무의미해진다):
kano-survey-document · worksheet-links(import type 만) · money · funding-ai-agent
— 넷 다 런타임 import 가 없거나 타입 전용이다. 이름이 "ai-agent"라 의심했으나
parseSourceYear 는 순수 함수였다.

테스트 품질은 요구를 넘어선다. report-image-fit 은 it.each 로 경계값
(폭만/세로만/양쪽/정사각/원본유지)과 잘못된 입력 5종×7지점을 덮고
toBeCloseTo(_, 10) 로 단언한다. docx 테스트는 스모크가 아니라 ZIP 을 풀어
XML 이스케이프·EMU 정확값(914400=1인치)·실제 PNG 바이트 보존·섹션 방향
순서(portrait/landscape/portrait)까지 본다. stryker 260→268 뮤턴트 100% 주장이
이 밀도라면 납득 가능하다 — 다만 **감리자가 재실행하지 못했다는 사실은 판정문에
남는다.**

### 미해결로 남기는 것

- **게이트 독립 재실행 불가.** 이 세션의 구조적 한계다. Task 4 병합 전에
  사용자 머신에서 감리자 입회하에 재실행하거나, CI 를 붙여야 한다.
- **절차 위반 1건(경미)**: merge 를 지시했으나 이력이 선형이고 해시가 바뀌었다
  (rebase 됨). 실질 피해는 없고 cebda68 이 보고서의 해시를 갱신했다. 다음부터
  merge 를 쓰도록 Task 3 프롬프트에 명시했다.
- **jszip 전이 의존성**: 테스트가 docx 의 내부 의존성을 직접 import 한다. docx 가
  내부 구현을 바꾸면 테스트가 깨진다. 신규 설치는 [Ask First] 대상이었으므로
  실행 AI 판단은 프롬프트 준수. Task 3 에서 html-to-image 를 설치하는 김에
  jszip 을 devDependency 로 명시할지는 **넣지 않기로 한다** — "신규 의존성
  html-to-image 하나뿐"이라는 경계 확인 기준을 흐리는 편이 더 나쁘다.
- **Competitive Assessment 10열 균등폭**: '항목'(요구사항 문구) 열이 10% 라
  세로로 눌릴 수 있다. Task 4 실화면 검증 항목.

### Task 4 로 이월된 검증 (병합 전 필수)

1. 실브라우저에서 .docx 를 실제로 내려받아 **Word 로 연다**(레시피 5·6단계).
2. 14개 DB 절이 값을 담는가, WS-4/7/9 그림이 잘리지 않았는가.
3. `GET /funding` 의 기본행 생성 부수효과 확인(WS-16 을 한 번도 안 연 프로젝트).
4. 빈 섹션(blocks 0개)일 때 Word 가 문서를 여는가.
5. 첫 섹션의 SectionType.NEXT_PAGE 가 빈 페이지를 만들지 않는가.
