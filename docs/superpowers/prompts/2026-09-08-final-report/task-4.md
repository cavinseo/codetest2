# 위임 프롬프트 — 결과보고서 Task 4 (보고서 화면 + 진입점)

감리자가 발행한다. 아래 코드블록 안이 실행 AI 에게 그대로 주는 프롬프트다.

```
[역할]
너는 codetest2(KS-QFD 웹앱)의 기능 개발 담당 엔지니어다. 이번 작업은 결과보고서
기능의 마지막 Task 4 — 데이터를 모아 화면에서 .docx 를 내려받게 하는 페이지와
헤더 진입 버튼을 만드는 것이다. Task 1~3 의 모듈은 이미 있고 검증됐다.

먼저 정독하라:
- docs/superpowers/plans/2026-09-08-final-report.md (특히 "필요 GET 엔드포인트 정리"와
  "Architecture" 절, Task 4 절)
- 네가 만든 lib/final-report-document.ts · lib/final-report-docx.ts · lib/worksheet-capture.ts

[배경 — 검증된 사실이니 재조사하지 마라]
감리자가 코드를 직접 읽고 확정했다.

1. **캡처 대상 세 컴포넌트의 props 가 서로 다르다. 이게 이번 Task 에서 가장 틀리기
   쉬운 지점이다.**
     components/project/FitnessWrapper.tsx        → { projectId: string }        자체 fetch
     components/project/QFDMatrix.tsx             → { projectId: string }        자체 fetch
     components/project/KanoSatisfactionGraph.tsx → **{ analysis: AnalysisResult[],
        selectedRequirementId?, onSelectRequirement? }** — projectId 를 받지 않는다!
   WS-7 만 데이터를 **주입**받는다. 보고서 화면이 kano/analysis 를 어차피 호출하므로
   그 결과를 넘기면 된다. 넘기는 배열의 정확한 형태는 이 컴포넌트를 이미 쓰고 있는
   components/project/KanoManager.tsx 의 사용례가 정본이다 — 그대로 따라라.
2. KanoSatisfactionGraph 는 width 720 · height 750 SVG 를 그린다(그 파일 32-33줄).
   고정 크기라 인쇄 폭 컨테이너에 넣어도 늘어나지 않는다.
3. 헤더 진입 버튼 자리: app/project/[id]/page.tsx **525줄**에
   `<div id={HEADER_TOAST_SLOT_ID} className="contents" />` 가 있고 **527줄**이
   "팀원 초대" 링크다. 그 옆에 넣는다. HeaderToast 슬롯을 지우거나 옮기지 마라 —
   13개 컴포넌트가 이 슬롯에 토스트를 포털로 띄운다.
4. 캡처 유틸의 계약: `captureWorksheetNode(node, { pixelRatio? })` 는
   `{ pngDataUrl, widthPx, heightPx }` 만 돌려준다. **worksheetId 와 title 은 호출자가
   붙인다.** 실패 시 `워크시트 <id> 캡처에 실패했습니다.` 오류를 던지는데, 그 `<id>` 는
   **캡처 대상 노드의 `data-worksheet-id` 속성**에서 온다. 이 속성을 붙이지 않으면
   오류 메시지가 'unknown' 이 되어 어느 워크시트가 실패했는지 알 수 없다.
   반드시 'fitness' / 'kano-aggregation' / 'qfd' 를 그대로 붙여라 — 이 세 문자열이
   CapturedWorksheetImage['worksheetId'] 의 값이자 탭 id 다.
5. 캡처 유틸은 캡처 동안 대상 노드의 class 와 style 을 바꿨다가 finally 에서 되돌린다.
   따라서 **캡처 중에 그 영역을 편집하거나 캡처를 중복 실행하면 안 된다.**
   생성 버튼을 잠그고 진행 상태를 보여라.
6. **`GET /api/projects/[id]/funding` 은 이름과 달리 쓰기다.** 행이 하나도 없으면
   기본 13행을 실제로 DB 에 생성한다(그 파일 40-49줄). WS-16 을 한 번도 안 연
   프로젝트에서 보고서 화면을 열면 그 기본행이 생긴다. WS-16 화면을 연 것과 같은
   결과라 **그대로 두기로 결정했다** — 피하려면 라우트를 고쳐야 하는데 그건
   "신규·수정 서버 라우트 없음" 계약을 깬다. 우회하지 마라.
7. `GET /api/projects/[id]/mentors` 는 `{ mentors: [{ user: { name, email, role } }] }` 를
   준다. **응답에 이메일이 들어 있다.** 이름만 뽑아 넘겨라 — 이메일을 모델·로그·문서
   어디에도 넣지 마라(CLAUDE.md 규칙, 감리 1순위 표본). 또 이 라우트는
   ADMIN·PROGRAM_MANAGER 에게만 열려 있어 **멘티가 호출하면 403 이다.
   403 을 오류로 띄우지 말고 coachName 을 null 로 넘겨라**(모델이 '미배정'으로 찍는다).

8. **토스트 상태는 공용 훅 `components/useToast.ts` 가 이미 담당한다.** 이 Task 보다
   먼저 병합된 리팩터링에서, 13개 화면에 복붙돼 있던 useState·toastTimer·showToast
   세 벌을 훅 하나로 모았다. `const { toast, showToast } = useToast();` 를 쓰고
   `{toast && <HeaderToast message={toast.message} type={toast.type} />}` 로 렌더한다.
   **타이머 상태를 직접 만들지 마라** — 그 복붙을 없앤 것이 그 작업의 목적이었다.
   시그니처는 `showToast(message: string, type?: ToastType)` 이고 기본값은 'success' 다.
   ToastType 은 `components/HeaderToast.tsx` 에서 import 한다(다른 곳에 재정의 금지).

[용어·규칙]
- 들여쓰기 4칸. 주석은 한국어 "~다" 체이고, 무엇이 아니라 **왜**를 적는다.
- 토스트는 `components/useToast.ts` 훅 + `components/HeaderToast.tsx` 조합을 쓴다.
  둘 다 이미 있다 — 새로 만들지 마라.
- 키·비밀번호·이메일을 문서·로그·응답 본문에 남기지 않는다.
- 커밋 메시지는 한국어, 본문에 "왜"를 적는다.
  트레일러: Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

[확정된 계약 — 감리자 승인, 이 결정을 따르라]
1. **신규·수정 서버 라우트 없음.** 기존 GET 만 호출한다.
2. **스키마 변경 없음.** FREE 입력 5개는 화면 상태로만 두고 DB 에 저장하지 않는다.
3. 진입점은 헤더 버튼 하나다. 워크시트 탭 배열(WS 번호)에 끼워 넣지 마라 —
   결과보고서는 워크시트가 아니라 그 결과물이다.
4. 캡처 대상은 WS-4·WS-7·WS-9 세 곳뿐이다. 늘리지 마라.
5. 문서 조립·직렬화는 브라우저에서 한다. 서버로 올리지 마라(Vercel 본문 한도).
6. Task 1~3 의 모듈 시그니처와 CapturedWorksheetImage 타입을 바꾸지 마라.
지시와 기존 계약이 충돌하면: 기존 계약을 따르고 이유를 보고하라.

[작업 내용]

A. app/project/[id]/report/page.tsx (신규)
   1. 데이터 로딩 — 계획서 "필요 GET 엔드포인트 정리"의 라우트를 병렬 fetch.
      배열 키가 라우트마다 다르다(sales `{rows}` · tech-tree **`{entries}`** ·
      improvements `{items}` · target-spec `{rows}` · tech-roadmap `{rows}` ·
      assets `{assets}` · funding `{plans, sources}` · kano/analysis `{requirements}` ·
      qfd/analysis `{requirements}` · overview `{project, counts, ...}` · export).
      mentors 는 403 을 빈 값으로 흘린다([배경] 7번).
      improvements 의 items 를 type 으로 갈라 improvementNeeds / improvementFeatures
      두 배열로 만들어 넘긴다 — **같은 컬럼이 type 에 따라 다른 뜻이다.**
   2. FREE 입력 폼 — 텍스트 5개(시장정의·목표고객·최종목표스펙설명·개선제품명·
      개선제품설명) + 제품 이미지 업로드.
      **이미지는 dataURL 과 함께 원본 픽셀 크기도 구해서 넘겨라** —
      `new Image()` 의 naturalWidth/naturalHeight. 크기를 넘기면 모델이 원본 비율을
      지키고, 안 넘기면 120×80mm 고정으로 떨어진다(Task 2 에서 그렇게 만들었다).
   3. WS-4·WS-7·WS-9 를 인쇄 폭 컨테이너에 마운트. 각 루트에
      `data-worksheet-id="fitness" | "kano-aggregation" | "qfd"` 를 붙인다([배경] 4번).
   4. 「결과보고서 생성」 버튼 — 캡처 3장 → buildFinalReportModel →
      renderFinalReportDocx → Blob 을 URL.createObjectURL 로 내려받기.
      파일명은 모델의 fileName 을 쓴다. 진행 중 버튼을 잠그고 "n/3 캡처 중"을 보여라.
      캡처 실패 시 오류 메시지(어느 워크시트인지 들어 있다)를 HeaderToast 로 알린다.
      generatedAt 은 이 화면에서 만들어 넘긴다(모델은 시각을 만들지 않는다).

B. app/project/[id]/page.tsx (수정)
   - 527줄 "팀원 초대" 옆에 "결과보고서" 진입 버튼(Link)을 추가한다.
   - HEADER_TOAST_SLOT_ID 슬롯을 건드리지 마라.

C. 테스트
   - 화면 컴포넌트 전체를 렌더링하는 테스트는 만들지 마라(jsdom 에서 세 워크시트
     컴포넌트가 전부 fetch 를 돈다 — 가치 대비 비용이 크다).
   - 대신 **순수하게 뽑아낼 수 있는 변환 로직을 lib 로 빼서 테스트하라.**
     최소한 `improvements` 의 items 를 type 으로 갈라 두 배열로 만드는 함수와,
     각 라우트 응답에서 배열을 꺼내는 매핑은 순수 함수로 분리해 tests/ 에서 덮어라.
     그 함수 파일은 순수 모듈이므로 **stryker mutate 목록에 등록하고 100% 를 내라.**
   - 파일명·등록 여부를 보고서에 적어라.

[환경]
- **최우선 제약 — 원격 실DB.** prisma migrate deploy/db push/studio, DB 에 쓰는
  스크립트, **dev 서버 기동** 전부 금지.
  → **그러므로 이번 Task 의 실화면 검증은 네 몫이 아니다.** 브라우저에서 눌러보는
    확인은 감리자와 사용자가 한다. 네가 하지 않은 것을 했다고 쓰지 마라.
- 게이트: npx tsc --noEmit && npx vitest run && npx next lint
- 신규 순수 모듈이 생기면: npx stryker run stryker.crap.config.json --mutate <파일>

[브랜치·커밋]
- 브랜치: claude/notification-warning-position-p3vlxx
- **작업 시작 전에 원격을 먼저 받아라**:
  `git fetch origin && git merge origin/claude/notification-warning-position-p3vlxx`
  **rebase 가 아니라 merge 다** — 보고서에 적은 커밋 해시가 바뀌면 안 된다.
- 끝나면 push: `git push -u origin claude/notification-warning-position-p3vlxx`
  (non-fast-forward 는 네트워크 실패가 아니다. 재시도하지 말고 위 merge 를 다시 하라.)
- force push 금지. **main 병합·배포 금지** — 실화면 검증 후 감리자가 한다.
- 건드리지 마라: prisma/**, app/api/**, components/project/** (캡처 대상 컴포넌트를
  고쳐야 할 것 같으면 [Ask First])

[작업 방식]
RED → GREEN: 순수 함수는 실패 테스트를 먼저 작성하라.
- **작업 시작 전 `npx vitest run` 의 파일 수·테스트 수를 먼저 재서 보고서에 적어라.**
- 기존 테스트를 수정·skip·삭제하지 마라.

[Ask First — 다음이 필요해지면 중단하고 보고하라]
- 서버 라우트를 새로 만들거나 고쳐야 할 것 같을 때(특히 /funding 부수효과를 피하려고)
- components/project/** 의 캡처 대상 컴포넌트를 고쳐야 할 것 같을 때
- 스키마 변경이나 새 npm 패키지가 필요할 때
- Task 1~3 모듈의 시그니처를 바꿔야 할 것 같을 때
- 기존 테스트가 깨질 때

[완료 판정 — 전부 만족해야 완료]
1. `npx tsc --noEmit` 오류 0.
2. `npx vitest run` 전체 통과. 작업 전/후 테스트 수를 보고서에 둘 다 적었다.
3. `npx next lint` 오류 0.
4. 신규 순수 모듈이 stryker mutate 에 등록돼 있고 100% 다(점수 줄 원문을 보고서에).
5. `git diff` 가 app/project/[id]/report/page.tsx · app/project/[id]/page.tsx ·
   신규 lib · 신규 tests · stryker 설정 · 계획서로 국한된다.
   **app/api/** 와 prisma/** 와 components/project/** 변경 0건.**
6. 세 캡처 컨테이너에 data-worksheet-id 가 'fitness'/'kano-aggregation'/'qfd' 로
   붙어 있다.
7. 코드 어디에도 mentors 응답의 email 을 읽는 곳이 없다.
8. 제품 이미지 업로드가 naturalWidth/naturalHeight 를 함께 넘긴다.
9. `git push` 성공. main 병합·배포 안 함.

[산출물·보고]
- 코드 + 테스트 + 계획서 Task 4 체크박스 갱신 (커밋 + push 완료)
- 보고서: docs/superpowers/reports/2026-09-08-final-report/task-4.md
  **별도의 둘째 커밋**(`docs: Task 4 결과 보고서`).

  RESULT / FILES CHANGED / COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS

  - VERIFIED BY 에는 완료 판정 1~4번의 실행 명령과 **출력 마지막 줄 원문**을.
  - RISKS 에 **"실화면에서 눌러보지 않았다"를 반드시 명시하라.** dev 서버 기동이
    금지돼 있으므로 그것이 정상이다 — 숨기지 말고 적어라.
  - QUESTIONS 에 감리자가 실화면에서 무엇을 확인해야 하는지 네가 아는 위험 지점을
    적어라.
```

