> **2026-10-11 이관됨.** 정본은 `E:\Dropbox\coding-1\business plan\bm`(브랜치 `feat/bm-service`, 커밋 `44c0745`)에 있다. 이 사본은 더 고치지 않는다.

# 창업자 교육·컨설팅 플랫폼 아키텍처 제안 — KS-QFD 위에 3개 서비스를 얹는 구조

**작성일:** 2026-10-03
**상태:** 제안(사용자 검토 대기). 코드·DB·배포는 변경하지 않았다.
**기준 코드:** 브랜치 `codex/login-role-validation`, 커밋 `da3ddf4` + 미커밋 변경 175파일(아래 0단계 참조)
**후속(2026-10-04):** 서비스 2(BM)를 먼저 독립 구축하기로 했다. 8절의 순서 대신
`docs/superpowers/plans/2026-10-04-bm-service.md` 를 따른다. 1단계 전체와 2단계를 기다리지
않고 BM 에 필요한 최소 접점만 먼저 넣으며, 기준선은 이 작업 디렉터리가 아니라 `origin/main` 이다.

## 1. 요청과 목표

> 현재 KS-QFD 서비스를 이용하는 사람들을 위한 자매 서비스 형태로, 최상단에
> '창업자들의 교육 및 컨설팅을 돕는 솔루션'을 두고 그 밑에 KS-QFD, 비즈니스 모델
> 개발 및 고도화, 창업아이템 발굴 및 고도화 3개 main 서비스를 운용한다.

목표를 아키텍처 언어로 바꾸면 다음 네 가지다.

1. **계정·프로그램·멘토링은 하나다.** 같은 회원(멘티·멘토·매니저·관리자), 같은 기관
   프로그램, 같은 멘토 배정이 세 서비스를 가로질러 통한다. 자매 서비스란 "다시 가입하지
   않는다"는 뜻이다.
2. **방법론은 셋이다.** 각 서비스는 자기 워크시트 체계·AI 보조·결과보고서를 가진다.
3. **서비스 사이에 데이터가 흐른다.** 아이템 발굴 결과가 KS-QFD 개요와 BM 고객 정의를
   채우고, KS-QFD 매출·자금 워크시트가 BM 수익·비용 구조를 채운다.
4. **기존 KS-QFD 사용자는 아무것도 잃지 않는다.** 주소·데이터·권한·보고서가 그대로다.

## 2. 현재 구조에서 재사용되는 것과 묶여 있는 것

코드를 읽고 확인한 사실이다. 제안의 근거이므로 먼저 적는다.

### 2.1 이미 서비스 중립인 층 (그대로 상위 플랫폼이 된다)

| 영역 | 파일 | 서비스 의존 여부 |
| --- | --- | --- |
| 세션·인증 | `lib/auth.ts`, `app/api/auth/**` | 없음. 서명 쿠키 + DB 상태 확인 |
| 시스템 역할 4종 | `lib/member-roles.ts` | 없음. ADMIN·PROGRAM_MANAGER·MENTOR·MENTEE |
| 프로그램(기관 단위) | `Program`, `lib/program.ts` | 없음. 기관·기간·매니저만 안다 |
| 초대 코드 | `InviteCode`(programId 귀속) | 없음. 프로그램에 묶이므로 서비스를 모른다 |
| 멘토 배정 | `MentorAssignment`(menteeId PK) | 없음. **프로젝트가 아니라 멘티 단위**다 |
| 프로젝트 권한 판정 | `lib/authorization.ts` `resolveProjectRole` | 없음. (시스템역할·소유·멤버역할·배정멘토)만 입력받는 순수 함수 |
| 회원 프로필·AI 연결 | `MemberProfile`, `UserAiConnection` | 없음 |
| 관리자 콘솔 | `app/admin`, `app/api/admin/**` | 거의 없음. 통계 카드 2개(Kano·QFD)만 QFD 어휘 |
| 결과보고서 저장 | `FinalReport`(draft/published JSON, version) | 없음. 문서 **내용**을 만드는 쪽만 QFD |
| 워크시트 코멘트 | `WorksheetComment(projectId, worksheetId)` | 없음. worksheetId 문자열만 QFD 어휘 |
| 멘토 분석 저장 | `lib/mentor-worksheet-analysis.ts` | 스키마 목록만 QFD 워크시트 8종 |
| AI 엔진 전송층 | `lib/ai/registry.ts`, `providers.ts`, `personal*.ts` | 전송은 중립. **작업 계약 4개**(`AiProvider` 인터페이스)가 QFD 전용 |

