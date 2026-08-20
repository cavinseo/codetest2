# 회원관리 기능 설계

**작성일:** 2026-08-20
**대상 브랜치:** `feat/member-roles-and-invites`
**상태:** 설계 확정, 구현 계획 대기

## 1. 배경

지금 이 서비스의 회원 개념은 `승인된 사용자` 하나뿐이다. 승인만 받으면 누구나 프로젝트를 만들고, 자기가 소유하거나 초대받은 프로젝트를 본다. 멘토링 프로그램을 운영하려면 여기에 두 가지가 더 필요하다. 하나는 회원을 역할로 나누는 일이고, 다른 하나는 회원이 누구인지 알 수 있는 등록 정보다.

### 1.1 브랜치에 이미 있는 것

`feat/member-roles-and-invites` 에 커밋되지 않은 선행 작업이 있다.

| 파일 | 내용 |
| --- | --- |
| `prisma/schema.prisma` | `User.role`, `User.accessExpiresAt`, `InviteCode` 모델 |
| `prisma/migrations/20260820020000_add_member_roles_and_invites/` | 위 스키마의 마이그레이션 |
| `lib/member-roles.ts` | 역할 상수, 라벨, 권한 판정 함수 6개, 만료 계산 |
| `lib/invite-code.ts` | 코드 생성·정규화·검증, 초대 메일 본문 |
| `lib/auth.ts` | `requireAuth` 가 `role`·`accessExpiresAt` 를 반환하고 만료 계정을 403 으로 차단 |
| `tests/member-roles.test.ts`, `tests/invite-code.test.ts` | 위 두 모듈의 단위 테스트 |

### 1.2 실제 격차

**권한 판정 함수 6개가 자기 테스트에서만 호출되고 라우트 어디에서도 쓰이지 않는다.** `grep -r` 로 확인한 사실이다. 따라서 현재 브랜치 상태는 다음과 같다.

- 멘토도 매니저도 프로젝트를 만들 수 있다. `POST /api/projects` 에 게이트가 없다.
- 관리자가 남의 프로젝트를 열 수 없다. `requireProjectAccess` 가 시스템 역할을 모른다.
- 멘토 배정, 초대 코드 발행, 계정 생성 경로가 아예 없다.
- 회원의 소속·연락처를 담을 자리가 없다. `User` 에는 `email`, `name`, `passwordHash` 뿐이다.

이 문서는 그 격차를 메우는 설계다.

## 2. 역할·권한 모델

시스템 역할은 네 가지다. 프로젝트 단위 역할(`ProjectMember.role`)과는 층이 다르다. 시스템 역할은 `이 사람이 서비스에서 무엇을 할 수 있는가`, 프로젝트 역할은 `이 프로젝트 안에서 무엇을 할 수 있는가`를 정한다.

| | 관리자 | 프로그램 매니저 | 멘토 | 멘티 |
| --- | --- | --- | --- | --- |
| 프로젝트 생성 | 가능 | 불가 | 불가 | 가능 |
| 프로젝트 목록 | 전체 | 전체 | 배정된 것 | 본인 것 |
| 내용 열람 | 전체 | 전체 (읽기 전용) | 배정된 것 | 본인 것 |
| 내용 수정 | 전체 | 불가 | 불가 | 본인 것 |
| 멘토 배정·해제 | 가능 | 가능 | 불가 | 불가 |
| 초대 코드 발행 | 가능 | 가능 | 불가 | 불가 |
| 계정 생성·등록 승인 | 가능 | 불가 | 불가 | 불가 |
| 매니저 승격·해임 | 가능 | 불가 | 불가 | 불가 |
| 회원 삭제 | 가능 | 불가 | 불가 | 불가 |

아래 세 줄이 경계다. 매니저는 **초대 코드를 발행하고 멘토를 배정하지만, 회원을 만들거나 지우거나 역할을 바꿀 수는 없다.** 사람을 늘리고 줄이는 권한은 관리자에게만 있다.

### 2.1 매니저의 멘토 겸직

