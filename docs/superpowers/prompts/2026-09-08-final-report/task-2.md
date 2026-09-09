# 위임 프롬프트 — 결과보고서 Task 2 (.docx 렌더러)

감리자가 발행한다. 아래 코드블록 안이 실행 AI 에게 그대로 주는 프롬프트다.

```
[역할]
너는 codetest2(KS-QFD 웹앱)의 기능 개발 담당 엔지니어다. 이번 작업은 결과보고서 기능의
Task 2 — Task 1 이 만든 FinalReportModel 을 .docx 바이너리로 렌더링하는 모듈 하나를
만드는 것이다. 화면·캡처·API 는 이번 범위가 아니다.

먼저 정독하라:
- docs/superpowers/plans/2026-09-08-final-report.md 의 "Task 2" 절
- 네가 Task 1 에서 만든 lib/final-report-document.ts (블록 타입의 정본)
계획서와 이 프롬프트가 어긋나면 이 프롬프트가 이긴다.

[배경 — 검증된 사실이니 재조사하지 마라]
아래 1~5 는 감리자가 저장소 코드를 직접 읽고 확정했다. 6~7 은 감리자가 확인하지
**못한** 것이라 네가 확인해야 한다 — 어느 쪽인지 구분해서 썼다.

1. 참조 구현은 lib/kano-survey-docx.ts 다. 이 파일의 관용구를 그대로 따른다:
   - 3-7줄: docx 에서 { AlignmentType, Document, HeadingLevel, Packer, PageOrientation,
     Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
     convertMillimetersToTwip } 를 가져온다.
   - 10-17줄 `PAGE` 상수: size 는 convertMillimetersToTwip(210)×(297), margin 은 사방 20mm.
   - 21-30줄 `cell(text, options)` 헬퍼: TableCell 안에 Paragraph 하나, 폭은
     WidthType.PERCENTAGE.
   - 59-76줄 `renderKanoSurveyDocx`: new Document({ sections: [...] }) 를 만들고
     마지막에 Packer 로 직렬화한다.

2. **다만 직렬화 방식은 선례와 다르다.** Kano 렌더러는 서버 라우트에서 쓰여
   `Packer.toBuffer` → `Promise<Buffer>` 다(kano-survey-docx.ts:59, 76).
   이번 렌더러는 **브라우저에서 실행**되므로 계획서대로
   `renderFinalReportDocx(model): Promise<Blob>` 이고 `Packer.toBlob` 을 쓴다.
   그림이 DOM 캡처라 브라우저에만 있고, 서버로 올리면 Vercel 요청 본문 한도에
   걸릴 수 있어서 내린 결정이다(계획서 Architecture 절).

3. 기존 스모크 테스트의 형태는 tests/kano-survey-docx.test.ts 다(3 케이스: 정상 /
   빈 입력 / 대량 입력). 거기서는 Buffer 라 `buffer.subarray(0, 2).toString() === 'PK'`
   로 확인한다. **Blob 은 그 API 가 없다** — `new Uint8Array(await blob.arrayBuffer())`
   로 바꿔 앞 4바이트가 0x50 0x4b 0x03 0x04 인지 확인해라.

4. 다운로드 시 MIME 타입은
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 다
   (app/api/projects/[id]/kano/survey-document/route.ts:40). 이번 Task 는 다운로드를
   만들지 않지만, Blob 을 만들 때 이 타입을 지정해라.

5. docx 는 이미 의존성이다(package.json:23, "docx": "^9.5.0"). **새 패키지를 설치하지 마라.**

6. **감리자가 확인하지 못한 것 ①: `ImageRun` 의 정확한 API.**
   이 감리 세션에는 node_modules 가 없어(원격 컨테이너, npm 레지스트리 403) docx 의
   타입 정의를 열어볼 수 없었다. docx v9 는 v7~8 과 ImageRun 시그니처가 다르다고
   알려져 있다(예: `type` 필드 추가). **네 환경의 node_modules/docx 타입 정의를
   직접 읽고** 실제 시그니처에 맞춰라. 계획서에 적힌
   `ImageRun({ data, transformation: { width, height } })` 는 감리자의 추정이므로
   실제와 다르면 실제를 따르고 보고서 DEVIATIONS 에 적어라.

7. **감리자가 확인하지 못한 것 ②: dataURL → ImageRun data 변환.**
   모델의 이미지 블록은 `pngDataUrl`(data:image/png;base64,... 형태)을 담는다.
   docx 의 `data` 가 base64 문자열을 그대로 받는지, Uint8Array 여야 하는지 확인해라.
   변환이 필요하면 **브라우저와 Node 양쪽에서 동작하는 방법**을 써라 — 이 모듈은
   브라우저에서 실행되지만 vitest 는 Node 에서 돌린다. `atob` 은 Node 18+ 에도
   있지만 `Buffer` 는 브라우저에 없다. 어느 쪽을 골랐는지 보고서에 근거와 함께 적어라.

[용어·규칙]
- 들여쓰기 4칸. 주석은 한국어 "~다" 체이고, 무엇을 하는지가 아니라 **왜** 그런지를 쓴다.
- 테스트는 tests/ 평면 배치.
- 키·비밀번호·이메일을 문서·로그·응답 본문에 남기지 않는다.
- 커밋 메시지는 한국어, 본문에 "왜"를 적는다.
  트레일러: Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

[확정된 계약 — 감리자 승인, 이 결정을 따르라]
1. 시그니처는 `renderFinalReportDocx(model: FinalReportModel): Promise<Blob>` 하나다.
   모델을 만들지 않는다 — 입력으로 받는다.
2. 렌더러는 **모델을 해석만 한다.** 어떤 절을 넣을지, 빈 데이터를 어떻게 표현할지는
   Task 1 의 buildFinalReportModel 이 이미 정했다. 렌더러가 블록을 건너뛰거나
   문구를 만들어내면 안 된다.
3. 글꼴은 선례와 같이 '맑은 고딕'.
4. `landscape: true` 인 image 블록은 **별도 section** 으로 나눠
   PageOrientation.LANDSCAPE 로 넣는다(Kano 선례에는 단일 세로 section 뿐이라 이
   부분은 선례가 없다 — 새로 만들어야 한다).
5. 이 Task 는 서버 라우트를 만들지 않는다. 다운로드는 Task 4 다.
6. 스키마 변경 없음, 새 의존성 없음.
지시와 기존 계약이 충돌하면: 기존 계약을 따르고 이유를 보고하라.

[작업 내용]

A. 선행 수정 — lib/final-report-document.ts (Task 1 결함 보완)
   Task 1 보고서의 DEVIATIONS·RISKS 에 "제품 이미지는 원본 픽셀 크기가 없어 120×80mm
   고정으로 뒀고 종횡비 보존을 보장하지 않는다"고 적혀 있다. 원인은 계획서가
   FinalReportFreeInput 에 dataURL 만 두고 크기를 안 받게 한 것이다(감리자 잘못).
   지금 고치는 게 가장 싸다 — 뒤로 미루면 모델·테스트·렌더러·화면 네 곳을 다시 만진다.
   - FinalReportFreeInput 에
     `productImageWidthPx: number | null;` `productImageHeightPx: number | null;` 을 추가한다.
   - 두 값이 모두 있으면 제품 이미지도 `fitImageToBody` 를 거쳐 **원본 비율을 지켜**
     크기를 정한다. 하나라도 null 이면 지금의 120×80mm 고정으로 떨어뜨린다
     (화면이 크기를 못 구하는 경우가 있으므로 폴백을 남긴다).
   - 이 규칙을 tests/final-report-document.test.ts 에 케이스로 추가한다
     (크기 있음 → 비율 유지 / 크기 없음 → 120×80 폴백).
   - lib/final-report-document.ts 는 stryker mutate 목록에 있다. **수정했으므로
     재실행해서 100% 를 유지하는지 확인하고 총 뮤턴트 수와 함께 보고하라**
     (CLAUDE.md 의 뮤테이션 회귀 방지 규칙).

B. lib/final-report-docx.ts (신규)
   - `renderFinalReportDocx(model: FinalReportModel): Promise<Blob>`
   - FinalReportBlock 유니온의 **모든 kind 를 빠짐없이** 처리한다. Task 1 이 정의한
     실제 유니온이 정본이다 — 새 kind 가 생겼다면 그것도 처리한다.
     switch 에 `default: never` 검사를 넣어 컴파일 시점에 누락이 잡히게 해라.
   - heading: HeadingLevel 로. level 1/2 를 구분한다.
   - paragraph: Paragraph + TextRun.
   - keyValueTable / dataTable: Table + TableRow + cell 헬퍼(선례 21-30줄 형태).
     dataTable 의 headers 행은 bold + 가운데 정렬.
   - image: ImageRun. 모델의 widthMm/heightMm 를 docx 가 요구하는 단위로 변환해라
     (docx transformation 은 픽셀 기준이다 — mm→px 96dpi 환산이 필요한지 실제
     타입 정의를 보고 판단하고, 근거를 주석에 적어라).
   - 표가 페이지 폭을 넘지 않게 width 는 WidthType.PERCENTAGE 100 으로 잡는다.

C. tests/final-report-docx.test.ts (신규)
   - 최소: 정상 모델 / 블록 0개 모델 / 모든 kind 를 하나씩 담은 모델 / image 블록에
     landscape:true 가 섞인 모델 — 넷 다 PK 서명으로 시작하는 Blob 을 만든다.
   - 이 렌더러는 순수 모듈이 아니므로(외부 라이브러리 직렬화) **stryker 대상이 아니다.**
     mutate 목록에 넣지 마라.

[환경]
- **최우선 제약 — 원격 실DB.** .env 의 POSTGRES_PRISMA_URL 은 실데이터가 있는 원격
  Supabase 다. prisma migrate deploy/db push/studio, DB 에 쓰는 스크립트,
  **dev 서버 기동** 전부 금지. 이번 작업은 DB 를 건드릴 일이 없다.
- 안전한 명령: npx prisma validate, npx prisma generate.
- 게이트: npx tsc --noEmit && npx vitest run && npx next lint
- 뮤테이션(A 항목 때문에 필수):
  npx stryker run stryker.crap.config.json --mutate lib/final-report-document.ts
  등가 뮤턴트는 테스트를 비틀지 말고
  `// Stryker disable next-line <Mutator>: <이유>` 로 제외하고, disable 후 총 뮤턴트
  수가 몇 개 줄었는지 세어 보고하라.