### 2.2 KS-QFD에 묶여 있는 것 (서비스 모듈로 내려간다)

- `Project` 모델의 절반이 QFD 어휘다. `productName`·`marketDefinition`·`targetCustomer`·
  `qfdTechnicalInitialized`·`specDetailCollapsed`·제품 이미지 3컬럼, 그리고 워크시트
  관계 20여 개.
- `app/project/[id]/*` 17개 화면, `app/api/projects/[id]/*` 51개 라우트, `components/project/*`
  35개, `lib/` 127개 중 64개(kano·qfd·spec·timko·final-report·funding 등).
- `lib/worksheet-pages.ts`(메뉴), `lib/worksheet-completeness.ts`(완성도 규칙),
  `lib/final-report-*.ts`(보고서 빌더), 대시보드 통계 카드(Kano 설문·QFD 매트릭스).
- 브랜드 문자열 `KS-QFD`가 플랫폼 층 소스 10곳에 박혀 있다. `app/layout.tsx`·`page.tsx`·
  `login`·`signup`·`dashboard`·`AdminLoginForm`, 초대 발송 라우트, `lib/email.ts`·
  `invite-code.ts`·`temp-password-email.ts` 다. 보고서 템플릿·사업계획 양식 안의 `KS-QFD` 는
  서비스 이름이므로 그대로 둔다.

### 2.3 구조적 발견

`Project`는 이름만 "프로젝트"이고 실제 역할은 **"프로그램 안에서 멘티가 소유하고 멘토가
코칭하는 과제 컨테이너"**다. 소유·멤버·배정·승인·이관·코멘트·보고서가 모두 이 행에
매달려 있고, 그 어느 것도 QFD를 모른다. 이 사실이 설계의 축이다. 과제 컨테이너를 새로
만들지 않고 `Project`를 그대로 세 서비스의 공통 컨테이너로 승격시키면, 위 2.1의 모든
기능이 BM·아이템 서비스에서 **코드 추가 없이** 동작한다.

## 3. 상위 구조 제안

```
┌──────────────────────────────────────────────────────────────────────┐
│  상위 플랫폼: 창업자 교육·컨설팅 솔루션 (명칭 미정, 결정 1)              │
│  = 프로그램 운영 레이어                                                 │
│    기관 프로그램 · 회원/역할 · 초대 · 멘토 배정 · 관리자 · 결과보고서 엔진 │
│    코멘트/멘토분석 엔진 · 완성도 엔진 · AI 전송층 · 알림 메일               │
├──────────────────────┬──────────────────────┬────────────────────────┤
│ 서비스 1  KS-QFD     │ 서비스 2  BM 개발·고도화 │ 서비스 3  아이템 발굴·고도화 │
│ serviceKey 'qfd'     │ serviceKey 'bm'       │ serviceKey 'item'       │
│ WS-1 ~ WS-17 (기존)  │ BM-1 ~ BM-n (가안 §7)   │ IT-1 ~ IT-n (가안 §7)    │
│ Kano·QFD·보고서       │ 캔버스·수익모델·가설검증 │ 기회탐색·선별·정의서      │
└──────────────────────┴──────────────────────┴────────────────────────┘
          ▲  아이템 → QFD 개요 / BM 고객·가치제안 핸드오프
          ▲  QFD WS-1·3·16·17 → BM 고객·수익·비용 핸드오프
```

**한 프로그램은 하나 이상의 서비스를 운영한다.** 기관이 "아이템 발굴 → BM → QFD" 전 과정을
도는 프로그램을 열 수도 있고, 지금처럼 QFD 하나만 운영할 수도 있다.
**한 멘티는 서비스별로 과제(Project)를 가진다.** 멘토는 멘티 단위로 배정되므로 세 과제를
한 멘토가 본다(결정 4).

## 4. 배치 방식 결정 — 모듈형 단일 앱을 권장한다

