# 코드 종합검진 보고서 — kano-qfd-webapp

**일시:** 2026-08-20
**브랜치:** `feat/member-roles-and-invites`
**방법:** 읽기 전용 전문 에이전트 4종(코드품질·보안·테스트/데이터·레포위생) 병렬 조사 후 교차 검증
**범위:** TS/TSX 229파일, API 라우트 56개, lib 64개, 컴포넌트 23개 (약 3만 LOC)

> 주: 이 브랜치의 미커밋 회원관리 작업(member-roles, invite-code)이 라우트에 연결되지 않은 것은 **의도된 미완성**이라 결함에서 제외했다. 최근 커밋 #19~23으로 이미 고쳐진 항목도 현재 상태 기준으로 재확인해 제외했다.

## 조치 현황 (2026-08-21 갱신)

`docs/superpowers/plans/2026-08-20-health-check-remediation.md` 계획으로 Task 0~9 를 수행했다. 테스트 437 → 490, 프로덕션 취약점 14 → 9, 뮤테이션 기준선 90%. 게이트(generate·lint·tsc·test·build) 전부 통과.

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| C-1 저장소 히스토리 dev.db | **미해결 — 사용자 조치 필요** | 계정 설정 변경·force push 라 코드로 못 한다. 명령어는 계획서 상단에 있다 |
| C-2 form-responses FK | ✅ 해결 | `e6f5aff` |
| H-1 오픈 리디렉트 | ✅ 해결 | `05f3383`, `c7c9e44`(제어문자 우회까지) |
| H-2 OAuth 콜백 인증 | ✅ 해결 | `2ca27fd` 서명 nonce → 최종 리뷰에서 세션 쿠키가 nonce 로 위조되는 Critical 발견 → `2b775a6` 도메인 분리 + 콜백 admin 재확인으로 이중 방어 |
| H-3 import-json 검증·확인 | ✅ 해결 | `455e9da`, `613809f`, `d125cb9` |
| H-4 워크시트 캐스케이드 | ✅ 해결 | `30a14d0` |
| H-5 동시 저장 낙관적 잠금 | **미해결 — 별도 계획** | 18개 라우트 + 스키마 변경이라 이 계획에서 의도적으로 제외 |
| H-6 FK 실측 테스트 | ✅ 작성 / ⚠️ 미실행 | `7ed6b78`, `663fc38`. 로컬 전용 DB 가 있어야 실행된다 |
| H-7 로그아웃 세션 무효화 | ✅ 해결 | `d45ec92` |
| H-8 의존성 취약점 | ✅ 부분 (14→9) | `713eabd`. 남은 9 는 `--force` 가 exceljs·prisma 를 내려 미적용 |
| H-9 미커밋 백업 | ✅ 해결 | `0c622db` 커밋 + origin 푸시 |
| H-10 라우트 자기 호출 | **미해결 — 범위 밖** | 성능·비용 문제라 데이터 안전 우선순위에서 분리 |
| H-11 오류·PII 노출 | ✅ 해결 | `6a3c3f8` |

Medium·Low 는 "일관성 회복" 부류라 Critical·High 정리 후로 미뤘다. 그중 M-7(export 반쪽)은 H-3 작업 중 재확인됐다 — `KanoResponse.invitationId` 를 export 가 안 내보내 교차 프로젝트 복원은 여전히 실패한다.

## 종합 소견

> **좋은 심장, 무거운 팔다리.** 코어 인프라(세션 서명·버저닝, 인가, 레이트리밋, 설정 암호화, `api-error`·`upload-guard`·`bulk-worksheet-route` 팩토리)는 근거가 주석으로 남고 테스트가 받치는 상급 품질이다. 문제는 그 좋은 도구의 **적용 반경**이다. 팩토리는 9개 중 5개 라우트만, `upload-guard`는 3개 중 1개, `toErrorResponse`는 일부만 쓰여, 같은 결함이 "고쳐진 곳과 안 고쳐진 곳"으로 갈라져 있다.

| 영역 | 건강도 | 핵심 소견 |
|---|---|---|
| 코드품질·아키텍처 | 🟠 | 코어는 견고. 팩토리·가드·에러헬퍼 미적용 라우트에 구세대 패턴 잔존. 500줄+ 클라이언트 컴포넌트 8개 |
| 보안 (OWASP) | 🟠 | 인증·IDOR·인젝션 방어는 견고. OAuth 오픈리디렉트, 로그아웃 세션 미무효화, 일부 검증 공백 |
| 테스트·데이터 무결성 | 🔴 | 라우트 테스트 12/57. Prisma 전면 mock이라 FK·캐스케이드·동시성 미실측. 캐스케이드 삭제 확인 부재 다수 |
| 레포 위생·빌드 | 🔴 | **공개 저장소 히스토리에 개발 DB 노출.** 프로덕션 의존성 취약점 14건. 기능 전체가 미커밋·미백업 |