요구사항의 `프로그램 매니저는 멘토를 겸할 수 있다`는 별도 플래그로 만들지 않는다. **매니저 본인을 프로젝트에 멘토로 배정하면 겸직이 성립한다.** 매니저는 이미 전체 프로젝트를 읽기 전용으로 볼 수 있으므로 겸직해도 권한이 늘지 않고, 담당 관계만 기록된다. 이 편이 상태가 하나 줄어 어긋날 여지가 없다.

매니저는 멘토 중에서 승격되므로(2.3) 승격 시점에 이미 담당 프로젝트가 있는 경우가 많다. **승격은 `ProjectMember` 행을 건드리지 않는다.** 기존 배정이 그대로 남아 하던 멘토링을 이어서 한다.

따라서 멘토로 배정할 수 있는 대상은 `MENTOR` 와 `PROGRAM_MANAGER` 둘 다이다. 매니저를 제외하면 승격된 사람에게 새 프로젝트를 맡길 수 없어 겸직이 무너진다.

### 2.2 `lib/member-roles.ts` 변경

현재 `canReadAnyProject` 는 ADMIN 만 `true` 다. 매니저의 읽기 전용 열람을 표현할 수 없으므로 둘로 나눈다.

```
canReadAnyProject(role)   → ADMIN, PROGRAM_MANAGER
canWriteAnyProject(role)  → ADMIN
```

`tests/member-roles.test.ts:68` 이 `canReadAnyProject('PROGRAM_MANAGER') === false` 를 단언하고 있어 **반드시 깨진다.** 결정에 맞춰 함께 고친다.

나머지 다섯 함수(`canManageMembers`, `canIssueInviteCode`, `canAssignMentor`, `canCreateProject`, `canListAllProjects`)는 현재 정의가 위 표와 일치하므로 그대로 둔다.

역할 전환을 판정하는 `canTransitionRole(from, to)` 를 새로 넣는다 (2.3). 이 모듈은 DB 를 모르는 순수 함수 모음이라 전환표도 여기 두는 것이 맞고, 표 전체를 테스트로 덮기도 쉽다.

`canListAllProjects` 와 `canReadAnyProject` 는 이 결정 이후 둘 다 `ADMIN, PROGRAM_MANAGER` 로 결과가 같아진다. 그래도 합치지 않는다. 앞의 것은 `배정 대상을 고르려고 목록을 본다`, 뒤의 것은 `워크시트 내용을 연다`로 뜻이 다르고, 목록만 열고 내용은 막는 정책으로 되돌릴 여지가 남는다. 각각 제 뜻에 맞는 자리에서 호출한다.

### 2.3 역할 전환 규칙

`프로그램 매니저는 멘토 중에 선택된다`는 요구사항 때문에 역할은 아무 값으로나 바뀌지 않는다. 허용하는 전환은 다음이 전부다.

| 전환 | 허용 | 비고 |
| --- | --- | --- |
| MENTEE → MENTOR | 가능 | 관리자 판단 |
| MENTOR → MENTEE | 가능 | 관리자 판단 |
| MENTOR → PROGRAM_MANAGER | 가능 | **승격.** 매니저가 되는 유일한 경로다 |
| PROGRAM_MANAGER → MENTOR | 가능 | **해임.** 멘토로 되돌아간다 |
| MENTEE → PROGRAM_MANAGER | **불가** | 멘토를 거쳐야 한다. 관리자가 두 단계로 올린다 |
| PROGRAM_MANAGER → MENTEE | **불가** | 멘토로 해임한 뒤 다시 내린다 |
| → ADMIN, ADMIN → | 가능 | 관리자는 모든 권한을 가지므로 예외로 둔다 |

두 단계를 강제하는 이유는 매니저 자리가 멘토 경력을 전제로 하기 때문이다. 멘티를 바로 매니저로 올릴 수 있으면 `멘토 중에 선택`이라는 규칙이 사실상 사라진다. 관리자가 굳이 올리려면 멘토를 거치면 되고, 그 과정에서 멘토 프로필(전문분야·경력 연수)을 채우게 된다.

**계정을 만들 때는 매니저로 만들 수 없다.** 관리자 계정 생성과 초대 코드 모두 `MENTOR` 와 `MENTEE` 만 받는다. 초대 코드는 `INVITABLE_ROLES` 로 이미 그렇게 제한돼 있다.

## 3. 데이터 모델

기존 마이그레이션 `20260820020000` 은 건드리지 않는다. 새 마이그레이션 하나를 추가한다.

