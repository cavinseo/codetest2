# WS-6 오프라인 HTML 설문 — 타당성 검토와 설계

**작성일:** 2026-09-04
**대상 브랜치:** `claude/admin-account-password-recovery-o93xgy`
**상태:** 검토 완료·결정 완료(9절). 구현 계획서는 `docs/superpowers/plans/2026-09-04-kano-offline-html-survey.md`

## 1. 배경과 문제

WS-6 「Google Forms 연동 › 미리보기」는 온라인 설문(`app/survey/[token]/page.tsx`)과 같은 문항을 종이처럼 보여 주는 화면이다(`components/KanoSurveyPreview.tsx`). 질문은 이렇다 — **이 양식을 HTML 파일로 내보내 피설문자가 오프라인에서 답하게 하고, 답이 담긴 파일을 올리면 설문 응답 기록(`KanoResponse`)이 자동으로 만들어지게 할 수 있는가?**

### 1.1 이미 있는 것

응답이 DB 로 들어오는 길은 셋이다.

| 경로 | 입력 | 응답자 식별 | 요구사항 매칭 | 쓰기 |
| --- | --- | --- | --- | --- |
| 온라인 설문 `POST /api/survey/[token]/submit` | JSON `{ answers: { [requirementId]: { functional, dysfunctional } } }` | 초대 토큰 → 초대의 이메일 | **requirementId** (프로젝트 소속 검증) | `createMany` + 초대 `respondedAt` |
| 엑셀 업로드 `POST …/kano/upload-excel` | `.xlsx/.xls` (전용 양식·Google Forms 시트·매트릭스) | 행의 이메일, 없으면 합성(`excel-row-N@import.local`) | **순서(index)** | 트랜잭션: 삭제 정책 → 이메일마다 초대 upsert → `createMany` |
| Google Forms 수입 `POST …/kano/form-responses` | Google API | 폼 이메일, 없으면 `anonymous@google-forms` | 순서 | 시스템 초대 1건에 전부 연결, 중복 방지 없음 |

**핵심 사실: "파일 → 응답 기록 자동 생성" 파이프라인은 엑셀 경로에 이미 있다.** 초대 upsert(`@@unique([projectId, email])`), 응답 `createMany`, 덮어쓰기/추가 정책까지. 없는 것은 두 조각뿐이다 — (1) 오프라인에서 답을 받을 HTML, (2) 그 HTML 이 만든 파일을 `ParsedKanoUploadAnswer[]` 모양으로 바꾸는 파서.

### 1.2 실제 격차

- 현장 조사용으로 이미 Word 종이 설문(`docs/superpowers/plans/2026-09-03-kano-survey-docx.md`)과 엑셀 전용 양식 손입력이 있다. 오프라인 HTML 은 그것을 대체하지 않는다 — **"기기는 있지만 인터넷이 없는(또는 초대 링크를 쓰기 어려운)" 현장**을 위한 세 번째 길이며, 종이 응답은 계속 엑셀 경로로 들어온다. 이 관계는 운영 지침(계획서 Task 7)에 적는다.
- 미리보기 컴포넌트는 React 이고 Tailwind 에 의존한다. 그대로 저장해 보내면 오프라인에서 서식이 깨지고 라디오는 `disabled` 다.
- 엑셀 경로의 파서는 전부 **순서 기반**이다. 설문지를 배포한 뒤 요구사항을 추가·재정렬하면 답이 엉뚱한 문항에 붙는다. 온라인 제출은 `requirementId` 로 매칭하므로 그 문제가 없다.
- 업로드 가드(`lib/upload-guard.ts`)는 `.xlsx/.xls` 만 받는다.

## 2. 검토 방법

감리자가 핵심 파일을 직접 정독해 좌표를 확정한 뒤, 워크플로로 다음을 병렬 수행했다.

1. **보조 판독 3** — Google Forms 수입 경로, 초대 생명주기, 업로드 테스트·UI 관례.
2. **설계안 3** — 서로 다른 최우선 가치로 독립 작성: A 최소 변경(기존 파서가 삼키는 CSV), B 견고성(requirementId·해시를 담은 전용 JSON), C 피설문자 경험(온라인 우선·자기 저장형 HTML).
3. **심사 3** — 운영자·유지보수/보안·피설문자 관점에서 6기준 채점.
4. **실증** — 이 컨테이너의 헤드리스 Chromium(Playwright)으로 프로토타입 HTML 을 `file://` 로 열어 실제로 응답 파일이 만들어지는지 확인.
5. **반박 3** — 우승안의 핵심 주장(브라우저·서버/데이터·무결성/개인정보)을 회의론자가 반박.
6. **누락 비평 1**.

판정 근거는 감리자가 직접 읽은 코드와 직접 실행한 실증이며, 에이전트 보고의 사실 주장은 파일:라인으로 재확인했다.

## 3. 결론