---

## 감리자 메모 (프롬프트에 넣지 않는다)

### Task 3 판정 (2026-09-09): 승인

경계 확인 통과:
- 변경이 lib 1신규+1수정 · tests 1신규+1수정 · package(.json/lock) · docs 로 국한.
  app/·components/·prisma/ 미변경.
- **package-lock.json diff 가 7줄 추가·0줄 삭제.** 보고서의 "npm 이 14개 패키지
  제거를 보고했다"는 로컬 node_modules 정리였고 추적 파일에는 영향이 없음을 확인했다.
  html-to-image 는 전이 의존성이 0개라 lock 항목도 자기 하나뿐이다.
- stryker.crap.config.json 미변경. 기존 테스트 수정은 A 항목이 허용한 기대값 1줄뿐.

표본 대조:
- heading 수정(lib:121)과 그 회귀 테스트. 테스트가 `blocks[0] === {text: report.title}`
  으로 **model.title 과의 일치**를 단언한다 — 문구를 하드코딩하지 않아 제목이 바뀌어도
  따라간다. `not.toEqual('표지')` 회귀 방지도 있다.
- stryker 268개 불변이 맞다. 문자열 리터럴의 내용만 바뀌었으므로 뮤턴트 수는 그대로다.
- worksheet-capture.ts 복원 로직이 견고하다. `originals`(:10)와 `originalClass`(:8)를
  **try 블록 밖에서** 미리 수집해 예외 경로에서도 finally 가 복원한다. try 안에서
  수집했다면 실패 시 화면이 망가진 채 남았을 것이다.