교차 검증에서 **2개 이상 에이전트가 독립적으로 같은 파일을 지적한 항목**(form-responses FK, import-json 검증부재, attributes/requirements 캐스케이드)은 신뢰도가 높아 우선순위를 올렸다.

---

## 🔴 Critical — 즉시 조치

### C-1. 공개 GitHub 저장소 히스토리에 개발 DB 노출
`prisma/dev.db` (히스토리) · 저장소 `cavinseo/codetest2` = **PUBLIC** (직접 재확인)

현재 트리에선 지웠지만(커밋 `61ed7de`) 과거 커밋 `f77cc21`·`38c737c`에 blob이 남아 origin/main에서 도달 가능하다. 누구나 `git checkout 38c737c -- prisma/dev.db`로 복원할 수 있다. blob 검사 결과 사업계획 도메인 27개 테이블, 이메일 형태 문자열 772건 포함(example/test 계열로 보이나 전수 확인 필요, bcrypt 해시는 0건). `.gitignore` 주석 스스로 "로컬 개발 DB는 사적 테스트·사업 데이터를 담을 수 있다"고 밝힌 파일이다.

```bash
# 1) 5분 완화 — 비공개 전환 (계정 설정 변경이라 사용자 판단 필요)
gh repo edit cavinseo/codetest2 --visibility private --accept-visibility-change-consequences
# 2) 근본 조치 — 협업자 조율·WIP 정리 후 히스토리에서 제거
pip install git-filter-repo
git filter-repo --invert-paths --path prisma/dev.db
git push origin --force --all && git push origin --force --tags
# 3) 이메일 772건이 실사용자 데이터면 해당 사용자 고지
```

### C-2. Google Forms 응답 가져오기가 첫 실행부터 항상 실패
`app/api/projects/[id]/kano/form-responses/route.ts:83` (품질·데이터 에이전트 교차 확인)

시스템 초대 레코드를 `invitedBy: 'system'`으로 만드는데, `KanoSurveyInvitation.invitedBy`는 `User.id`에 대한 **필수 FK**(schema.prisma:203,209)다. `'system'` 사용자는 seed 어디에도 없어(전체 grep 확인) 새 프로젝트에서 이 기능이 **P2003 FK 위반으로 100% 실패**한다. 게다가 그 Prisma 오류 메시지가 `:132`에서 클라이언트에 그대로 노출된다. 테스트 437개가 전부 green인데 이 버그가 사는 이유 = Prisma 전면 mock이라 FK가 한 번도 실제로 실행되지 않기 때문(→ H-6의 구조적 맹점).

**수정:** `invitedBy: accessResult.user.userId`(요청한 관리자)로 변경, catch는 `toErrorResponse`로 교체.

---

## 🟠 High — 머지 전 권장

### H-1. OAuth `returnUrl` 오픈 리디렉트 (`//evil.com` 우회)
`app/api/auth/google/callback/route.ts:38` · `route.ts:23` (보안 에이전트, 직접 재현 확인)

`rawReturnUrl.startsWith('/')`로 내부 경로만 허용하려 하지만 `//evil.com`이 이 검사를 통과한다. 이후 `new URL(`${returnUrl}?...`, request.url)`이 이를 protocol-relative URL로 해석해 호스트가 외부로 바뀐다. 실측: `//evil.com` → `http://evil.com/?google_auth=success`. 토큰이 쿼리에 없어 자격증명 유출은 없으나 피싱 리디렉트로 실사용 가능.

**수정:** `new URL(rawReturnUrl, origin)`으로 파싱해 `url.origin === origin`일 때만 `pathname+search` 사용. 또는 정규식 `^/(?!/)`.

### H-2. OAuth 콜백에 인증 없음 — 서비스 Google 계정 탈취 경로
`app/api/auth/google/callback/route.ts:10-45` (품질 에이전트, 직접 확인)