| 방식 | 내용 | 판단 |
| --- | --- | --- |
| **A. 모듈형 단일 앱(권장)** | 지금 Next.js 앱 하나에 서비스 모듈을 디렉터리로 나눠 얹는다. DB 하나, 세션 하나, 배포 하나. | 세션이 자체 HMAC 쿠키라 SSO 기반이 없다. 운영 DB가 원격 실데이터 하나다. 테스트 205파일·뮤테이션 게이트가 단일 패키지 전제다. 공통 층이 이미 코드로 존재한다. 가장 적은 변경으로 1·2·3·4 목표를 전부 만족한다. |
| B. 모노레포 다중 앱 | Turborepo + `apps/portal`·`apps/qfd`·`apps/bm`·`apps/item` + `packages/db`·`packages/auth`. Vercel 다중 프로젝트 또는 microfrontends. | 쿠키 도메인 공유·패키지 추출·테스트 분리·배포 파이프라인 재구성이 선행된다. 팀이 하나이고 서비스 2·3의 콘텐츠가 아직 미확정인 지금 비용만 먼저 든다. A의 디렉터리 경계를 지키면 뒤에 기계적으로 전환할 수 있다. |
| C. 독립 서비스 + SSO | 서비스별 별도 앱·DB, OIDC로 로그인 연동. | 자매 서비스의 본질(한 멘토가 한 멘티의 세 과제를 본다, 과제 간 데이터 핸드오프)에 역행한다. 제외. |

A를 택하되, **B로 갈 수 있는 경계**를 지킨다. 서비스 모듈은 자기 디렉터리 밖의 다른
서비스 모듈을 import하지 않는다. 플랫폼 층만 import한다. 서비스 간 데이터 흐름은 import가
아니라 §6.5의 핸드오프 API로만 한다. 이 두 규칙은 lint 규칙(`no-restricted-imports`)으로
걸 수 있다.

## 5. 데이터 모델 — 추가만 한다

원격 실DB 제약(`CLAUDE.md`)에 따라 **컬럼 추가와 기본값만** 쓴다. 이름 변경·삭제·타입 변경은
하지 않는다. 마이그레이션 적용은 사용자가 한다.

### 5.1 플랫폼 층 변경 (1단계)

```prisma
model Program {
    // 이 프로그램이 운영하는 서비스. 기존 행은 전부 QFD 였으므로 기본값으로 메운다.
    // 과제 생성·초대 화면이 이 목록 안에서만 서비스를 고르게 한다.
    services     String[]  @default(["qfd"])
}

model Project {
    // 어느 서비스의 과제인가. lib/services/registry.ts 가 정본이다.
    // 기존 행은 전부 QFD 다. 라우트는 자기 서비스 키가 아닌 과제를 404 로 거절한다.
    serviceKey        String   @default("qfd")
    // 어느 과제에서 핸드오프로 파생됐는가(아이템 → QFD/BM). 계보만 남긴다.
    sourceProjectId   String?
    source            Project?  @relation("ProjectHandoff", fields: [sourceProjectId], references: [id], onDelete: SetNull)
    derived           Project[] @relation("ProjectHandoff")

    @@index([programId, serviceKey])
    @@index([ownerId, serviceKey])
}

model ProjectCreationRequest {
    // 추가 과제 승인은 서비스별로 센다(결정 5). 기존 행은 QFD.
    serviceKey String @default("qfd")
}
```

변경하지 않는 것: `User`, `MentorAssignment`, `InviteCode`, `ProjectMember`,
`WorksheetComment`, `FinalReport`, `MemberProfile`, `UserAiConnection`. 전부 서비스 중립이라
그대로 세 서비스를 받는다.

### 5.2 서비스 모듈 테이블 (3·4단계, 서비스별 계획서에서 확정)

원칙은 KS-QFD 와 같다. **워크시트 하나 = 테이블 하나**, `projectId` FK + `order` 컬럼,
`onDelete: Cascade`. 버전이 필요한 워크시트(BM 캔버스 고도화 이력)만 `version` 컬럼을 둔다.
JSON 덤프 테이블은 `FinalReport` 처럼 문서 단위일 때만 쓴다. 행 단위여야 코멘트·멘토
분석·완성도 규칙이 QFD 와 같은 방식으로 붙는다.