**가능하다. 스키마 변경·새 npm 의존성 없이 된다.** 서버가 자급자족 HTML(외부 리소스 0)을 내려주고, 피설문자가 오프라인에서 답한 뒤 「답변 저장」으로 **답이 담긴 같은 HTML**(`kano-response-<id8>.html`)을 받아 담당자에게 보내면, 담당자가 여러 파일을 한 번에 올려 응답 기록이 만들어진다. 다운로드가 막힌 환경을 위해 같은 페이로드를 JSON 텍스트로 복사하는 폴백도 있고 서버는 둘 다 받는다(사용자 결정 B, 8.2절 실증). 응답 파일은 `requirementId` 와 질문 세트 해시를 담아 "어떤 문구에 대한 답인지"를 스스로 증명하며, 저장은 엑셀 경로와 같은 트랜잭션 함수를 공유한다.

심사 합산(6기준 × 3인): **B 67점**, C 53점, A 52점. 3인 모두 B 를 우승으로 골랐다.

## 4. 설계 요약

```
[관리자]  WS-6 › 미리보기 › 「오프라인 HTML 받기」
             │  GET /api/projects/{id}/kano/offline-survey  (읽기 권한)
             ▼
      Kano_설문_<프로젝트>.html   ← 자급자족: 문항·라디오·인라인 CSS/JS, requirementId·질문 해시 내장
             │  메일·메신저·USB 로 전달
             ▼
[피설문자]  파일 더블클릭(file://) → 라디오 응답 → 「답변 저장」
             │  모든 문항 필수 검사 → checked 속성 고정 + 응답 섬에 JSON 기입 → outerHTML 을 Blob + <a download>
             ▼
      kano-response-<id8>.html   ← 같은 설문 HTML + 응답 섬 { projectId, questionSetHash, questions[].h/t, submissionId, 이메일(선택), answers[requirementId] }
             │  다시 열면 답이 복원되고, 재저장하면 같은 submissionId 로 갱신. 폴백: 「내용 복사」로 JSON 텍스트
             │  담당자에게 회신
             ▼
[관리자]  WS-6 › 「오프라인 응답 파일 업로드」 (여러 파일 선택)
             │  POST /api/projects/{id}/kano/offline-responses  (쓰기 권한)
             │  파일마다: 파싱 → 프로젝트·해시·requirementId 검증 → 충돌·중복 검사
             ▼
      importKanoResponses(tx, …)   ← 엑셀 경로와 공용: 초대 upsert → KanoResponse createMany
```

### 4.1 응답 페이로드 형식 (`format: "kano-offline-response"`, `version: 1`) — 답변 HTML 의 응답 섬과 JSON 폴백에 공통

```json
{
  "format": "kano-offline-response",
  "version": 1,
  "projectId": "proj_…",
  "questionSetHash": "<sha256 hex 64자 — id 오름차순 [id, 긍정문구, 부정문구] 배열>",
  "questions": [ { "id": "<requirementId>", "h": "<sha256(id\\n긍정\\n부정) 앞 16자>" } ],
  "submissionId": "<uuid v4 — 저장 버튼 첫 클릭 때 생성, 페이지 세션 동안 고정>",
  "exportedAt": "<HTML 생성 시각 ISO>",
  "submittedAt": "<저장 시각 ISO>",
  "respondentEmail": "hong@example.com 또는 null",
  "answers": [ { "requirementId": "<id>", "functional": "LIKE", "dysfunctional": "DISLIKE" } ]
}
```

- 값은 온라인 제출과 같은 enum(`LIKE/EXPECT/NEUTRAL/TOLERATE/DISLIKE`). 서버가 `KANO_ANSWER_SCORE` 로 1~5 로 바꾸고 `classifyKanoResponse` 로 범주를 정한다. 엑셀 파서의 느슨한 라벨 정규식은 쓰지 않는다 — 오타·미응답을 조용히 흡수하지 않기 위해서다.
- 해시는 **order 가 아니라 id 로 정렬**해 계산한다. 매칭이 id 기반이므로 순서만 바꾼 것은 파일을 무효화하지 않는다. 문구가 바뀌거나 문항이 추가·삭제되면 세트 해시가 달라지고, 문항별 `h` 로 "이 답이 정확히 이 문구에 대한 답인지"를 문항 단위로 가려낼 수 있다.
- 파일명은 **ASCII** 다(`kano-response-<submissionId 앞 8자>.html`). 실증에서 POSIX 로케일 Chromium 이 비ASCII 파일명을 `download` 로 바꾸는 것이 확인됐다. 프로젝트명·응답자명은 파일명에 넣지 않는다.
- **자기 저장형 규칙(8.2절 실증으로 확정)**: 응답 섬은 설문 섬·스크립트보다 앞에 빈 채로 미리 둔다. 이전 답 조회는 저장 버튼 클릭 시점에 한다. 서버는 여러 섬 중 마지막 비어 있지 않은 것을 쓰고, 전부 비어 있으면 "아직 답하지 않은 설문 파일" 로 거절한다. 업로드된 HTML 은 파싱만 하고 어디에도 렌더하지 않는다.