콜백은 서비스 전역 Google 토큰을 저장(`setGoogleToken`, :45)하는 상태변경 엔드포인트인데 시작 라우트만 `requireAdmin`이고 콜백엔 인증이 없다. nonce 검증(:31)은 쿠키·state를 공격자가 자기 요청에 모두 세팅할 수 있어 직접 호출을 막지 못한다. client_id를 아는 공격자가 자기 Google 계정 code로 콜백을 호출하면 서비스 Google 계정이 통째로 바뀌어 이후 설문·응답이 공격자 계정으로 흐른다.

**수정:** 콜백에도 `requireAdmin` 추가(nonce는 CSRF용으로 유지).

### H-3. import-json 복원에 캐스케이드 확인·검증·백업 전무
`app/api/projects/[id]/import-json/route.ts:18,49-113` (데이터·보안 에이전트 교차)

- **캐스케이드 가드 부재:** payload에 `customerRequirements`만 있고 `kanoResponses` 키가 없으면 요구사항 `deleteMany` → CASCADE로 **설문 응답·벤치마크·QFD가 경고 없이 소멸**. excel import 라우트엔 있는 `confirmCascade` 흐름(import/route.ts:294-303)이 여기엔 없고 preview 단계도 없다.
- **검증 부재 + mass-assignment:** 행을 `{...r, projectId}`로 스프레드해 `id`·`createdAt` 등 클라이언트 임의 필드가 그대로 저장. 배열 길이 상한도 없다. 하드닝된 팩토리를 거치지 않는 유일한 대량삽입 경로.

**수정:** `countCascadeImpact`(lib/import-cascade-guard.ts) 재사용해 409+confirm, bulk-save-schemas 방식 화이트리스트 스키마 + 행수 상한.

### H-4. 워크시트 대량저장의 캐스케이드가 조용히 연쇄 삭제
`requirements/route.ts:76-84` · `attributes/route.ts:68-70` (데이터 에이전트, 직접 확인)

- **requirements:** 클라이언트가 id 없는 행만 보내면 `submittedIds=[]` → `deleteMany({projectId})` 전량 삭제 → 딸린 KanoResponse 캐스케이드 소멸. `.min(1)`은 빈 배열만 막고 id 누락은 못 막으며, 여기엔 cascade confirm이 없다. 정상 편집 UI에선 id를 유지하므로 발생하지 않지만 구버전 클라이언트·외부 스크립트에 무방비.
- **attributes:** 빈 배열 POST 한 번이면 `deleteMany({projectId})`로 속성 전량 삭제 → `attribute_fitnesses`가 CASCADE로 **적합도 워크시트까지 통째 소멸**. 응답엔 그 사실이 안 나타난다.

**수정:** 삭제될 기존 행에 딸린 하위 레코드 건수를 세어 confirm 요구, 또는 id 필수화.

### H-5. 동시 저장 시 데이터 유실 — 낙관적 잠금 0곳
lib/bulk-worksheet-route.ts + 우회 라우트 ~18곳 (데이터 에이전트)

PostgreSQL 마이그레이션 계획서(2026-08-02:25)가 이미 유예 리스크로 명시한 항목이다. READ COMMITTED에서 두 사용자가 같은 워크시트를 동시 저장하면 후행 `deleteMany`가 선행이 넣은 행을 스냅샷에서 못 봐 **두 사람 행이 합쳐지거나 후행이 선행을 통째로 소거**한다. `(projectId, order)` unique 제약도 없어 중복이 에러 없이 영속화된다. 공개 엔드포인트 `survey/[token]/submit:56-114`도 check-then-act가 비원자적이라 더블클릭으로 응답 중복 삽입 → Kano 통계 왜곡.

**수정:** 최소한 워크시트 테이블에 `(projectId, order)` unique 추가. 근본은 version 컬럼 + 조건부 updateMany 낙관적 잠금, submit은 `updateMany({where:{id, respondedAt:null}})` 선점.

### H-6. 테스트가 Prisma 전면 mock — FK·캐스케이드·동시성 미실측
tests/ 전반 (데이터 에이전트)

라우트 핸들러를 직접 검증하는 테스트는 57개 중 12개뿐이고, 전부 Prisma mock이라 캐스케이드·RESTRICT·unique·트랜잭션 격리가 한 번도 실제로 돌지 않는다. C-2 FK 버그와 아래 FK 다이아몬드가 "437개 all green"인 채 존재하는 것이 증거다. 미검증 뮤테이션: 로그인/가입, 관리자 프로젝트 삭제, requirements/spec 대량저장, import-json, AI 계열 라우트.