- 스크롤 확장을 `[...elements].reverse()` 로 **안쪽부터** 하는 것도 옳다(주석에 이유
  명시). 원본 배열을 변형하지 않는 복사도 정확하다.
- 테스트가 성공·라이브러리실패·PNG직렬화실패 **세 경로 모두에서** class/style 복원을
  검증한다. `it.each(['fitness','kano-aggregation','qfd'])` 로 세 id 각각의 오류
  메시지와 `cause` 체인까지 본다.

프롬프트에 없던 좋은 판단 둘:
- `toPng` 대신 `toCanvas` + `toDataURL` — 실제 픽셀 크기를 추산하지 않고 얻기 위해.
- 가로 스크롤 컨테이너 폭 확장 — 없었으면 WS-9 QFD 캡처가 보이는 폭만큼 잘렸을 것이다.

### 실화면에서 확인할 것 (Task 4 병합 전, 감리자·사용자 몫)

게이트 독립 재실행은 이 세션에서 여전히 불가능하다(node_modules 없음, npm 403).
아래는 브라우저에서만 드러나는 것들이다.

1. **테마 상속** — captureWorksheetNode 는 대상 노드에 `.light` 를 붙이고 `.dark` 를
   뗀다. 앱이 `.dark` 를 root 에 두면 `.dark .text-white` 같은 상속 규칙이 여전히
   이길 수 있다. 실행 AI 도 RISKS 에 적었다. **캡처 결과에 흰 글자가 남는지 본다.**