테이블명 접두는 `bm_*`, `item_*`. Prisma 모델명은 `Bm*`, `Item*`.

### 5.3 2단계 이후 선택 — QFD 전용 컬럼 분리

`Project` 의 QFD 어휘 컬럼(`productName`·`marketDefinition`·`targetCustomer`·
`qfdTechnicalInitialized`·`specDetailCollapsed`·제품 이미지 컬럼들)은 BM·아이템 과제에서 null 로
남는다. 동작에는 문제가 없다. 5단계에서 `QfdProjectProfile`(projectId PK) 로 옮기는 안을
검토한다. 실데이터 이동이 따르므로 서비스 2·3이 안정된 뒤 별도 계획서로 다룬다. 지금은
하지 않는다.

## 6. 코드 구조

### 6.1 디렉터리 — 기존 QFD 파일은 1~4단계에서 옮기지 않는다

미커밋 변경 175파일과 테스트 205파일이 현재 경로를 import 한다. 지금 QFD 파일을 옮기면
변경 범위가 서비스 추가 자체보다 커진다. **새 것만 새 자리에 둔다.**

```
lib/
    services/registry.ts        ← 신설. SERVICE_KEYS·라벨·경로·활성 플래그·워크시트 목록 정본
    platform/brand.ts           ← 신설. 플랫폼명·서비스명 상수(12개 소스의 'KS-QFD' 리터럴 대체)
    (auth·authorization·member-roles·program·invite-*·ai/registry 등은 그대로 = 플랫폼 층)
    bm/                         ← 신설. BM 순수 모듈(완성도 규칙·멘토분석 스키마·AI 작업·보고서 빌더)
    item/                       ← 신설. 아이템 모듈
    (kano-*·qfd-*·spec-*·final-report-* 등 QFD 순수 모듈은 당분간 lib/ 루트 유지)
app/
    bm/[id]/{layout,page}.tsx + 워크시트 세그먼트
    item/[id]/...
    project/[id]/...            ← QFD 그대로. layout 이 serviceKey 를 읽어 bm/item 이면 리다이렉트
    api/projects/[id]/bm/**     ← BM 워크시트 API
    api/projects/[id]/item/**   ← 아이템 워크시트 API
    api/projects/[id]/handoff/  ← 서비스 간 핸드오프
components/
    platform/                   ← 신설. 서비스 전환 탭·과제 카드·서비스 배지
    bm/ , item/                 ← 신설
    project/                    ← QFD 그대로
tests/                          ← 평면 유지. 새 파일은 bm-*·item-*·platform-* 접두
```

5단계(정리)에서 `app/project` → `app/qfd`, `components/project` → `components/qfd`,
`lib/` QFD 파일 → `lib/qfd/` 이동과 `/project/:id/*` → `/qfd/:id/*` 영구 리다이렉트를
한 번에 한다. 그때까지 `/project/[id]` 가 QFD 의 정식 주소다.

### 6.2 서비스 레지스트리 — 한 곳이 정본

`lib/member-roles.ts` 가 역할의 정본인 것과 같은 방식이다.

```ts
// lib/services/registry.ts
export const SERVICE_KEYS = ['qfd', 'bm', 'item'] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export interface WorksheetDef { href: string; id: string; label: string; required: boolean }

export interface ServiceDef {
    key: ServiceKey;
    label: string;            // 'KS-QFD' | '비즈니스 모델 개발·고도화' | '창업아이템 발굴·고도화'
    shortLabel: string;       // 탭·배지용
    basePath: string;         // '/project' | '/bm' | '/item'
    apiBase: string;          // '/api/projects/:id' | '/api/projects/:id/bm' | ...
    enabled: boolean;         // feature-flags 패턴. 완성 전에는 화면 숨김 + API 404
    worksheets: WorksheetDef[];
}

export const SERVICES: Record<ServiceKey, ServiceDef>;
export function parseServiceKey(value: unknown): ServiceKey | null;
export function projectPath(serviceKey: ServiceKey, projectId: string): string;
export function isServiceEnabledForProgram(program: { services: string[] }, key: ServiceKey): boolean;
```