### 3.1 `users` 컬럼 추가

```sql
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
```

관리자가 만든 계정은 임시 비밀번호를 메일로 받는다. 이 값이 `true` 인 동안에는 비밀번호를 바꾸기 전까지 다른 화면으로 넘어가지 못한다.

### 3.2 `member_profiles` 신설

회원등록 정보는 `users` 에 붙이지 않고 1:1 별도 테이블로 뺀다. `requireAuth` 가 **매 요청마다** `users` 를 읽으므로 인증에 쓰이는 행과 등록 정보를 섞지 않는 편이 낫다.

```prisma
model MemberProfile {
  userId String @id
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // 공통
  organization String   // 소속기관명
  jobTitle     String?  // 직책·직위
  phone        String   // 휴대폰

  // 멘토 전용
  expertise     String?  // 전문분야
  careerYears   Int?     // 경력 연수
  careerSummary String?  // 주요이력·보유자격

  // 멘티 전용
  companyName String?  // 기업명
  industry    String?  // 업종
  foundedYear Int?     // 창업 연차

  // 개인정보 수집·이용 동의
  privacyConsentAt DateTime

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("member_profiles")
}
```

### 3.3 필수 항목

| 구분 | 항목 | 멘토 | 멘티 |
| --- | --- | --- | --- |
| 공통 | 소속기관명 | 필수 | 필수 |
| 공통 | 직책·직위 | 선택 | 선택 |
| 공통 | 휴대폰 | 필수 | 필수 |
| 공통 | 개인정보 동의 | 필수 | 필수 |
| 멘토 | 전문분야 | 필수 | — |
| 멘토 | 경력 연수 | 필수 | — |
| 멘토 | 주요이력·자격 | 선택 | — |
| 멘티 | 기업명 | — | 필수 |
| 멘티 | 업종 | — | 필수 |
| 멘티 | 창업 연차 | — | 선택 |

**프로그램 매니저는 멘토와 똑같이 판정한다.** 매니저는 멘토에서 승격되므로(2.3) 이미 멘토 항목을 채운 상태다. 승격했다고 항목이 사라지면 해임 후 다시 받아야 한다.

**관리자는 공통 항목만 필수다.** 관리자는 운영자이지 멘토링 당사자가 아니라 전문분야나 기업명을 물을 자리가 없다.

**역할별 항목은 DB 에서 전부 nullable 이다.** 멘토에게 `companyName` 을 NOT NULL 로 걸 수 없기 때문이다. 필수 여부는 역할로 분기한 Zod 스키마가 강제한다. 이 분기는 `lib/member-profile.ts` 한 곳에 두고 가입·프로필 수정·관리자 생성 세 경로가 공유한다.

`사업자등록번호`는 받지 않는다. 멘토 배정에도 프로젝트 운영에도 쓰이지 않는데 민감정보라 보관 근거와 접근 통제가 따로 필요하다.

### 3.4 프로필이 없는 회원

`MemberProfile` 행 자체는 선택이다. 이미 DB 에 있는 계정에 필수 컬럼을 소급 적용할 수 없기 때문이다. 프로필이 없는 회원은 로그인 후 작성 화면으로 보낸다. 관리자가 만든 계정도 같은 관문을 지난다. 관리자는 멘토의 전문분야를 모르므로 아는 항목만 넣고, 나머지는 본인이 첫 로그인 때 임시 비밀번호 변경과 **같은 화면에서** 채운다.

## 4. 접근 제어

`lib/authorization.ts` 의 `requireProjectAccess` 가 실제 관문이다. 워크시트 라우트 60여 개가 전부 이 함수를 지난다. 그래서 여기만 고치면 열람 범위가 한 번에 바뀐다.

### 4.1 합성 역할 `VIEWER`

```
ProjectAccessRole = 'OWNER' | 'EDITOR' | 'COACH' | 'ADMIN' | 'VIEWER'
```

판정 순서는 다음과 같다.

1. 시스템 역할이 ADMIN 이면 명시 역할과 무관하게 `ADMIN` 을 준다. `관리자는 이상의 모든 권한을 가진다`를 그대로 옮긴 것이다.
2. 소유자면 `OWNER`, `ProjectMember` 행이 있으면 그 역할.
3. 명시 역할이 없고 `canReadAnyProject(시스템 역할)` 이면 `VIEWER`.
4. 그 외 403.