2. **pixelRatio 2 와 문서 크기의 상호작용** — 캡처 픽셀이 2배라 fitImageToBody 가
   환산하는 mm 도 2배가 되고, 본문(170mm)을 넘으면 축소된다. 결과적으로 해상도만
   높아지고 크기는 맞지만, **화면에서 작던 차트가 문서에서 본문 폭 가득 찰 수 있다.**
   WS-7 SVG(720×750)가 특히 그렇다.
3. .docx 를 실제로 Word 로 연다 — 14개 DB 절이 값을 담는가, 세 그림이 잘리지
   않았는가, 파일명이 `결과보고서_<프로젝트명>.docx` 인가.
4. 빈 프로젝트(blocks 가 거의 빈 문서)에서 Word 가 문서를 여는가.
5. 첫 섹션의 SectionType.NEXT_PAGE 가 앞에 빈 페이지를 만들지 않는가.
6. Competitive Assessment 10열 균등폭에서 '항목'(요구사항 문구) 열이 세로로
   눌리지 않는가.
7. `GET /funding` 의 기본행 생성 부수효과 — WS-16 을 한 번도 안 연 프로젝트에서
   보고서 화면을 연 뒤 WS-16 에 기본 13행이 생겼는지 확인한다(의도된 동작이지만
   확인은 한다).