### 4.2 서버

| 구성 | 파일 | 역할 |
| --- | --- | --- |
| 공용 수입 함수 | `lib/kano-response-import.ts` (신규) | `upload-excel` 의 트랜잭션 본문을 뽑아낸 `importKanoResponses(tx, respondents, options)`. 입력이 index 가 아니라 requirementId, 토큰 접두어·만료·기존 응답자 정책이 옵션. 엑셀 라우트도 이것을 쓰도록 리팩터링(동작 불변). |
| 업로드 가드 | `lib/upload-guard.ts` (수정) | `checkUploadedFile(value, { extensions, maxBytes, label })` 일반화. 기존 엑셀 함수는 래퍼로 유지. |
| 오프라인 설문 모델·렌더러 | `lib/kano-offline-survey.ts` (신규, 순수) | 해시 2종, 모델(문구는 `resolveKanoQuestionPair`, 라벨은 `kanoSurveyAnswerLabels`), HTML 문자열 렌더. |
| 내려받기 라우트 | `app/api/projects/[id]/kano/offline-survey/route.ts` (신규 GET) | `survey-document` 라우트 골격. `text/html` 첨부, `no-store`, `nosniff`. |
| 응답 파일 파서 | `lib/kano-offline-response.ts` (신규, 순수) | 답변 HTML(응답 섬 추출) 또는 JSON 텍스트 → 검증된 응답, 현재 질문 세트와 대조(문구 해시 재매칭 포함), 합성 이메일, 배치 내 중복 검사. |
| 수입 라우트 | `app/api/projects/[id]/kano/offline-responses/route.ts` (신규 POST) | 다중 파일, 파일별 판정, 충돌 정책, 단일 트랜잭션. |

### 4.3 화면 (`components/project/KanoManager.tsx`, `components/KanoSurveyPreview.tsx`)

- Google Forms 카드 1단계 「미리보기」에 **「오프라인 HTML 받기」** 링크. 미리보기 모달 제어바에도 같은 링크.
- 「응답 파일로 업로드」 카드 아래에 **「오프라인 응답 파일 업로드」** 카드: `<input type="file" multiple accept=".html,.htm,.json,.kano.json">`, 업로드 전 클라이언트 사전 검사(`File.text()` 로 `format`·`projectId` 확인 — 다른 프로젝트 파일·설문 HTML 오첨부를 서버 왕복 없이 표시), 결과 패널(성공 수·실패 파일과 사유). **추가(append) 고정** — 덮어쓰기(replace)는 제공하지 않는다.
- 질문 세트가 바뀐 경우(409) 안내 박스: "배포 후 질문이 바뀌었습니다(추가 a·삭제 b·문구 변경 c)" + 「일치하는 문항만 등록」 버튼 → 명시 수락으로 재전송.
- 이미 다른 경로로 응답한 이메일과 충돌(파일별 `RESPONDENT_EXISTS`) 안내 + 「해당 파일만 덮어쓰기」 재전송.
- 초대 내역에서 `offline_` 토큰 초대는 "오프라인 응답 #앞8자" 로 표시하고 「링크 복사」를 숨긴다(즉시 만료 토큰이라 링크가 무의미).
- 미리보기 컴포넌트의 인라인 기본 문구를 `resolveKanoQuestionPair` 로 바꿔 화면·Word·HTML 의 문구 정본을 하나로 맞춘다.

## 5. 데이터 처리표

| 대상 | 오프라인 경로의 처리 | 근거 |
| --- | --- | --- |
| `KanoSurveyInvitation` | 이메일(또는 합성 이메일)마다 1건 upsert. `token = offline_<submissionId>`, `expiresAt = now`(즉시 만료), `respondedAt = submittedAt`, `isUsed = true`, `invitedBy = 업로더`. | `KanoResponse.invitationId` 가 필수(Restrict)라 스키마 변경 없이 만족하려면 초대가 있어야 한다. 즉시 만료로 두는 이유: '응답 데이터 리셋'(`lib/kano-response-reset.ts`)이 `respondedAt` 만 비우므로, 만료가 없으면 리셋 뒤 합성 이메일 명의로 온라인 응답이 가능해지는 구멍이 생긴다(엑셀 경로 `excel_` 초대에 이미 있는 구멍). |
| `KanoResponse` | 파일의 answers 마다 1행. `respondentEmail` = 파일 이메일(소문자·trim) 또는 `offline-<submissionId 에서 하이픈을 지운 뒤 앞 12자>@import.local`. | 파일마다 유일한 합성 이메일이라 여러 익명 응답자가 분석에서 1명으로 합쳐지지 않는다(`countUniqueProjectRespondents` 는 `respondentEmail` 기준). 같은 파일 재업로드는 같은 이메일 → 자기 응답만 지우고 재생성(멱등). |
| 기존 응답자(온라인·엑셀·구글폼)와 같은 이메일 | **기본 거절**(`RESPONDENT_EXISTS`). 관리자가 파일별로 명시 승인할 때만 덮어쓴다. | 파일의 이메일은 피설문자의 자기 신고 값이라 사칭으로 타인의 온라인 응답을 지울 수 있다(반박 3). 엑셀 경로는 기존 규칙(덮어쓰기)을 그대로 둔다. |
| 질문 세트 불일치 | 기본 409 + 변경 요약. 명시 수락 시 문항별 `h` 가 현재와 같은 답만 수입, 나머지는 `droppedAnswerCount` 로 보고. | 데이터가 조용히 빠지거나 엉뚱한 문항에 붙는 것을 막는다. |
| 다른 프로젝트의 파일 | 400 (`projectId` 불일치). 해시가 같아도 `requirementId` 소속 검증은 항상 돈다. | 온라인 제출과 같은 계약. |
| 로그·응답 본문 | projectId·파일 수·응답자 수·응답 수·탈락 수만. 이메일·submissionId·파일 내용은 넣지 않는다. 500 은 `toErrorResponse` 고정 문구. | `lib/logger.ts` 규칙. |