`VIEWER` 는 `WRITE_ROLES` 에 넣지 않는다. 따라서 `options.write` 를 쓰는 라우트에서 자동으로 막히고, `options.roles: ['OWNER']` 를 쓰는 라우트에서도 그대로 거부된다. **기존 라우트를 한 줄도 고치지 않고** 매니저의 읽기 전용 열람이 성립한다.

멘토 배정은 `ProjectMember.role = 'COACH'` 로 기록한다. COACH 는 이미 `WRITE_ROLES` 밖이라 읽기 전용이 보장된다. 새 역할을 만들지 않는다.

### 4.2 목록 범위

`GET /api/projects` 는 지금 `소유 OR 멤버` 로만 조회한다. `canListAllProjects` 로 `where` 를 분기한다.

| 역할 | 조회 조건 | 응답의 `role` |
| --- | --- | --- |
| ADMIN | 전체 | `ADMIN` |
| PROGRAM_MANAGER | 전체 | 소유·멤버면 그 역할, 아니면 `VIEWER` |
| MENTOR, MENTEE | `소유 OR 멤버` (현행 유지) | 현행 유지 |

응답의 `role` 은 4.1 의 판정 결과와 같은 값이어야 한다. 목록에서 편집 가능해 보이던 프로젝트가 열어 보면 읽기 전용인 어긋남을 막기 위해서다. 매니저가 멘토로 배정된 프로젝트는 `COACH` 로 나가고, 이 역시 읽기 전용이라 결과는 같다.

### 4.3 만료 처리

`requireAuth` 의 만료 차단은 이미 구현돼 있다. 만료되면 모든 API 가 403 이고 데이터는 보존된다. 관리자가 만료일을 연장하면 즉시 복구된다. 이 동작을 그대로 둔다.

## 5. API

| 경로 | 메서드 | 게이트 | 내용 |
| --- | --- | --- | --- |
| `/api/projects` | POST | `canCreateProject` | 멘토·매니저는 403 |
| `/api/projects` | GET | — | 역할별 목록 범위 분기 |
| `/api/projects/[id]/mentors` | GET·POST·DELETE | `canAssignMentor` | 배정·해제. 대상은 `MENTOR` 또는 `PROGRAM_MANAGER` |
| `/api/invites` | GET·POST·DELETE | `canIssueInviteCode` | 코드 발행·목록·회수. 역할은 `MENTOR`·`MENTEE` 만 |
| `/api/auth/signup` | POST | — | `inviteCode` 와 프로필을 함께 받음 |
| `/api/admin/users` | POST | `requireAdmin` | 계정 생성. 역할은 `MENTOR`·`MENTEE` 만 |
| `/api/admin/users` | PATCH | `requireAdmin` | `setRole`·`extendAccess` 액션 추가 |
| `/api/admin/users` | DELETE | `requireAdmin` | 현행 유지. 관리자 전용 (5.5) |
| `/api/me/profile` | GET·PUT | 본인 | 프로필 조회·수정 |

초대와 배정은 매니저도 쓰므로 `requireAdmin` 이 아니라 시스템 역할 게이트를 쓴다. 그래서 경로도 `/api/admin/` 아래에 두지 않는다.

### 5.1 초대 코드 가입

`POST /api/auth/signup` 이 선택 필드 `inviteCode` 를 받는다. 코드가 있으면 `checkInviteCode` 로 검증한 뒤 **하나의 트랜잭션에서** 다음을 처리한다.

1. `User` 생성 — 역할은 코드의 `role`, `accessExpiresAt` 은 `now + accessDurationDays`, `status` 는 `APPROVED`
2. `MemberProfile` 생성
3. `InviteCode.usedAt`·`usedById` 기록

**초대 코드 가입은 자동 승인이다.** 관리자나 매니저가 특정 이메일로 코드를 발급한 행위 자체가 승인이다. 승인 대기로 두면 3개월 시계가 대기 중에 흘러가 버린다.