`lib/worksheet-pages.ts` 의 `WORKSHEET_LINKS` 는 `SERVICES.qfd.worksheets` 를 가리키는 재export
로 바꿔 기존 import 를 깨지 않는다. 신규 순수 모듈이므로 뮤테이션 100% 와 `mutate` 목록
등재를 요구한다.

### 6.3 권한 — `requireProjectAccess` 에 서비스 가드 한 줄

```ts
requireProjectAccess(request, projectId, { write?: boolean; roles?: ...; service?: ServiceKey })
```

`service` 가 주어지면 `project.serviceKey !== service` 일 때 **404** 를 돌려준다. 403 이
아닌 이유는 "그 과제는 이 서비스에 존재하지 않는다"가 사실이고, 존재 여부를 흘리지
않기 위해서다. 기존 QFD 라우트 50여 개에 `service: 'qfd'` 를 넣는 것은 1단계 작업이다.
넣지 않으면 BM 과제 id 로 Kano 설문을 만드는 식의 교차 쓰기가 가능해진다. 이것이 1단계의
1순위 감리 표본이다.

`resolveProjectRole` 은 바꾸지 않는다. 입력이 서비스를 모르기 때문이다.

### 6.4 공통 엔진 일반화 (2단계) — 정본은 서비스 모듈, 엔진은 플랫폼

| 엔진 | 지금 | 바꾸는 것 | 서비스 모듈이 제공하는 것 |
| --- | --- | --- | --- |
| 완성도 | `WORKSHEET_RULES` 상수가 함수 안에 고정 | `calculateWorksheetCompleteness(rules, input)` 로 규칙을 인자화. QFD 규칙은 `lib/qfd-completeness-rules.ts`(현 위치)로 추출 | `lib/bm/completeness-rules.ts` |
| 멘토 분석 | `worksheetAnalysisSchema` 가 QFD 8종 고정 | 서비스별 스키마 레지스트리. `worksheetId` 는 레지스트리에서 꺼내고 저장 형식은 그대로(`FinalReport`·`WorksheetComment` 처럼 projectId 귀속) | `lib/bm/mentor-analysis.ts` |
| 코멘트 | 이미 `(projectId, worksheetId)` | 없음. worksheetId 를 레지스트리 id 로 통일 | 워크시트 id 목록 |
| 결과보고서 | `FinalReport` 저장·버전·공개는 중립. 빌더 `lib/final-report-document.ts` 와 캡처 단계가 QFD | 저장·버전·공개 라우트는 그대로. 빌더·캡처 대상·DOCX 템플릿을 `serviceKey` 로 분기 | `lib/bm/report-document.ts`, `components/bm/ReportPages.tsx` |
| AI | `AiProvider` 가 QFD 작업 4개(`mentorQuestions`·`attributeDraft`·`valueAnalysis`·`specDraft`)를 메서드로 가짐 | 전송층을 `completeJson(prompt, schema)` 하나로 좁히고, 작업은 서비스 모듈의 함수로 올린다. 규칙 기반 폴백(`provider-rule.ts`)도 작업별로 서비스 모듈이 제공 | `lib/bm/ai-tasks.ts` (+ 규칙 폴백) |
| 대시보드 통계 | 'Kano 설문'·'QFD 매트릭스' 카드 고정 | 레지스트리의 `dashboardStats(project)` 로 서비스별 카드 | 카드 정의 |
| 브랜드 | 'KS-QFD' 리터럴 10곳(플랫폼 층) | `lib/platform/brand.ts` 상수. 메일 템플릿은 플랫폼명 + 서비스명 인자 | 서비스명 |

AI 전송층 변경은 `lib/ai/personal-vendors.ts`·`url-guard.ts` 등 `mutate` 목록 파일 주변을
건드린다. 해당 Task 는 뮤테이션 재실행·점수 보고가 필수다(2026-08-30 적발 사례와 같은
자리다).

### 6.5 서비스 간 핸드오프 — 복사이지 참조가 아니다

`POST /api/projects/[id]/handoff` `{ target: 'qfd' | 'bm', programId? }`

- 원본 과제의 확정 산출물을 읽어 **새 과제를 만들고 개요·초기 행을 채운다.** 새 과제의
  `sourceProjectId` 에 원본을 적는다.