- **FK 다이아몬드(실DB 확인 필요):** project 삭제 캐스케이드가 invitations에 먼저 도달하면 `kano_responses.invitationId`의 **ON DELETE RESTRICT**가 발화해 응답 있는 프로젝트 삭제 자체가 P2003으로 실패할 수 있다.

**수정:** 로컬 Postgres/testcontainers로 통합 테스트 최소 5건(requirements·attributes 캐스케이드 실측, 응답 있는 프로젝트 삭제, form-responses 시스템 초대, 동시 벌크 저장 경합). C-2는 여기서 즉시 확정된다.

### H-7. 로그아웃이 세션을 무효화하지 않음
`app/api/auth/logout/route.ts:6-14` (보안 에이전트)

클라이언트 쿠키만 `maxAge:0`으로 지운다. `sessionVersion`을 안 올려 유출·탈취된 쿠키는 로그아웃 후에도 `exp`(최대 7일)까지 유효하다. 비밀번호 변경·승인취소는 `sessionVersion`을 올리는데 자발적 로그아웃만 누락.

**수정:** 로그아웃 시 `sessionVersion { increment: 1 }`(전 기기 강제 로그아웃).

### H-8. 프로덕션 의존성 취약점 14건 (high 12, moderate 2)
`npm audit --omit=dev` (레포위생 에이전트)

`next 15.5.12`(요청 스머글링·미들웨어 우회 등), `nodemailer 8.0.1`(SMTP 명령 주입·CRLF 헤더 주입), sharp/postcss/nanoid 등. 인증·메일·업로드를 다루는 앱이 패치 뒤에 있다. **대부분 무중단 수정 가능.**

```bash
npm audit fix   # --force 금지(exceljs·prisma 다운그레이드됨). next→15.5.23, prisma→6.19.3 등 semver 호환
npm test && npm run build
```

### H-9. 기능 전체(약 912라인)가 커밋 0개·원격 백업 0
`git status` 8건 · `origin/feat/...` 없음 (레포위생 에이전트)

member-roles/invite 기능 전부가 이 PC 워킹트리에만 있고, 저장소가 **Dropbox 내부**(`.gitignore`에 과거 동기화 충돌 흔적 존재)라 .git 오브젝트 손상 시 복구 불가. WIP 자체는 의도됐지만 보존층이 취약하다.

```bash
git add -A && git commit -m "wip: member roles and invite codes"
git push -u origin feat/member-roles-and-invites
```

### H-10. 라우트가 자기 서버로 HTTP fetch (개선 라우트)
`app/api/projects/[id]/improvements/route.ts:25-30` (품질 에이전트)

핸들러가 `${origin}/api/.../qfd/analysis`로 쿠키를 재전달하며 자기 서버를 호출해 분석을 얻는다. 인증·인가·DB 조회가 요청당 2배, 서버리스 함수 이중 과금, 실패 시 조용히 `null` 강등. 분석 로직은 이미 lib 함수로 존재.

**수정:** qfd/analysis의 조회+계산부를 lib 함수로 추출해 양쪽 라우트가 직접 호출.

### H-11. 오류 메시지·이메일·토큰이 응답·로그에 노출
여러 위치 (품질·보안 교차)

- **error.message 노출:** `import/route.ts:351`, `kano/create-form/route.ts:68`, `kano/form-responses/route.ts:132` — XLSX·Prisma·Google 내부 문자열이 500 응답에 직행. #21 정보노출 차단의 잔여 지점.
- **이메일·비밀토큰 로깅:** `lib/email.ts:48,84,87`이 `console.log`로 수신자 이메일+설문 링크(비밀 토큰)를, `survey/[token]/submit:133`이 토큰을 로그에 기록. `lib/logger.ts:8`의 "이메일·토큰 절대 기록 금지" 정책 정면 위반.

**수정:** 세 곳 `toErrorResponse`로, email.ts·submit은 `createLogger`로 교체하고 meta에서 email·token 제거(필요 시 invitationId만).

---

## 🟡 Medium — 다음 스프린트