## 6. 리스크와 완화

반박 3건은 전부 "현 문안으로는 불충분"으로 나왔고, 아래처럼 설계에 반영했다.

| 리스크 | 출처 | 완화 |
| --- | --- | --- |
| 응답자 사칭 — 파일에 타인 이메일을 적으면 append 가 그 사람의 온라인 응답을 삭제·대체 | 반박 3 | 기존 응답자 충돌 시 **기본 거절**, 파일별 명시 승인으로만 덮어쓰기 (5절) |
| 이메일 대소문자 — `projectId_email` 유니크는 대소문자를 구분해 같은 사람이 두 행이 됨 | 반박 1 | 오프라인 파서가 소문자·trim 으로 정규화하고, 충돌 검사는 `mode: 'insensitive'` 로 기존 표기까지 찾는다 |
| 배포 환경 상한 — Vercel 서버리스는 요청 본문 약 4.5 MB·실행 시간 제한이 있고(문헌 지식, 이 컨테이너에서 미확인), 대화형 `$transaction` 기본 타임아웃은 5초 | 비평 1, 반박 1 | 요청당 **20 파일·파일당 256 KB**, 화면이 20개씩 순차 배치 전송, 라우트 `maxDuration = 60`, `$transaction(fn, { timeout: 60_000, maxWait: 10_000 })`. 배치 간 원자성은 없지만 submissionId 멱등으로 재시도가 안전하다. 감리자가 실배포 URL 에서 21개 업로드를 확인한다 |
| **requirementId 의 수명** — 요구사항 AI 재생성은 새 id 로 전부 갈아 끼우고(`app/api/projects/[id]/requirements/route.ts:84-118`), JSON 가져오기도 새 id 를 부여한다(`import-json/route.ts`). 배포된 파일의 id 가 통째로 무효가 된다 | 비평 2 | 파일에 id 를 뺀 **문구 해시 `t`** 를 함께 싣고, 세트 불일치 수락 시 id 가 없어진 답은 `t` 가 현재 문항 정확히 하나와 일치할 때 그 문항으로 재매칭한다. 운영 지침에 "배포 후 AI 재생성·JSON 이관 금지" 를 적는다. 요구사항 저장 라우트의 캐스케이드 경고 문구 보강은 후속(10절) |
| **수신 채널 미검증** — 카카오톡 인앱 브라우저, Outlook 첨부 → Edge(Mark-of-the-Web), iPhone 메일/파일, 회사 메일 게이트웨이의 `.html` 첨부 필터. 이 컨테이너는 Chromium 뿐 | 비평 3 | **Task 0 파일럿**: 사용자가 PoC HTML 을 실제 채널로 보내 열기·답·저장을 표로 확인한 뒤에 Task 1 을 시작한다. 막히는 채널에는 온라인 초대 링크·Word 인쇄본을 병기한다 |
| 개인정보 고지 없음 — 외부인이 이메일을 직접 입력하는 새 경로 | 비평 4 | HTML 에 목적·문의처 한 줄 고지. 이메일은 선택. 응답자 단위 삭제 API 는 없으므로(전체 리셋뿐) 후속 후보(10절) |
| 역할 — 쓰기 권한(OWNER/EDITOR/ADMIN)만 업로드 가능. 코치·매니저가 현장 수집을 대신하면 403 | 비평 5 | 엑셀 업로드와 같은 규칙으로 두고 결정 사항에 적는다. 넓혀야 하면 `requireProjectAccess(…, { roles })` 로 사용자 결정 |
| 운영 중인 엑셀 라우트 리팩터링 — 실DB 전체 삭제(`replace`)를 수행하는 경로에 테스트 0건 | 비평 7 | **v1 은 엑셀 라우트 무수정.** 공용 함수는 오프라인 경로만 쓰고, 엑셀 통합은 감리자 실기동을 동반한 별도 계획 |
| 되돌리기 — 오프라인 유입 데이터를 골라 지울 수단이 없고 화면에 바로 노출됨 | 비평 9 | 환경 변수 `NEXT_PUBLIC_KANO_OFFLINE_SURVEY` 로 화면 게이팅(코드 배포와 공개 분리), 파일럿은 별도 프로젝트에서. 선택 삭제는 `offline_` 토큰 접두어를 출처 표지로 삼는 리셋 유틸이 후속 후보 |
| 클라이언트 번들 — 해시 모듈이 node `crypto` 를 쓴다 | 비평 11 | 화면은 그 모듈을 import 하지 않고 `format`/`projectId` 만 사전 검사한다. 화면 Task 게이트에 `npm run build` |
| `pretest` 의 `check-text-encoding` — BOM·깨진 문자 픽스처가 게이트를 깨뜨림 | 비평 12 | 픽스처는 이스케이프로 코드 안에서 만들고 `tests/` 에 바이너리 파일을 두지 않는다. (이 검토 문서 초안도 코드 스니펫에 날 U+FEFF·U+2028 이 들어갔다가 잡혔다) |
| 멘티 삭제 미리보기의 "보낸 초대 수" 에 오프라인 유입이 섞임 | 비평 14 | `invitedBy` 는 업로더로 두고(엑셀과 동일) 삭제 지침 문서에 한 줄 추가 |
| 다운로드 실패를 페이지가 감지 못 하고 "저장했습니다"를 표시 | 반박 2(Chromium 실험) | 성공을 단정하지 않는 문구 + **항상 보이는** 「내용 복사」 textarea 폴백 + 파일명을 크게 표시 |
| `crypto.randomUUID` 가 없는 환경에서 저장이 예외로 죽음 | 반박 2 | `crypto.getRandomValues` 기반 UUID v4 폴백 |
| 비ASCII 파일명이 `download` 로 바뀜 | 실증 | 파일명 ASCII 고정 |
| 피설문자가 답하지 않은 원본 HTML·스크린샷을 보냄 | 설계 B, 결정 B | 답변 파일이 곧 설문 HTML 이므로 형식 혼동은 사라진다. 응답 섬이 비어 있으면 서버가 "아직 답하지 않은 원본 설문 파일" 로 안내. 스크린샷·종이는 엑셀 전용 양식으로 손입력(기존 경로) |
| 자기 저장형 HTML 의 섬 배치 — 응답 섬을 문서 끝에 붙이면 다시 연 파일에서 스크립트가 먼저 실행돼 이전 답을 못 찾고, 재저장 시 섬이 두 개가 됨 | 8.2절 실증(1차 실패) | 응답 섬을 스크립트 앞에 빈 채로 선배치, 조회는 저장 시점, 서버는 마지막 비어 있지 않은 섬 채택 |
| 회신 방향의 `.html` 첨부 필터 | 결정 B | 파일럿은 설문 HTML 이 열리는 것까지 확인했고 회신은 미확인. 「내용 복사」 JSON 폴백을 항상 노출하고 서버가 `.json` 도 받는다 |
| 익명 응답자가 HTML 을 다시 열어 두 번 저장하면 두 명으로 집계 | 설계 B | submissionId 는 페이지 세션당 1개, 저장 후 버튼 비활성화 + "한 번만 저장" 안내. 개별 응답 삭제 API 는 없으므로 관리자는 리셋으로만 정리 가능(한계) |
| `</script>` 를 포함한 요구사항 문구로 HTML 이 깨짐 | 심사 | 모든 텍스트 `escapeHtml`, JSON 섬은 `<` → `<`. 테스트 1순위 |
| 전송 구간(메일·메신저) 평문 | 설계 B | 파일의 개인정보는 선택 입력한 이메일뿐. HTML 안내문에 명시. 암호화·서명은 제공하지 않는다(정직한 한계) |
| `lib/kano-survey-document.ts`(뮤테이션 목록) 수정 | 설계 B | 파일명 정제 함수만 export 로 분리. 해당 Task 는 stryker 재실행·점수 보고 |