- 참조(live link)가 아니라 복사인 이유는 두 과제가 이후 독립적으로 고쳐지기 때문이다.
  원본이 바뀌어도 파생 과제가 조용히 바뀌면 멘토 분석과 보고서가 뒤틀린다.
- 생성 권한·승인·프로그램 서비스 허용은 `POST /api/projects` 와 같은 규칙을 탄다.
  `lib/project-creation-approval.ts` 의 `createProjectWithApproval` 을 재사용한다.
- 매핑은 서비스 모듈이 선언한다(`lib/item/handoff.ts` 가 "IT-6 정의서 → QFD 개요
  productName·marketDefinition·targetCustomer, → BM-1 고객·BM-2 가치제안"을 적는다).

### 6.6 화면 흐름

- `/`(비로그인): 플랫폼 이름 + 3개 서비스 카드. 현재 QFD 전용 히어로를 대체한다.
- `/dashboard`: 상단에 서비스 전환 탭(전체 | QFD | BM | 아이템). 과제 카드에 서비스 배지.
  "새 과제" 모달에 서비스 선택이 생기며, 후보는 `program.services ∩ enabled` 다. 멘티는
  자기 프로그램의 서비스만, 관리자·매니저는 고른 프로그램의 서비스만 본다.
- `/project/[id]`: QFD. 레이아웃이 과제의 serviceKey 가 bm/item 이면 `projectPath()` 로
  리다이렉트한다(관리자 화면 등 기존 링크 호환). 대시보드는 처음부터 올바른 경로로 링크해
  왕복을 피한다.
- `/bm/[id]`, `/item/[id]`: 각자 레이아웃 + 워크시트 메뉴(레지스트리에서 생성) + 멘토
  분석 패널 + 코멘트 + 그림 내보내기. QFD 의 `ProjectWorksheetMenu`·`MentorWorksheetAnalysis`·
  `WorksheetPageExport` 를 레지스트리 인자화해 공유한다.
- `/admin`: 프로그램 폼에 서비스 체크박스, 과제 탭에 서비스 열·필터, 통계에 서비스별 집계.
- `/manage`: 매니저도 자기 프로그램의 서비스 목록을 본다(변경은 관리자만, 결정 필요 없음 —
  `canCreateProgram` 이 ADMIN 전용인 현 규칙을 따른다).

## 7. 서비스 2·3 워크시트 가안 — 콘텐츠 정본이 오면 바꾼다

아래는 구조 설계를 위해 세운 **가안**이다. 교육 과정의 실제 워크시트 양식(PDF·엑셀)이
정본이며, 그것이 오면 각 서비스 계획서에서 확정한다. QFD 가 그랬던 것처럼 양식 분석
문서(`docs/superpowers/specs/*-design.md`)를 먼저 만든다.

### 7.1 비즈니스 모델 개발 및 고도화 (`bm`)

| ID | 워크시트 | 주요 입력 | 핸드오프 입력원 |
| --- | --- | --- | --- |
| BM-1 | 고객 세분화·페르소나 | 세분시장·고객·과업·고충 | QFD WS-3 세분시장·고객·니즈 |
| BM-2 | 가치제안 캔버스 | 고충해결·이득창출 ↔ 제품·서비스 | QFD WS-3 혜택, WS-12 목표스펙 |
| BM-3 | 비즈니스 모델 캔버스(9블록) | 블록별 항목 행 | BM-1·2 |
| BM-4 | 수익모델·가격 | 수익원·가격모델·단위경제(CAC·LTV·마진) | QFD WS-1 매출추정 |
| BM-5 | 비용구조·손익 | 고정·변동비, 3년 추정 | QFD WS-16·17 |
| BM-6 | 핵심 가설·검증 계획 | 가설 → 실험 → 지표 → 결과 | — |
| BM-7 | 고도화 이력(캔버스 버전 비교) | v1→v2 변경 블록·사유 | BM-3 버전 |
| BM-R | 결과보고서 | 멘토 분석 + 그림 | 전체 |

### 7.2 창업아이템 발굴 및 고도화 (`item`)

| ID | 워크시트 | 주요 입력 | 핸드오프 출력 |
| --- | --- | --- | --- |
| IT-1 | 창업자 역량·자원 진단 | 보유 역량·자원·네트워크 | — |
| IT-2 | 문제·기회 탐색표 | 시장 문제 후보, 근거 | — |
| IT-3 | 고객 인터뷰 기록 | 인터뷰 대상·발언·인사이트 | — |
| IT-4 | 아이디어 풀 | 후보 아이템 목록 | — |
| IT-5 | 아이템 선별 매트릭스 | 기준 가중치 × 후보 점수 | — |
| IT-6 | 선정 아이템 정의서 | 문제·솔루션·고객·차별점 1장 | → QFD 개요, → BM-1·2 |
| IT-7 | MVP·검증 계획 | 가설·실험·지표 | → BM-6 |
| IT-8 | 고도화 이력(피벗·개선) | 변경 전후·사유 | — |
| IT-R | 결과보고서 | 멘토 분석 + 그림 | 전체 |

세 서비스 모두 공통으로 가지는 것: 과제 개요(`Project` 공통 컬럼), 워크시트별 멘토
분석, 코멘트, 완성도·다음 단계 안내, 그림 내보내기, 결과보고서 초안/완료본, AI 보조(규칙
기반 폴백 포함).

## 8. 단계별 계획 — 각 단계가 계획서 한 편이 된다

각 단계는 `docs/superpowers/plans/<날짜>-<슬러그>.md` 로 Task 단위 계획서를 먼저 커밋하고,
게이트(`npx tsc --noEmit && npx vitest run && npx next lint`)와 뮤테이션 규칙을 적용한다.
**모든 단계는 기존 QFD 동작을 바꾸지 않는다**는 회귀 조건을 공유한다.

| 단계 | 내용 | 완료 기준 | 사용자 결정 의존 |
| --- | --- | --- | --- |
| **0. 기선 정리** | `codex/login-role-validation` 의 미커밋 175파일을 커밋·병합해 깨끗한 기준 커밋을 만든다. 아키텍처 작업은 그 위에서 시작한다. | `git status` 깨끗, main 게이트 통과 | 없음 |
| **1. 플랫폼 골격** | `lib/services/registry.ts`, `lib/platform/brand.ts`, `Program.services`·`Project.serviceKey`·`sourceProjectId`·`ProjectCreationRequest.serviceKey` 마이그레이션(추가·기본값만), QFD 라우트 전부에 `service: 'qfd'` 가드, 랜딩·대시보드 서비스 탭·배지, 관리자 서비스 열·필터, 프로그램 서비스 체크박스. bm·item 은 `enabled: false`. | 게이트 + 레지스트리 뮤테이션 100% + `member-roles`·`program` 뮤테이션 점수 유지 + 교차 서비스 쓰기 404 테스트 | 결정 1(플랫폼명) |
| **2. 공통 엔진 일반화** | 완성도 규칙 인자화, 멘토분석 스키마 레지스트리, 보고서 빌더·캡처 분기점, AI 전송층 `completeJson` + QFD 작업 함수화, 대시보드 통계 카드 레지스트리화, 메일 템플릿 브랜드 인자화. | 게이트 + `lib/ai/*` 뮤테이션 재실행 보고 + QFD 보고서 산출물 바이트 동일성(기존 초안 재생성 비교) | 없음 |
| **3. 서비스 2 — BM** | 양식 분석 설계서 → 스키마(`bm_*`) → 워크시트 API·화면 → 멘토분석·완성도·AI 작업·보고서 → QFD→BM 핸드오프 → `enabled: true`. | 게이트 + 신규 순수 모듈 뮤테이션 100% + 실기동 검증은 감리자가 수행 | 결정 3(순서), 6(워크시트 정본) |
| **4. 서비스 3 — 아이템** | 3단계와 동일 절차 + 아이템→QFD/BM 핸드오프. | 동일 | 결정 6 |
| **5. 정리(선택)** | `/project` → `/qfd` 경로 이전과 영구 리다이렉트, QFD 파일 `lib/qfd/`·`components/qfd/` 이동, `QfdProjectProfile` 분리 검토, 서비스 간 import 금지 lint 규칙. | 게이트 + 기존 북마크 리다이렉트 테스트 | 결정 7 |

권장 착수 순서는 BM(3) → 아이템(4) 이다. 현 사용자가 이미 제품을 가진 기업이라 QFD 다음
단계가 BM 고도화이고, QFD WS-1·3·16·17 → BM 핸드오프가 바로 가치를 낸다. 아이템 발굴은
예비창업자라는 새 사용자층을 향하므로 뒤에 둔다. 신규 기관 프로그램이 "발굴부터" 돈다면
순서를 바꾼다(결정 3).

## 9. 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 원격 실DB | 마이그레이션은 컬럼 추가·기본값만. `prisma migrate deploy` 는 사용자가 실행. 실기동 검증은 감리자가. |
| 교차 서비스 쓰기(BM 과제 id 로 QFD 라우트 호출) | 1단계에서 QFD 라우트 전부에 서비스 가드. 라우트별 테스트로 404 확인. 감리 1순위 표본. |
| AI 전송층 리팩터링이 뮤테이션 점수를 깎음 | 2단계 Task 에 `mutate` 목록 파일 재실행·점수 보고 의무. 등가 뮤턴트는 이유 있는 disable 만. |
| 기존 QFD 경로·링크 깨짐 | 1~4단계는 QFD 파일을 옮기지 않는다. 5단계에만 리다이렉트와 함께 이동. |
| 미커밋 175파일 위에 작업 | 0단계 선행. 그 전에는 설계 문서 외 코드 변경 금지. |
| 메일·로그에 브랜드 변경하며 이메일·키 노출 | `lib/logger.ts` 규칙 유지. 메일 템플릿 변경 Task 는 노출 테스트를 함께 둔다. |
| 멘토 1명이 세 서비스를 감당 못함 | 지금은 멘티 단위 배정 유지. 서비스별 배정이 필요해지면 `MentorAssignment` PK 를 (menteeId, serviceKey) 로 바꾸는 별도 계획서(실데이터 이동 포함). |
| 서비스 2·3 콘텐츠 미확정 | 1·2단계는 콘텐츠 없이 진행 가능. 3·4단계 전에 양식 정본을 받아 설계서로 고정. |

## 10. 사용자 결정 목록

| # | 결정 | 권장안 | 영향 단계 |
| --- | --- | --- | --- |
| 1 | 상위 플랫폼 명칭(브랜드·도메인·메일 발신명) | — (사용자 제공) | 1 |
| 2 | 배치 방식 | A. 모듈형 단일 앱, B 전환 가능 경계 유지 | 전체 |
| 3 | 서비스 2·3 착수 순서 | BM → 아이템 | 3·4 |
| 4 | 멘토 배정 단위 | 멘티 단위 유지(한 멘토가 세 과제) | 1 |
| 5 | 추가 과제 승인 규칙 | 서비스별로 첫 과제 무승인, 둘째부터 승인 | 1 |
| 6 | BM·아이템 워크시트 구성 | §7 가안을 양식 정본으로 교체 | 3·4 |
| 7 | `/project` → `/qfd` 이전 시점 | 5단계에서 리다이렉트와 함께, 또는 생략 | 5 |

## 11. 이번 범위 밖

교육 콘텐츠(강의 자료·일정·출석), 결제·구독, 외부 SSO, 모노레포 전환. 필요해지면 플랫폼
층의 별도 계획서로 다룬다. 이 설계는 그것들을 막지 않는다.

## 12. 확인한 주요 코드

- `prisma/schema.prisma` — `Program`·`Project`·`MentorAssignment`·`ProjectMember`·`FinalReport`·`WorksheetComment`·`ProjectCreationRequest`·`InviteCode`
- `lib/auth.ts`, `lib/authorization.ts`(`resolveProjectRole`·`requireProjectAccess`), `lib/member-roles.ts`, `lib/program.ts`
- `app/api/projects/route.ts`(과제 생성 규칙), `lib/project-creation-approval.ts`
- `lib/worksheet-pages.ts`, `lib/worksheet-completeness.ts`, `lib/mentor-worksheet-analysis.ts`, `lib/final-report-inputs.ts`
- `lib/ai/types.ts`(`AiProvider` 작업 계약), `lib/ai/registry.ts`
- `app/page.tsx`, `app/dashboard/page.tsx`, `app/project/[id]/layout.tsx`, `app/layout.tsx`
- `lib/feature-flags.ts`, `stryker.crap.config.json`, `vitest.config.ts`, `next.config.js`