| # | 위치 | 문제 | 수정방향 |
|---|---|---|---|
| M-1 | 전역 89곳/35파일 | `.map((p: any)=>`로 Prisma가 준 타입을 자발적으로 버림. `tx: any`, `as any` 동류 | 콜백 `:any` 제거(추론), eslint에 `no-explicit-any` 추가 |
| M-2 | `spec/route.ts:67`, `fitness-matrix:25` | POST를 zod 없이 받아 불량 데이터가 Prisma 500 직행 | bulk-save-schemas에 스키마 추가 |
| M-3 | `funding/route.ts:37` | **GET이 기본 행을 createMany로 삽입** — 읽기전용 COACH 조회가 DB 쓰기 유발, write:false 의미 붕괴 | 응답 시점 메모리 합성 또는 프로젝트 생성 시 시드 |
| M-4 | `kano/upload-excel:168`, `requirements:86` | 트랜잭션 안 순차 upsert 루프(N+1 쓰기), 응답자 수백이면 장시간 트랜잭션 | createMany 배치로 분리 |
| M-5 | `form-responses:114` | 주석이 자인하듯 dedupe 없는 createMany — 재동기화 시 응답 배로 증가, Kano 수치 왜곡 | (invitationId,email,requirementId) 기준 사전삭제/스킵 |
| M-6 | KanoManager:132 등 4곳 | 존재하지 않는 `GET /api/projects/[id]` 호출 → 404 폴백. 4개 컴포넌트가 전체목록 받아 find로 우회 복제 | 단건 라우트 신설 후 통일 |
| M-7 | `export/route.ts:19` | 백업용 export가 9개 컬렉션만 포함 — 절반이 복원 불가. "백업 있다"는 착각이 더 위험 | 전 모델로 확장 |
| M-8 | `admin/projects:76`, `kano/upload-excel:156` | 프로젝트 삭제·설문 replace에 confirm 없음(user delete는 confirmCascade 요구하는데 비대칭) | 건수 세어 409+confirm |
| M-9 | KanoManager:161 | 전체 사용자가 여는 화면이 관리자 전용 `GET /api/settings` 호출 → 비관리자 403 → 기능 UI 숨김. 서버·클라 권한 모델 어긋남 | `google.configured`만 주는 경량 엔드포인트 분리 |

---

## 🟢 Low — 백로그

- **중복 코드:** 팩토리 미이관 4라우트(assets/improvements/attributes/fitness)가 "검증→tx→findMany" 손수 재구현 · showToast 9벌 복붙 · Kano 분류표 2중 인코딩(lib/kano.ts vs kano-algorithm.ts) · upload-guard 미적용 2곳
- **거대 컴포넌트:** 500줄+ 8개 전부 'use client'. KanoManager(1375줄·useState 33·fetch 15), SpecTable(1348), QFDMatrix(1078), ProductAttributesTable(1050) — 탭/마법사/업로드 단위 분리 + 데이터 로딩 커스텀 훅
- **QFDMatrix:275** 셀 1클릭당 엔드포인트 6개 전부 재조회(요청 7건) → 낙관적 갱신
- **레포위생:** `npx prisma generate` 안 돌려 로컬 tsc 4건 실패(코드 결함 아님) · `@types/nodemailer@6` vs 런타임 v8 · Node CI 20 vs 로컬 24, engines 없음 · `.gitignore` 중복 · xlsx가 CDN tarball이라 audit 사각지대 + exceljs와 2중 탑재
- **기타:** `write: request.method!=='GET'` 죽은 식 34곳 · console vs logger 혼용 · `window.prompt` UX 20곳 · rate-limit Map 단조증가 · 로그인 시 accessExpiresAt 미검사 · members 이중 인가

---

## 🎯 권장 조치 순서

1. **오늘:** C-1 저장소 비공개 전환(5분) → H-9 WIP 커밋·푸시로 912라인 백업
2. **머지 전:** C-2 form-responses FK + H-11 오류·토큰 노출 + H-2 OAuth 콜백 인증 + H-1 오픈리디렉트 (작은 수정, 큰 효과)
3. **데이터 안전:** H-3 import-json 확인·검증 → H-4 캐스케이드 경고 → H-6 통합 테스트 5건(C-2·FK 다이아몬드 실측 확정)
4. **의존성:** H-8 `npm audit fix`
5. **일관성 회복:** 남은 라우트를 팩토리·가드·에러헬퍼로 이관(새 패턴 만들지 말고 있는 패턴을 끝까지)
6. **동시성·컴포넌트:** H-5 낙관적 잠금 → 거대 컴포넌트 분해

**한 줄 결론:** 방향은 이미 옳게 잡혀 있다. 다음 단계는 새 도구를 만드는 게 아니라 만들어 둔 도구의 적용 반경을 끝까지 넓히는 것이다. 단, 그 전에 C-1·C-2 두 건은 성격이 다르다 — 하나는 이미 노출된 데이터, 하나는 정상 사용 시 100% 재현되는 버그다.