[브랜치·커밋]
- 브랜치: claude/notification-warning-position-p3vlxx (Task 1 과 같은 브랜치, 이어서 커밋)
- 브랜치 이동·reset·checkout·force push 금지.
- **Task 1 커밋과 이번 커밋을 모두 push 하라**:
  `git push -u origin claude/notification-warning-position-p3vlxx`
  (네트워크 실패면 2s→4s→8s→16s 로 최대 4회 재시도)
  ※ Task 1 프롬프트에는 "push 하지 마라"고 적혀 있었으나 그건 감리자의 오류다.
    감리자는 원격 컨테이너에 있어 네 로컬 커밋을 볼 수 없고, push 되지 않으면
    검증 자체가 불가능하다. **이번에는 push 가 완료 조건이다.** 병합은 하지 마라.
- 건드리지 마라: prisma/**, app/**, components/**
- 완결 단위마다 즉시 커밋하라(A 와 B 는 별개 커밋으로 나눠도 좋다).

[작업 방식]
RED → GREEN: 실패하는 테스트를 먼저 작성하라.
- 무회귀: 기존 테스트를 하나도 수정·skip·삭제하지 마라. `npx vitest run` 전체가
  작업 전에도 그린이고 작업 후에도 그린이어야 한다. **작업 시작 전 baseline 수치
  (파일 수·테스트 수)를 먼저 재서 보고서에 적어라.**

[Ask First — 다음이 필요해지면 중단하고 보고하라]
- docx v9 의 ImageRun 이 dataURL/base64 를 어떤 형태로도 받지 못해 새 패키지가
  필요해 보일 때
- FinalReportModel 의 블록 타입 자체를 바꿔야 렌더링이 되는 경우
  (렌더러에 맞추려고 모델을 바꾸는 것은 계약 위반이다)
- 스키마 변경이나 서버 라우트가 필요해 보일 때
- 기존 테스트가 깨질 때
- lib/final-report-document.ts 의 stryker 점수가 100% 아래로 떨어지고 등가 뮤턴트가
  아닐 때

[완료 판정 — 전부 만족해야 완료]
1. `npx tsc --noEmit` 오류 0.
2. `npx vitest run` 전체 통과. 기존 테스트 파일의 수정·skip·삭제 0건.
   보고서에 작업 전/후 테스트 수를 둘 다 적었다.
3. `npx next lint` 오류 0.
4. `npx stryker run stryker.crap.config.json --mutate lib/final-report-document.ts`
   가 100%. 총 뮤턴트 수를 보고서에 적었다.
5. lib/final-report-docx.ts 가 FinalReportBlock 의 모든 kind 를 처리하며,
   switch 에 컴파일 시점 누락 검사(never)가 있다.
6. tests/final-report-docx.test.ts 의 4개 케이스가 모두 PK 서명을 확인한다.
7. lib/final-report-docx.ts 는 stryker mutate 목록에 **없다**.
8. 제품 이미지: 픽셀 크기가 주어지면 원본 비율이 유지되고, 없으면 120×80mm 로
   떨어지는 것을 테스트가 각각 고정한다.
9. `git push` 가 성공해 origin/claude/notification-warning-position-p3vlxx 에
   Task 1·2 커밋이 모두 올라가 있다.
10. 병합·배포하지 않았다.

[산출물·보고]
- 코드 + 테스트 + 계획서 Task 2 체크박스 갱신 (커밋 완료 + push 완료 상태)
- 보고서: docs/superpowers/reports/2026-09-08-final-report/task-2.md
  **작업 커밋과 별도의 둘째 커밋**(`docs: Task 2 결과 보고서`).

  RESULT / FILES CHANGED / COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS

  - VERIFIED BY 에는 완료 판정 1~4번의 **실행 명령과 출력 마지막 줄을 원문으로**.
    stryker 는 점수 줄 원문(예: "Mutation score: 100.00%")을 담아라 — 임시 디렉터리
    삭제 메시지가 아니라 점수 줄이다.
  - DEVIATIONS 에 [배경] 6·7번(ImageRun API, dataURL 변환)을 실제로 어떻게
    확인했고 무엇으로 정했는지 반드시 적어라.
  - RISKS 에는 검증하지 못한 것을. 하지 않은 것을 했다고 쓰지 마라.

[추가 질의 — 보고서 QUESTIONS 절에 답하라]
Task 1 보고서의 DEVIATIONS 에 "reset은 하지 않았으며 기존 main 작업도 보존했다"고
적혀 있다. 이 "기존 main 작업"이 무엇인가? 로컬 main 에 커밋되지 않은 변경이 있었는지,
아니면 단순히 main 브랜치를 건드리지 않았다는 뜻인지 명확히 답하라.
```

---

## 감리자 메모 (프롬프트에 넣지 않는다)

### Task 1 은 아직 미검증이다

이 프롬프트를 발행하는 시점에 Task 1 은 **승인되지 않았다.** 작업 커밋 f259f48 이
원격에 없어(실행 AI 가 사용자 로컬 Windows 에서 작업, push 안 함) 감리자가 코드를
볼 수 없었기 때문이다. 판정 레시피 1~4단계가 전부 불가능했다.

Task 2 를 먼저 발행하는 이유: push 만 되면 Task 1·2 를 **함께** 검증할 수 있고,
Task 2 의 A 항목이 Task 1 의 알려진 결함(제품 이미지 비율)을 어차피 손보기 때문이다.
Task 2 프롬프트의 [브랜치·커밋] 절에 push 를 완료 조건으로 박아 이 구멍을 닫았다.

### 이번 프롬프트에서 고친 것

1. **"push 하지 마라" → "push 하라".** Task 1 프롬프트의 설계 오류였다. 감리자가
   같은 작업트리에 있다는 전제로 썼는데, 실제로는 원격 컨테이너다. 프롬프트 안에
   오류였음을 명시해 실행 AI 가 두 지시의 충돌로 멈추지 않게 했다.
2. **감리자가 확인 못 한 것을 확인한 것과 구분해 표기.** node_modules 부재로
   docx 타입 정의를 못 읽었다. 모르는 것을 아는 척 좌표로 주면 Task 1 의 필드명
   4개 뒤집힘이 반복된다 — [배경] 6·7 을 "네가 확인하라"로 명시하고 이유를 적었다.
3. **stryker 점수 줄 원문을 요구.** Task 1 보고서는 "마지막 출력 줄"로 임시 디렉터리
   삭제 실패 메시지를 냈다. 형식은 지켰으나 점수 원문 대조가 불가능했다.
4. **baseline 을 먼저 재라고 요구.** Task 1 은 "기존 113파일·1,299개"를 사후에
   제시했는데, 작업 후에 센 수라면 무회귀 근거가 되지 못한다.

### push 수령 후 판정 순서 (Task 1·2 합동)

1. 경계 확인 — Task 1 diff 가 6개 파일에 국한되는지, Task 2 diff 가 지정 범위인지,
   기존 테스트 약화·stryker 설정 변조가 없는지. **게이트보다 먼저.**
2. 표본 대조 — 뒤집히면 판정이 뒤집히는 것부터:
   ① ImprovementItem type 별 헤더 분기 ② 매출 period 분기
   ③ selfScore/competitorScore ④ email 미수용 ⑤ Date 미호출
   ⑥ 제품 이미지 비율 폴백 ⑦ FinalReportBlock never 검사
3. 게이트 재실행 — **이 감리 세션은 node_modules 가 없고 npm 이 403 이라 직접
   실행할 수 없다.** 실행 AI 가 아닌 사람이 돌린 출력을 받는 것으로 대체한다.
   이것은 레시피 4단계의 완전한 이행이 아니며, 판정문에 그 한계를 명시할 것.
4. stryker 260 뮤턴트 100% 는 테스트 7개치고 이례적으로 강한 주장이다 —
   재실행 출력의 점수 줄과 총 뮤턴트 수를 대조한다.
5. 신설 실행물 1회 실행 / 화면 검증 3단계 — **Task 4 로 이월**(실브라우저에서
   .docx 를 내려받아 Word 로 여는 것까지가 병합 조건).
6. GET /funding 의 기본행 생성 부수효과를 Task 4 실화면 검증 항목에 넣을 것.