## 7. 설계 검토 — 대안과 기각 이유

**A. 최소 변경(CSV-호환 HTML, 기존 파서 재사용) — 기각.** 매력은 "백엔드 3줄"이지만, (1) 순서 기반 매칭이라 배포 후 요구사항 추가·재정렬에 취약하고, (2) 서버 무결성 검증이 0 이라 다른 프로젝트의 CSV 도 문항 수만 같으면 조용히 저장되며, (3) 핵심 전제인 "SheetJS 가 BOM 붙은 CSV 버퍼를 UTF-8 로 읽는다"가 이 컨테이너(xlsx 미설치)에서 검증 불가였고, (4) 설계안의 이메일 정규식이 `first-last@`·`user+tag@` 를 거부하는 결함이 심사에서 발견됐다. 접목한 것: 업로드 전 클라이언트 사전 검사, 인쇄 CSS.

**C. 온라인 우선·자기 저장형 HTML — 온라인 우선 제출은 기각, 자기 저장형 왕복은 채택(결정 B).** 인터넷이 되면 바로 제출하는 경험은 좋지만, 공개 엔드포인트가 임의 이메일로 `KanoSurveyInvitation` 을 선점해 이후 관리자의 온라인 초대(`invite/route.ts` 가 400)를 막는 부작용이 있고, 무상태 토큰은 회수가 안 된다(스키마 변경 필요). 접목한 것: 초대 내역 라벨링, 파일별 실패 수집(부분 성공), 토큰 `offline_<submissionId>` 로 DB 수준 멱등, `overwrittenRespondentCount` 표시. "HTML 이 자기 자신에 답을 써 넣어 저장"하는 단일 파일 왕복은 검토 뒤 사용자가 택했고(결정 B) 8.2절에서 실증했다 — 서버 파서에 섬 추출이 더해질 뿐이다.