코드가 없으면 현행대로 `PENDING`, 역할은 기본값 `MENTEE`, `accessExpiresAt` 은 `null` 이다. **이때도 프로필은 함께 받는다.** 역할이 `MENTEE` 로 정해져 있으므로 가입 화면은 멘티 항목을 보여준다. 멘토로 가입하려면 초대 코드가 있어야 하고, 그것이 의도한 동선이다. 관리자가 나중에 역할을 바꾸면 그때 비는 멘토 항목은 본인이 프로필 화면에서 채운다.

### 5.2 역할 변경과 `isAdmin`

`role` 이 단일 진실이다. `isAdmin` 은 `requireAdmin` 이 쓰므로 남기되 `role === 'ADMIN'` 과 항상 동기화한다. 역할을 바꾸는 경로는 `PATCH /api/admin/users` 하나뿐이므로 동기화 지점도 하나다. **이 경로는 `requireAdmin` 게이트 뒤에 있으므로 매니저는 역할을 바꿀 수 없다.**

`setRole` 은 2.3 의 전환표를 검사한다. 판정은 `lib/member-roles.ts` 의 `canTransitionRole(from, to)` 한 함수에 두고 라우트는 그것만 부른다. 허용되지 않는 전환은 400 이며, 왜 막혔는지(`매니저는 멘토 중에서만 승격할 수 있습니다`)를 응답에 담는다. 관리자가 두 단계를 밟아야 한다는 사실을 화면에서 알 수 있어야 하기 때문이다.

마지막 관리자를 강등하면 승인·관리 기능이 영구히 잠긴다. `DELETE` 에 이미 있는 마지막 관리자 보호와 같은 검사를 `setRole` 에도 넣는다.

권한이 줄어드는 변경(강등, 만료 단축, 승인 취소)은 `sessionVersion` 을 올려 이미 발급된 세션을 끊는다. 그러지 않으면 로그인 중인 사용자에게는 변경이 적용되지 않는다.

### 5.3 코드 회수

회수는 행 삭제가 아니라 `expiresAt` 을 현재 시각으로 당기는 방식이다. 누가 누구에게 무엇을 발급했는지가 이력으로 남아야 한다.

### 5.4 메일 발송

`lib/email.ts` 에는 `sendSurveyInvitation` 하나뿐이고 트랜스포터를 만드는 `createTransporter` 가 모듈 안에 갇혀 있다. 초대 코드와 임시 비밀번호 두 종류가 더 필요하므로 공용 `sendMail(options)` 를 빼내고 세 함수가 공유한다. 초대 메일 본문은 이미 `lib/invite-code.ts` 의 `buildInviteEmail` 에 있다.

SMTP 가 설정되지 않은 환경에서는 발송이 실패한다. 이때 계정이나 코드는 이미 만들어진 상태이므로, 응답에 발송 실패를 실어 관리자가 코드나 임시 비밀번호를 직접 전달할 수 있게 한다. 조용히 성공으로 처리하지 않는다.

### 5.5 회원 삭제

**삭제는 관리자 전용이다.** 초대 코드로 들어온 멘토도 예외가 없다. `DELETE /api/admin/users` 는 이미 `requireAdmin` 뒤에 있으므로 라우트는 그대로 두고, 매니저에게 삭제 경로가 생기지 않도록만 지킨다. 매니저용으로 새로 만드는 `/api/invites`, `/api/projects/[id]/mentors` 어디에도 계정을 지우는 동작을 넣지 않는다.

혼동하기 쉬운 세 가지를 구분한다.

| 동작 | 누가 | 결과 |
| --- | --- | --- |
| 배정 해제 | 관리자, 매니저 | `ProjectMember` 행만 삭제. 계정과 프로필은 그대로 |
| 만료·승인 취소 | 관리자 | 접근만 차단. 데이터 전부 보존, 되돌릴 수 있음 |
| 회원 삭제 | 관리자 | 계정 삭제. 되돌릴 수 없음 |

만료됐다고 계정이 자동으로 지워지지 않는다. 3개월이 지나면 접근만 막히고, 지울지는 관리자가 따로 정한다.