## 8. 실증 결과 (헤드리스 Chromium, 이 컨테이너)

| 항목 | 결과 |
| --- | --- |
| 외부 리소스 0 인 단일 HTML 생성(요구사항 3개) | 17,854 B |
| `file://` 로 열기 + 네트워크 전면 차단(`page.route` abort) | 동작 |
| 미답 상태에서 저장 클릭 | 차단, 다운로드 이벤트 없음 |
| 6개 라디오 + 이메일 입력 → 저장 | JSON 638 B 다운로드, answers 3개·requirementId 3종·값 일치 |
| JSON → `ParsedKanoUploadAnswer[]` 순수 변환 | 3개 |
| 다운로드 파일명 | POSIX 로케일에서 비ASCII → `download`; `LC_ALL=C.UTF-8` 이면 보존. **Windows 실사용 PC 는 미확인** → ASCII 파일명 채택 |
| 다운로드가 정책으로 막힌 경우 | 페이지는 감지 못 함(`acceptDownloads=false` 실험) → 복사 폴백 상시 노출 |

### 8.2 자기 저장형 HTML 실증 (결정 B 의 근거)

감리자가 헤드리스 Chromium 으로 2문항 프로토타입을 돌렸다.

| 단계 | 결과 |
| --- | --- |
| 원본에서 답 → 「답변 저장」 | `kano-response-<id>.html` 4 KB 다운로드. 응답 섬에 답 2건, 라디오 `checked` 속성 4개 고정 |
| 다운로드된 파일을 다시 열기 | 라디오 4개·이메일 복원, 이전 답변 인식 문구 표시 |
| 답 하나 바꿔 재저장 | 같은 submissionId, 바뀐 값 반영, 내용 있는 섬 정확히 1개 |
| 원본(미답) 파일 | 응답 섬 비어 있음 → 서버가 "미답 설문 파일" 로 구분 가능 |

**1차 시도의 실패**: 응답 섬을 `<body>` 끝에 `appendChild` 하고 로드 시점에 조회하니, 다시 연 파일에서 스크립트가 섬보다 먼저 실행돼 이전 답을 못 찾고 재저장 시 섬이 두 개가 됐다. 섬을 스크립트 앞에 선배치하고 조회를 저장 시점으로 옮겨 해결했다 — 4.1절 규칙.

### 8.1 파일럿 결과 (Task 0)

2026-09-04 사용자 보고: **정상.** 실제 채널로 프로토타입 HTML 을 보내 열기·답·저장이 됐다. 채널별 세부 표(어느 채널을 썼는지)는 보고에 없으므로 "확인된 채널" 은 사용자가 실제로 쓴 채널로 한정된다. 이로써 결정 19(파일럿 선행)가 충족돼 Task 1 을 시작한다.

**부수 발견(기존 결함, 이번 범위 밖):** `lib/kano-upload-parser.ts:12` 의 `/like/i` 가 `dislike` 에 먼저 매치된다(영문 라벨 입력에만 영향, 숫자·한글은 무관). `form-responses` 는 같은 폼을 두 번 수입하면 응답이 두 배가 된다(중복 방지 없음). `upload-excel` 의 `replace` 는 미응답 온라인 초대까지 지운다. 10절에 후속 후보로 적는다.

## 9. 확정 사항

감리자가 정했다. **Task 1 착수 전**에 이의가 있으면 바꾼다.