삭제의 파급은 역할에 따라 크게 다르다. **멘티를 지우면 그 사람이 소유한 프로젝트와 하위 워크시트가 `Project.ownerId` 의 cascade 를 타고 함께 사라진다.** 배정됐던 멘토의 작업물도 같이 없어진다. 반면 멘토는 `ProjectMember` 행만 가지므로 배정이 풀릴 뿐 프로젝트는 남는다. 기존 `DELETE` 라우트의 `confirmCascade` 확인 절차가 이 차이를 이미 다루고 있으므로 그대로 쓴다.

## 6. 화면

### 6.1 매니저가 들어갈 화면이 없다

`app/admin/page.tsx` 는 관리자 전용이다. 권한이 없으면 `accessDenied` 화면을 띄우고, 그 안에서 쓰는 `/api/admin/*` 도 전부 `requireAdmin` 뒤에 있다. **그런데 매니저에게는 초대 코드 발행과 멘토 배정 권한이 있다.** 지금 구조로는 매니저가 그 두 가지를 할 자리가 없다.

관리자 화면을 매니저에게 열어 주는 방식은 쓰지 않는다. 회원 삭제와 역할 변경이 같은 화면에 있어서, 탭을 숨기는 것만으로는 권한 경계가 화면 조건문에 의존하게 된다. 대신 화면을 나눈다.

| 화면 | 접근 | 내용 |
| --- | --- | --- |
| `/admin` | ADMIN | 회원 관리 전체. 역할 변경, 승인, 계정 생성, 삭제, 기간 연장 |
| `/manage` | ADMIN, PROGRAM_MANAGER | 초대 코드 발행, 멘토 배정, 프로젝트 목록 열람 |

경계가 API 게이트와 그대로 맞는다. `/admin` 뒤는 `requireAdmin`, `/manage` 뒤는 `canIssueInviteCode`·`canAssignMentor` 다. 관리자는 두 화면을 다 쓴다.

### 6.2 파일

`app/admin/page.tsx` 는 이미 782 줄이다. 여기에 더 넣지 않고 컴포넌트로 분리하며, 두 화면이 공유하는 것은 한 벌만 만든다.

| 파일 | 쓰이는 곳 | 내용 |
| --- | --- | --- |
| `components/admin/MembersTab.tsx` | `/admin` | 역할 변경, 승인, 계정 생성, 삭제, 기간 연장, 프로필 열람 |
| `components/admin/InvitesTab.tsx` | `/admin`, `/manage` | 코드 발행·목록·회수 |
| `components/admin/MentorAssign.tsx` | `/admin`, `/manage` | 프로젝트별 멘토 배정·해제 |
| `app/manage/page.tsx` | — | 매니저 화면 |
| `app/signup/page.tsx` | — | 초대 코드 입력란, 역할별 프로필 항목, 동의 체크박스 |
| `app/onboarding/page.tsx` | — | 임시 비밀번호 변경과 프로필 작성을 한 화면에서 처리 |

### 6.3 화면에서 지켜야 할 것

가입 화면은 초대 코드를 먼저 확인해 역할을 알아낸 뒤 그 역할에 맞는 항목만 보여준다. 멘토에게 기업명을 묻지 않기 위해서다. 코드가 없으면 멘티 항목을 보여준다 (5.1).

역할 변경 칸에는 2.3 에서 허용한 대상만 띄운다. 멘티를 고른 상태에서 `프로그램 매니저` 를 제시하고 400 을 받게 하면 관리자가 왜 막혔는지 알 수 없다. 다만 화면의 이 처리는 편의일 뿐이고, 실제 차단은 서버의 `canTransitionRole` 이 한다.

멘토 배정 목록에는 `MENTOR` 와 `PROGRAM_MANAGER` 만 띄운다 (2.1).

## 7. 테스트

기존 테스트는 Prisma 를 mock 하는 방식이다. 그 선례를 따른다.