| # | 항목 | 결정 | 이유 |
| --- | --- | --- | --- |
| 1 | 응답 페이로드 형식 | 4.1절 JSON. 값은 enum 만 | requirementId·해시로 자기 증명. 심사 만장일치 |
| 2 | 답변 파일 | **답이 담긴 설문 HTML 자체(자기 저장형 왕복)** 를 기본으로, 「내용 복사」 JSON 을 폴백으로. 서버는 둘 다 받는다 | 사용자 결정 B(2026-09-04). 피설문자가 파일 한 종류만 다루고 자기 답을 다시 열어 확인·수정할 수 있다. 8.2절 실증 |
| 3 | 기존 응답자와 이메일 충돌 | **기본 거절**, 파일별 명시 승인 시에만 덮어쓰기 | 사칭 방어(6절). 엑셀 경로는 기존 규칙 유지 |
| 4 | 오프라인 경로의 `replace`(전체 삭제) | 제공하지 않는다(append 고정) | 파일 1장=응답자 1명인 경로에서 전체 삭제는 사고 경로 |
| 5 | 오프라인 초대 | `token = offline_<submissionId>`, `expiresAt = now`, `invitedBy = 업로더` | DB 수준 멱등 + 리셋 후 온라인 응답 구멍 차단 |
| 6 | 응답자 이메일 | 선택. 없으면 `offline-<submissionId 에서 하이픈을 지운 뒤 앞 12자>@import.local` | 익명 응답 허용, 파일마다 유일 |
| 7 | 파일명 | 설문 `Kano_설문_<프로젝트명 정제>.html`(서버가 정함, RFC 5987) / 답변 `kano-response-<id8>.html`(브라우저, ASCII) | 실증 |
| 8 | 배치 정책 | 검증 통과 파일만 한 트랜잭션으로 저장, 실패 파일은 목록으로 반환. **요청당 10 파일·파일당 400 KB**(답변 HTML ≈15 KB + 문항당 2.3 KB), 화면이 10개씩 순차 전송, 라우트 `maxDuration = 60` | 운영자 마찰 최소 + Vercel·Prisma 상한 |
| 9 | 질문 세트 불일치 | 기본 409 + 변경 요약. 명시 수락 시 문항별 `h` 일치분 + **id 가 바뀐 문항은 문구 해시 `t` 로 재매칭**(정확히 하나일 때만) | 조용한 탈락 방지, AI 재생성·JSON 이관 대비 |
| 10 | 값 검증 | enum 만. 정규식 흡수 없음 | 온라인 제출과 동일 |
| 11 | 파서 구현 | zod 없이 손 검증(순수 TS) | stryker 100% 대상이고, 이 컨테이너에서 `node --experimental-strip-types` 로 실행 검증 가능 |
| 12 | 미리보기 문구 정본 | `KanoSurveyPreview` 도 `resolveKanoQuestionPair` 로 통일 | 화면·Word·HTML 문구 한 출처 |
| 13 | 감리자 실기동 | 생성된 실제 HTML 을 Playwright 로 스모크 + 사용자 실계정에서 Windows Chrome/Edge 확인 + 실배포 URL 에서 21파일 배치 | 레시피 5·6·7단계 |
| 14 | 엑셀 라우트 | **무수정.** 공용 수입 함수는 오프라인 경로만 쓴다 | 실DB 전체 삭제 경로에 테스트 0건 — 회귀 위험이 이번 이득보다 크다 |
| 15 | 화면 노출 | 환경 변수 `NEXT_PUBLIC_KANO_OFFLINE_SURVEY=on` 으로 게이팅 | 파일럿·되돌리기 |
| 16 | 업로드 권한 | 엑셀 업로드와 같은 쓰기 권한 | 코치·매니저 대행이 필요하면 사용자 결정으로 확장 |
| 17 | `invitedBy` | 업로더(엑셀과 동일). 삭제 지침에 한 줄 | 일관성 |
| 18 | 개인정보 고지 | HTML 에 "입력한 이메일은 답변 파일에 담기며 설문 결과 관리 목적으로만 쓰입니다. 문의: 설문 담당자" | 외부인 이메일 직접 수집 경로 |
| 19 | 파일럿 선행 | Task 1 전에 사용자가 실제 채널로 PoC HTML 을 검증 | 기능의 성패가 서버가 아니라 "파일을 열 수 있는가" 에 달렸다 |

**사용자가 뒤집을 수 있는 제품 결정(기본값과 바꿀 때의 비용):** ① 별도 답변 파일 vs 자기 저장형 단일 HTML — **사용자가 자기 저장형(B)을 택했다**(2026-09-04). ② 익명 허용 — 기본 허용; 금지하면 파서 한 줄·안내문. ③ 기존 응답자 덮어쓰기 — 기본 거절; 항상 덮어쓰기로 바꾸면 Task 5 의 충돌 검사 제거. ④ 배치 실패 정책 — 기본 부분 성공; 전부-또는-무로 바꾸면 Task 5 분기 하나. ⑤ 초대 만료 — 기본 즉시; +1년으로 바꾸면 리셋 후 온라인 응답 구멍이 생긴다. ⑥ 채널별 분석 — 기본 없음; 필요하면 `KanoResponse.source` 컬럼(원격 실DB 마이그레이션, 별도 계획). ⑦ 업로드 역할 확장 — 기본 없음.

### 9.1 이번 구현에서 빠지는 것

- zip 일괄 업로드(의존성 없음), 온라인 우선 제출, 파일 서명·암호화, 응답자 단위 삭제 API, 채널별 분석(출처 컬럼), 엑셀 라우트의 공용 함수 통합, 요구사항 저장 라우트의 캐스케이드 경고 보강, Safari·iOS·Android 검증(Task 0 파일럿과 실기동 단계로 이월).

### 9.2 운영자에게 필요한 것

- 피설문자 안내문(HTML 안에 내장): "파일을 열어 답한 뒤 「답변 파일 저장」 → 받은 `.kano.json` 을 담당자에게 회신. 한 번만 저장. 입력한 이메일은 파일에 담김."
- 담당자 절차: 회신 파일을 한 폴더에 모아 「오프라인 응답 파일 업로드」에서 여러 개 선택 → 결과 패널의 실패 파일을 확인.

## 10. 범위 밖·후속 후보

| 후보 | 근거 |
| --- | --- |
| `lib/kano-upload-parser.ts:12` `/like/i` 가 `dislike` 를 먼저 잡음 | 실증·심사에서 코드로 재확인. 영문 라벨 입력에만 영향 |
| `form-responses` 중복 누적(삭제 정책 없음) | 판독 |
| `upload-excel` `replace` 가 미응답 온라인 초대까지 삭제 | 판독. 동작 변경이라 별도 결정 필요 |
| `upload-excel` 의 `console.error` → `createLogger`/`toErrorResponse` | Task 1 리팩터링에 포함(작음) |
| 리셋 시 `offline_`/`excel_` 초대 함께 삭제(초대 내역 UX) + 오프라인 유입만 선택 삭제 | 설계 B 리스크, 비평 9. 사용자 결정 |
| 자기 저장형 HTML(단일 파일 왕복) | 7절 C 접목 후보 |
| 엑셀 라우트를 `importKanoResponses` 로 통합 | 결정 14. 감리자 실계정으로 append/replace 실기동을 동반해야 한다 |
| 응답자 단위 삭제 API(이메일 기준 응답+초대 삭제) | 비평 4. `upload-excel` append 의 삭제 블록을 재사용하면 작다 |
| 요구사항 저장(AI 재생성)의 캐스케이드 확인 문구에 "배포된 오프라인 설문 파일도 영향" 추가 | 비평 2 |
| `KanoResponse.source` 컬럼(채널별 분석) | 비평 10. 원격 실DB 마이그레이션이라 별도 계획·사용자 결정 |

## 11. 검토의 한계

- 실제 라우트·vitest·tsc 는 이 컨테이너에서 실행하지 못했다(`node_modules` 없음). 모든 코드 골격은 기존 파일 근거로 검증한 설계이며, 실행 검증은 계획서의 게이트와 감리자 실기동에서 한다.
- 브라우저 검증은 Chromium 뿐이다. Safari(macOS/iOS)·Android Chrome·카카오톡 인앱 브라우저·Outlook 첨부(Mark-of-the-Web)·회사 보안 정책(파일 다운로드 차단, `.html` 첨부 필터)은 미확인이며, Task 0 파일럿과 실기동 단계에서 확인해야 한다.
- Vercel 의 본문·실행 시간 상한 수치는 문헌 지식이다. 실배포 URL 에서 21파일 배치 업로드를 감리자가 확인하는 것으로 닫는다.
- 감리자가 PoC HTML 을 직접 헤드리스 Chromium 으로 재실행해 외부 참조 0·미답 차단·다운로드·값 일치를 재확인했고, 비ASCII 파일명이 `download` 로 바뀌는 현상도 재현했다.
- 실DB 의 `excel_`/`system_` 초대 건수와 초대 내역 카드의 실제 렌더 모습은 DB 접속·dev 서버 금지로 코드 근거로만 판단했다.
- **정정(2026-09-04)**: 5절·9절의 합성 이메일을 "`submissionId` 앞 12자"라고만 적어 두었다. `submissionId` 는 하이픈이 든 UUID 라 실제 구현(`lib/kano-offline-response.ts:196`)은 하이픈을 먼저 지우고 12자를 자른다 — `a1b2c3d4-e5f6-…` 이면 `offline-a1b2c3d4e5f6@import.local` 이다. 이 문구가 계획서 결정표 6번과 Task 7 운영 지침으로 그대로 번졌고, Task 7 감리에서 잡아 세 문서를 함께 고쳤다. 설계서의 한 줄이 아래 문서 전부를 오염시킨다는 사례로 남긴다.
- 구현이 끝난 뒤의 미확인 사항은 계획서 Task 8 Step 3 에 정리했다(수신 채널, 응답자 쪽 보안 정책, Vercel 서버리스 상한, 100문항 크기 실측, 응답자 단위 삭제 부재).