| 대상 | 내용 |
| --- | --- |
| `tests/member-roles.test.ts` | `canReadAnyProject('PROGRAM_MANAGER')` 기대값 수정, `canWriteAnyProject` 추가, `canTransitionRole` 전환표 전수 |
| `tests/authorization.test.ts` (기존) | ADMIN 승격, VIEWER 합성, 배정 없는 멘토 거부, VIEWER 쓰기 차단을 보강 |
| `tests/member-profile.test.ts` | 역할별 필수 항목 분기, 매니저를 멘토와 같게 판정, 관리자는 공통만 |
| `tests/api-signup-invite.test.ts` | 코드 검증, 트랜잭션 원자성, 자동 승인, 만료일 계산 |
| `tests/api-project-create-gate.test.ts` | 멘토·매니저 403, 멘티·관리자 통과 |
| `tests/api-admin-user-role.test.ts` | `MENTEE → PROGRAM_MANAGER` 400, `MENTOR → PROGRAM_MANAGER` 통과, 마지막 관리자 강등 차단, `isAdmin` 동기화, `sessionVersion` 증가 |
| `tests/api-mentor-assign.test.ts` | 매니저 배정 허용, 멘토·멘티 403, 대상이 멘티면 400, 대상이 매니저면 통과 |

`tests/api-admin-user-delete.test.ts` 는 이미 있다. 매니저가 삭제 경로에 닿지 못한다는 사실은 `requireAdmin` 게이트가 보장하므로 별도 테스트를 만들지 않고, 새 라우트에 삭제 동작을 넣지 않는 것으로 지킨다.

## 8. 결정 사항

브레인스토밍에서 사용자가 고른 것과, 내가 판단해 정한 것을 구분해 남긴다.

### 8.1 사용자 결정

- 매니저는 **모든 프로젝트를 읽기 전용으로** 열람한다.
- 만료되면 **전면 차단**하고 관리자가 연장한다.
- 관리자가 만든 계정은 **임시 비밀번호를 자동 생성해 메일로** 보낸다.
- 범위는 **권한 적용 + 관리자 UI 전체**다.
- 등록 항목은 기본 신원·멘토 전문성·멘티 사업정보·동의 기록 **전부**, 저장은 **별도 테이블**, 입력은 **가입 폼 필수**다.
- 필수 범위는 3.3 표대로, `사업자등록번호`는 **받지 않는다**.
- 초대 코드 없이도 **가입 신청은 할 수 있고, 승인이 나야 다음으로 진행된다**. 현행 `PENDING` 동작을 그대로 둔다 (5.1).
- 프로그램 매니저는 **멘토 중에서 선택하며 관리자만 승격**할 수 있다 (2.3).
- 멘토는 **초대 코드로 들어온 사람을 포함해 관리자만 삭제**할 수 있다 (5.5).

### 8.2 설계자 판단

- 초대 코드 가입은 자동 승인이다 (5.1). 사용자가 `초대코드 없이` 신청한 경우에만 승인을 요구한다고 밝혔으므로, 코드가 있는 가입은 승인을 거치지 않는 것으로 읽었다.
- 매니저 승격은 **두 단계를 강제한다**. 멘티를 바로 매니저로 올릴 수 없고 멘토를 거친다 (2.3).
- 매니저로 승격해도 기존 멘토 배정은 유지되며, 매니저도 새로 멘토 배정을 받을 수 있다 (2.1).
- 매니저·관리자의 프로필 필수 항목은 각각 멘토·공통과 같다 (3.3).
- `role` 이 단일 진실이고 `isAdmin` 은 동기화 대상이다 (5.2).
- 코드 회수는 만료 처리이지 삭제가 아니다 (5.3).
- 매니저는 프로젝트를 만들 수 없다. 멘티가 만들고 멘토가 붙는 구조다.
- 겸직은 플래그가 아니라 본인을 멘토로 배정하는 것으로 성립한다 (2.1).
- 멘토 배정에 새 프로젝트 역할을 만들지 않고 기존 `COACH` 를 쓴다 (4.1).

## 9. 범위 외

- **기존 회원 프로필 일괄 수집.** 프로필 없는 계정은 로그인 시 작성 화면으로 보내는 것까지만 한다. 관리자가 미작성자에게 독촉 메일을 보내는 기능은 넣지 않는다.
- **멘토 자동 매칭.** 전문분야와 업종을 받아 두지만 배정은 사람이 고른다.
- **만료 임박 알림.** 사용자가 전면 차단을 골랐고 배너는 고르지 않았다. 만료 시각은 관리자 화면에서 확인할 수 있다.
- **프로젝트 단위 역할 정리.** `EDITOR` 와 `ADMIN` 이 지금 어디서도 부여되지 않지만 이번 작업과 무관하므로 손대지 않는다.
