> **2026-10-11 이관됨.** 정본은 `E:\Dropbox\coding-1\business plan\bm`(브랜치 `feat/bm-service`, 커밋 `44c0745`)에 있다. 이 사본은 더 고치지 않는다.

# 서비스 2 — 비즈니스 모델 개발·고도화(BM) 독립 구축 계획

**작성일:** 2026-10-04
**상태:** 2026-10-08 결정 1~5 확정, Task 0 사전 검토(5관점·59권고 반증 검증) 반영. 코드·DB·배포는 변경하지 않았다.
**워크시트 정본:** `docs/superpowers/specs/2026-10-08-bm-worksheets-ux-design.md`
**상위 설계:** `docs/superpowers/specs/2026-10-03-founder-platform-architecture-design.md`
**기준선:** `origin/main`. Task 0 수행 시점의 SHA 를 Task 0 보고서에 기록한다(계획 작성 시 `ed63529`, 2026-10-08 검토 시 `42a942e`. 그 사이 접점 변동은 `lib/bulk-worksheet-route.ts` 주석 4줄·`Project.additionalMarketData` 1줄로 설계 영향 없음). 현재 작업 디렉터리가 아니다(§3.1).
**보고서 위치:** `docs/superpowers/reports/2026-10-04-bm-service/task-<번호>.md`
**작업 디렉터리:** `E:\Dropbox\coding-1\business plan\bm` — 사용자 결정(2026-10-11). Dropbox 안이고 경로에 공백이 있다(§3.5 의 완화책).

## 0. 요청

> 상기 구조를 실행할 것을 고려한 서비스 2. BM 을 구축을 위한 계획을 수립하라. 우선은
> 독립적으로 작동하도록 만들 것이다. 별도의 디렉토리를 잡아서 별도로 코딩하는 것이
> 좋은지 분석도 같이 하라.

## 1. 결론

1. **별도 디렉터리에서 코딩한다. 단, 별도 저장소가 아니라 같은 원격(origin)의 독립 clone 이다.**
   Dropbox 밖 경로에 clone 을 두고 `feat/bm-service` 브랜치를 `origin/main` 에서 따며, 그 디렉터리의
   `.env` 는 전용 개발 DB 만 가리킨다(§3). worktree 가 아니라 clone 인 이유는 §3.5 다.
2. **BM 은 독립 모듈로 만든다.** 계정·프로그램·멘토 배정은 기존 것을 그대로 쓰고,
   워크시트·API·화면·보고서는 BM 디렉터리 안에서 완결한다. 기존 파일은 허용 목록
   10곳만 건드린다(§4).
3. **상위 설계 8절의 순서를 바꾼다.** 1단계(플랫폼 골격 전체)와 2단계(공통 엔진
   일반화)를 기다리지 않는다. BM 에 필요한 최소 접점만 먼저 넣고, 공통 엔진은 BM 이
   자기 것을 따로 가진다. 그 대가로 생기는 중복은 대장에 적어 뒤에 합친다(§5).
4. **환경변수 하나로 켜고 끈다.** 꺼진 상태의 운영은 지금과 같다. 그래서 완성 전에도
   마일스톤 단위로 main 에 병합할 수 있고, 긴 브랜치가 생기지 않는다.

## 2. "독립적으로 작동"의 정의

이 계획이 채택한 뜻이다. 다르게 읽으셨다면 §10 결정 1 에서 바로잡는다.

| # | 조건 | 검증 |
| --- | --- | --- |
| I1 | QFD 워크시트·데이터가 하나도 없어도 BM 과제가 개설 → 작성 → 멘토링 → 결과보고서까지 간다 | Task 19 실기동 시나리오 |
| I2 | BM 코드는 QFD 모듈을 import 하지 않는다. 기존 파일 수정은 §4 허용 목록뿐이다 | lint 규칙 + diff 감리 |
| I3 | `NEXT_PUBLIC_ENABLED_SERVICES` 에 `bm` 이 없으면 화면·API 가 전부 닫히고 QFD 동작은 지금과 같다 | 플래그 off 회귀 테스트 |
| I4 | 실DB 와 분리된 디렉터리·DB 에서 dev 서버로 검증한다 | Task 0 |

**독립이 뜻하지 않는 것:** 별도 회원가입, 별도 로그인, 별도 운영 DB. 이 셋을 분리하면
"KS-QFD 이용자를 위한 자매 서비스"가 아니라 다른 제품이 되고, 나중에 합칠 때 회원·
프로그램·멘토 배정을 이관해야 한다.

## 3. 별도 디렉터리에서 코딩하는 것이 좋은가

### 3.1 확인한 사실

| 사실 | 근거 |
| --- | --- |
| 지금 작업 디렉터리(`E:\Dropbox\codetest2`)는 낡은 체크아웃이다 | HEAD 가 `origin/main` 보다 50 커밋 뒤. 작업 트리는 `origin/main` 과 128 파일이 다르고 미추적 94 개 |
| Dropbox 동기화가 저장소 파일을 복제하고 있다 | `tsconfig ((다른 기기)의 충돌된 사본 2026-09-22).tsbuildinfo`, `tests/api-admin-user-delete.test (…충돌된 사본…).ts` |
| 이 디렉터리에서는 dev 서버를 띄울 수 없다 | `.env`·`.env.local` 둘 다 원격 Supabase(실데이터). `CLAUDE.md` 최우선 제약 |
| 이미 worktree 를 Dropbox 밖에서 쓰고 있다 | `git worktree list` 7 개. `C:/Users/user/.codex/...` |
| 병합 대기 브랜치가 많다 | 로컬 브랜치 20 여 개, 최근 것은 2026-10-03 |
| 내가 분석한 플랫폼 파일은 `origin/main` 과 같다 | `lib/auth`·`authorization`·`member-roles`·`program`·`project-creation-approval`·`bulk-worksheet-route`·`mentor-worksheet-analysis`·`final-report-payload` 무차이. 스키마는 `companyName`·`RateLimitHit` 만 작업 트리가 앞섬 |
| `.git` 자체가 Dropbox 동기화 대상이다 | `.git`(66MB)이 `E:\Dropbox\codetest2` 안에 있고 Dropbox 제외 표시가 없다. worktree 를 쓰면 BM 체크아웃의 index·HEAD·logs 와 커밋 객체가 Dropbox 안 `.git` 에 놓인다 |
| 저장소가 공개(public)다 | `gh api repos/cavinseo/codetest2` → visibility public. 설계서의 강의 자료 파일명·쪽수와 계획서의 로컬 경로가 push 되면 공개된다(§10 결정 7) |
| Vercel Preview 가 운영 DB 를 쓴다 | `POSTGRES_*` 환경변수가 Production·Preview·Development 공용. 브랜치 push 마다 Preview 배포가 생기고(Vercel 인증으로 보호됨) main push 는 곧 운영 배포다. 브랜치 보호 없음 |
| `origin/main` 에 `Project.companyName` 이 없다 | 그 컬럼은 미병합 `codex/login-role-validation` 에만 있고 그 브랜치는 origin/main 과 29개 파일에서 충돌한다. BM 은 소유자 `MemberProfile.companyName` 을 읽어 쓴다(§6.3) |
| 작업 디렉터리의 `lib/bulk-worksheet-route.ts` 미커밋 12줄은 BM 과 무관하다 | 미추적 `lib/worksheet-revision.ts` 에 의존하는 미완 작업이라 어느 브랜치에도 없다. S4 접점은 origin/main 기준으로 설계한다 |
| CI 는 main push·PR 에만 돈다 | `.github/workflows/ci.yml`: Node 20, `check:encoding → lint → tsc → test → build`. §8 게이트에는 `check:encoding`·`build` 가 없어 마일스톤 병합 전 추가로 돌린다 |

### 3.2 네 가지 안

| 안 | 내용 | 플랫폼 층 재사용 | 실DB 격리·dev 서버 | 기존 작업과 충돌 | 자매 서비스(계정 공유) | 합칠 때 비용 |
| --- | --- | --- | --- | --- | --- | --- |
| A. 지금 디렉터리에 그대로 | `E:\Dropbox\codetest2` 에 BM 폴더 추가 | 전부 | 불가. dev 서버 금지 | 큼. 낡은 체크아웃 + 미커밋 변경 + Dropbox 충돌 | 유지 | 없음 |
| **B. 같은 저장소, 별도 worktree(권장)** | Dropbox 밖 경로 + 전용 브랜치 + 전용 개발 DB | 전부 | 가능. 그 디렉터리의 `.env` 가 로컬 DB 만 가리킴 | 없음. 물리적으로 다른 디렉터리 | 유지 | `git merge` 한 번. 접점 10 곳만 충돌 후보 |
| C. 별도 저장소의 독립 앱 | 새 Next.js 프로젝트, 자체 로그인·DB | 없음. 복제 또는 재작성 | 가능 | 없음 | **깨짐.** 계정·프로그램·멘토 배정이 둘로 갈림 | 큼. BM 코드를 `Project` 컨테이너로 이식 + 회원·데이터 이관 |
| D. 모노레포 패키지 분리 | `apps/bm` + `packages/platform` | 추출 후 전부 | 가능 | 큼. 추출 자체가 전면 이동 | 유지 | 추출 비용이 선행 |

### 3.3 판단

**B 안이 맞다.** "별도 디렉터리"가 주는 이점(실DB 격리, 병렬 작업, 기존 작업과 무충돌)은
전부 얻고, "별도 저장소"가 내는 비용(플랫폼 층 복제, 계정 분리, 이관)은 하나도 내지 않는다.

C 안을 택하면 복제해야 하는 것이 이만큼이다. 인증·세션·역할·권한·프로그램·초대 코드·
멘토 배정·온보딩·회원 프로필·관리자 콘솔·서비스 설정 암호화·메일·요청 제한. `lib/` 60 여
파일과 `app/api/{auth,me,admin,programs,invites,mentees}` 30 여 라우트, 관리자·로그인·
가입·온보딩 화면이다. 복제한 뒤에는 보안 수정을 두 번 해야 한다. 지금 진행 중인 "로그인
역할 검증" 같은 수정이 그 예다.

A 안은 지금 디렉터리 상태 때문에 안 된다. 낡은 체크아웃 위에 새 서비스를 쌓으면 기준선이
무엇인지 알 수 없는 diff 가 나온다.

### 3.4 C 안(별도 저장소)이 맞아지는 조건

아래 중 하나라도 참이면 다시 판단한다. 지금은 모두 거짓으로 본다.

- BM 을 KS-QFD 와 **다른 고객에게 따로 판매**하고 계정을 섞지 않을 것이다.
- BM 을 **다른 팀·외주**가 다른 기술 스택으로 만든다.
- BM 이 실험이라 **버릴 가능성이 높고** 운영 DB 에 흔적을 남기면 안 된다.

### 3.5 BM 작업 디렉터리 규칙

- 경로는 `E:\Dropbox\coding-1\business plan\bm` 이다(사용자 결정 2026-10-11. 2026-10-04 권장안은 Dropbox 밖이었다). Dropbox 안이므로 새 clone 의
  `.git`·`node_modules`·`.next`·`.stryker-tmp` 에 Dropbox 제외 속성(`com.dropbox.ignored` 스트림)을 걸어 동기화에서 뺀다(Task 0 의 0.2).
  원격 origin 이 정본이므로 `.git` 을 동기화하지 않아도 잃는 것이 없다. 다른 기기에서는 이 폴더를 선택 동기화에서 제외한다.
- 경로에 공백이 있다. 모든 명령에서 경로를 따옴표로 감싼다. 공백 때문에 깨지는 도구가 나오면 보고서 RISKS 에 적고,
  하이픈 경로(`business-plan`)로 옮기는 결정을 §10 에 올린다.
- 그 디렉터리의 `.env` 는 전용 개발 DB 만 가리킨다. `.env.local` 은 두지 않는다
  (Next.js 는 `.env.local` 을 우선 읽으므로, 실수로 복사해 오면 원격 DB 로 붙는다).
- dev 서버는 `npm run dev:local` 로만 띄운다. 이 스크립트는 접속 호스트가 localhost 가
  아니면 시작을 거부한다(Task 1). 이 가드가 있어야 실행 AI 에게 화면 검증을 맡길 수 있다.
- `prisma migrate dev`·`migrate deploy`·시드는 이 디렉터리에서만, 개발 DB 에만 쓴다.
  운영 DB 마이그레이션은 종전대로 사용자가 한다.
- 이 예외는 `CLAUDE.md` 의 "dev 서버 기동 금지"를 BM worktree 에 한해 푸는 것이다.
  규칙 변경이므로 결정 3 으로 올린다.

- **worktree 가 아니라 clone.** `git clone https://github.com/cavinseo/codetest2.git "E:\Dropbox\coding-1\business plan\bm"` 으로 만든다. worktree 는
  메타데이터와 커밋 객체가 Dropbox 안 `.git` 에 남아, 두 기기가 동기화하는 폴더에서 잦은 커밋을 하는 유일한 디렉터리가
  BM 이 되기 때문이다. 로컬 전용 브랜치가 필요하면 `git remote add dropbox E:\Dropbox\codetest2` 로 읽기만 한다.
- **브랜치는 `--no-track` 으로 딴다.** 시작점이 `origin/main` 이면 git 이 upstream 을 origin/main 으로 걸어 `git pull` 이
  main 을 조용히 병합한다(이 저장소에 그렇게 생긴 브랜치가 6개 있다). 첫 push 는 사용자가 `git push -u origin feat/bm-service`.
- **실행 AI 는 `git pull` 을 쓰지 않는다.** `git fetch origin` 만 허용한다.
- **worktree 격리 기능을 쓰지 않는다.** Claude Code 의 spawn_task·EnterWorktree 와 `git worktree add` 는 `.claude/worktrees/<이름>`
  에 중첩 worktree 를 만든다. 거기에는 `.env` 가 없고 커밋이 `claude/<이름>` 브랜치에 떨어진다(실제로
  `E:\Dropbox\codetest2\.claude\worktrees\funny-zhukovsky-6d8c2f` 에 커밋이 남아 있다). 실행 AI 세션의 프로젝트 루트는
  `E:\Dropbox\coding-1\business plan\bm` 이고 하위 에이전트도 같은 디렉터리·같은 브랜치에서만 돈다. 모든 위임 프롬프트의 첫 명령은
  `git rev-parse --show-toplevel && git branch --show-current` 이며 출력이 `E:/Dropbox/coding-1/business plan/bm`·`feat/bm-service` 가 아니면 중단한다.
- **접속 문자열을 `.env` 밖에서 바꾸지 않는다.** `$env:POSTGRES_*=`·인라인 `VAR=… npx …`·`cross-env`·`--env-file` 금지. Next·Prisma
  CLI·`process.loadEnvFile()` 모두 셸 값을 `.env` 보다 우선하므로, 과거 관행(더미 URL 덮어쓰기)이 BM 디렉터리에서는 위험이다.
  예외는 Task 0 의 통합테스트 DB 마이그레이션 한 번뿐이고 그것은 사용자가 한다.
- **쓰기 스크립트 제한.** BM 디렉터리에서도 `scripts/enable-supabase-rls.mjs`·`import-postgres-data.mjs`·`export-current-db-data.mjs`·
  `seed-kano.ts`·`seed-random-kano.ts` 는 금지다. 확인 프롬프트가 없고, Prisma 생성 클라이언트는 `.env` 를 cwd 가 아니라 **생성된
  클라이언트 위치 기준**으로 읽어 `node E:\Dropbox\codetest2\scripts\…` 처럼 절대 경로로 부르면 cwd 가 BM 이어도 원격 DB 에
  닿는다. 허용은 `seed-admin.mjs`(`--yes` 금지)·`find-admin.mjs`·`check-history-fk.mjs` 를 BM 루트에서 `node scripts/…` 로 부르는 것뿐이다.
- **Prisma 명령은 래퍼로만.** `npm run migrate:local -- <하위명령>` 과 `npm run dev:local` 만 쓴다(Task 1 산출물).
  `npx prisma migrate …`·`db push`·`migrate reset`·`npm run dev`·`npx next dev`·launch.json 의 `npm run dev` 항목은 BM 디렉터리에서도 금지다.
- **이 디렉터리의 `.claude/launch.json` 은 `dev:local` 항목 하나만 두고, `.claude/settings.local.json` 에는 `npx prisma *`·`git worktree *`
  같은 와일드카드 허용을 넣지 않는다.** 둘 다 gitignore 대상이라 감리자가 Task 0 에서 직접 만든다.
- **메모리.** Claude Code 의 자동 메모리는 프로젝트 경로에 묶이므로 `E:\Dropbox\coding-1\business plan\bm` 에서 연 세션에는 Dropbox 프로젝트의
  메모리가 보이지 않는다. 필요한 사실은 이 계획서와 Task 0 보고서에 적어 둔다.

## 4. 기존 코드와의 접점 — 허용 목록

BM 브랜치가 건드려도 되는 기존 파일의 전부다. 이 밖의 기존 파일을 고친 Task 는 반려한다.
접점을 허용하는 기준은 둘이다. **(가) 옛 동작이 기본값인 선택 인자를 더하는 것이고,
(나) 그러지 않으면 권한·정합성 로직을 복제해야 하는 경우.**

| # | 파일 | 변경 | 왜 복제가 아니라 접점인가 |
| --- | --- | --- | --- |
| S1 | `prisma/schema.prisma` + 새 마이그레이션 | `Project.serviceKey`, `Program.services`, BM 모델 11 개(§6.3)와 `Project` 역관계. 추가·기본값만 | 과제 컨테이너를 공유해야 권한·배정·이관·삭제가 그대로 통한다 |
| S2 | `lib/authorization.ts` | `requireProjectAccess` 에 `service` 옵션. **기본값 `'qfd'`** | 기본값이 qfd 라 기존 49 개 라우트(origin/main 42a942e 기준)는 손대지 않아도 BM 과제를 404 로 거절한다. `requireAuth` 의 "기본값이 막힘"과 같은 원칙 |
| S3 | `lib/project-creation-approval.ts` | 과제 수를 서비스별로 센다 | 그대로 두면 BM 과제 하나 때문에 멘티의 첫 QFD 과제가 승인을 요구하게 된다(QFD 회귀) |
| S4 | `lib/bulk-worksheet-route.ts` | 설정에 `service?` 를 더해 `requireProjectAccess` 로 넘긴다 | "전체 교체 저장"의 안전 속성 3 개를 복제하지 않는다. 파일 머리말이 복제를 금한 바로 그 코드다 |
| S5 | `app/api/projects/route.ts` | GET `?service=`, POST `serviceKey`. 둘 다 기본 `'qfd'`. 프로그램이 그 서비스를 운영하는지 검사 | 역할별 목록 범위와 개설 권한 분기 140 줄을 복제하지 않는다 |
| S6 | `app/api/programs/route.ts`, `app/api/programs/[id]/route.ts`, `app/api/programs/[id]/projects/route.ts`, `components/admin/ProgramsTab.tsx` | 프로그램의 운영 서비스 지정(관리자). 과제 이관 시 서비스 일치 검사 | 프로그램은 플랫폼 개념이다. BM 프로그램을 만들 방법이 있어야 한다 |
| S7 | `app/project/[id]/layout.tsx` | 과제가 qfd 가 아니면 `projectPath()` 로 리다이렉트 | `/project/${id}` 링크가 17 개 파일 31 곳에 있다. 한 곳에서 받는다 |
| S8 | `app/dashboard/page.tsx` | `<ServiceSwitch />` 한 줄 | BM 으로 가는 길이 하나는 있어야 한다. 서비스가 하나면 아무것도 그리지 않는다 |
| S9 | `package.json`, `.env.example`, `stryker.crap.config.json`, `eslint.config.mjs` | `dev:local` 스크립트, 환경변수 설명, 뮤테이션 대상 추가, BM → QFD import 금지 규칙 | 설정 |
| S10 | `CLAUDE.md` | BM 디렉터리 예외 문단(결정 3 승인됨). **Task 0 의 첫 커밋(문서 반입 커밋)에 포함** — 그래야 감리자가 그 디렉터리에서 migrate·시드·dev:local 을 수행할 수 있다 | 감리 규칙 |

**import 허용 목록.** BM 코드가 가져다 써도 되는 기존 모듈이다. 이름에 QFD 어휘가 있어도
내용이 서비스 중립인 것만 넣었다.

- 플랫폼: `lib/auth`, `lib/authorization`, `lib/member-roles`, `lib/program`, `lib/prisma`,
  `lib/logger`, `lib/api-error`, `lib/id`, `lib/money`, `lib/html-escape`, `lib/bulk-worksheet-route`
- 문서 엔진(블록 단위라 서비스 중립): `lib/final-report-payload`(`reportDocumentSchema`,
  `REPORT_MAX_BYTES` 만), `lib/final-report-document`(타입 `FinalReportBlock`·`FinalReportModel` 만),
  `lib/final-report-edit`, `lib/final-report-docx`, `lib/worksheet-capture`
- 화면: `components/ThemeToggle`, `components/HeaderToast`, `components/ui/*`,
  `components/project/WorksheetLoadError`, `components/project/FinalReportPreview`

## 5. 독립 구축이 만드는 중복 — 통합 대장

공통 엔진을 일반화하지 않고 BM 이 자기 것을 가지므로 아래 중복이 생긴다. 숨기지 않고
적어 두었다가 상위 설계 2 단계(공통 엔진 일반화)에서 합친다. **1 번은 권한·잠금 로직이라
복제 시 원본 테스트를 함께 옮기는 것이 조건이다.**

| # | BM 쪽 | 원본 | 합칠 때 |
| --- | --- | --- | --- |
| 1 | `app/api/projects/[id]/bm/report/route.ts` (초안·완료·분석 저장, 배정 멘토 잠금, 버전 충돌) | `app/api/projects/[id]/report/route.ts` | 스키마를 인자로 받는 라우트 팩토리로 추출 |
| 2 | `app/api/projects/[id]/bm/comments/route.ts` | `.../comments/route.ts` | 허용 worksheetId 목록을 인자화 |
| 3 | `components/bm/BmMentorAnalysis.tsx` | `components/project/MentorWorksheetAnalysis.tsx` | 엔드포인트·스키마 인자화 |
| 4 | `components/bm/BmComments.tsx` | `components/project/WorksheetComments.tsx` | 엔드포인트 인자화 |
| 5 | `lib/bm/completeness.ts` | `lib/worksheet-completeness.ts` | 규칙을 인자로 받는 엔진 |
| 6 | `components/bm/BmShell.tsx`(단계 레일) | `components/project/ProjectWorksheetMenu.tsx` | 레지스트리에서 메뉴 생성 |
| 7 | `/bm` 목록·개설 화면 | `/dashboard` | 통합 대시보드의 서비스 탭 |

## 6. BM 워크시트와 데이터 모델 — 확정(2026-10-08)

정본은 `docs/superpowers/specs/2026-10-08-bm-worksheets-ux-design.md` 다. 그 문서의 5단계 16워크시트
중 **v1 10개 + 결과보고서**를 이 계획으로 만든다. 이 절은 그 설계를 테이블·경로·저장 규칙으로
옮긴 것이고, 둘이 어긋나면 설계서를 고친 뒤 이 절을 맞춘다. 2026-10-04 의 가안(BM-0~7)은 폐기했다.

### 6.1 v1 워크시트

| ID | 경로 | 워크시트 | 판에 속함 | 저장 방식 |
| --- | --- | --- | --- | --- |
| `bm-item` | `/bm/[id]` | BM-01 아이템 요약정리 | 아니오 | `Project` 공통 컬럼 + `BmItemSummary`(1:1) |
| `bm-customers` | `customers` | BM-03 목표고객·문제(=세그먼트) | 아니오 | 행. **id 보존**. 출처 다중 선택 |
| `bm-value` | `value` | BM-05 가치제안 캔버스 | 예 | 카드 행(세그먼트별 6종, 적합 연결) |
| `bm-statement` | `statement` | BM-06 가치제안서 | 예 | 판당 1행. 빈칸 ①~⑦ + 본문 |
| `bm-canvas` | `canvas` | BM-07 비즈니스 모델 캔버스 | 예 | 카드 행(9블록, 세그먼트 색, 근거, 가설 표시) |
| `bm-check` | `check` | BM-09 가능성 점검 | 예 | 문항별 답(예·아니오·모름) |
| `bm-hypotheses` | `hypotheses` | BM-11 가설·실험 보드 | 판을 가로지름 | 행. 가설·실험·학습 한 행 |
| `bm-number` | `number` | BM-12 Number(연 단위) | 예 | 매출 행 + 원가·판관비 행 + 가정값 |
| `bm-history` | `history` | BM-14 판 비교·개선 이력 | 읽기 | 저장 없음. 판 메타 + 순수 비교 |
| — | `report` | 결과보고서 | — | `FinalReport`(기존 테이블) |

v2 로 미룬 것: BM-02 핵심기능, BM-04 경쟁자, BM-08 패턴, BM-10 성과 검토, BM-13 피봇 설계 마법사,
BM-15 스토리텔링, 월 단위 Number·BOM, 카드 간 연결(VP↔CS), 카드 고정 의견, 검토 모드·검토 요청,
발표 모드, 사례 라이브러리, 위험·근거 오버레이. v3: BM-16 시장진입, AI 보조, QFD 연계.
설계서 §5.1 의 카드 연결은 출시 표에 없어 v2 로 분류했다(설계서 §10 결정 밖의 판단, 사용자 확인 필요).

### 6.2 판(version)의 규칙

- 판은 **모델과 그 평가**를 한 묶음으로 얼린다. 판에 속하는 표: 가치제안 캔버스, 가치제안서,
  BM 캔버스, 가능성 점검, Number. 아이템 요약·목표고객은 사실이라 판 밖이고, 가설은 판을 가로질러
  쌓이며 어느 판에서 나왔는지(`originVersionId`)와 어느 판의 근거인지(`supportsVersionId`)를 적는다.
- 상태는 `DRAFT → VALIDATING → FINAL`. `FINAL` 은 읽기 전용이다. 고치려면 새 판을 만든다.
- 새 판 만들기: 트랜잭션에서 과제 행을 `FOR UPDATE` 로 잠그고, 최신 판에 속하는 표 전부를 `number + 1`
  로 복사하며, 직전 판을 `FINAL` 로 바꾼다. `changeNote` 와 근거 가설 1개 이상이 필수다
  (`@@unique([projectId, number])` 가 동시 생성을 막는다).
- 첫 판은 과제 생성 시 만들지 않는다. 판에 속한 워크시트를 처음 저장할 때 1판을 만든다
  (조회는 아무것도 만들지 않는다).
- 모든 카드 표의 저장은 **id 보존**이다(본문의 id 는 갱신, 없는 id 는 생성, 빠진 id 는 삭제). 세그먼트
  색·적합 연결·가설 표시가 id 를 참조하므로 전체 삭제 후 재생성은 쓰지 않는다. `lib/bm/rows-route.ts`
  팩토리가 이 규칙을 한 곳에서 강제한다.

### 6.3 스키마

```prisma
model Program {
    // 이 프로그램이 운영하는 서비스. 기존 행은 전부 QFD 였다.
    services String[] @default(["qfd"])
}

model Project {
    // 어느 서비스의 과제인가. lib/services/registry.ts 가 정본이다. 기존 행은 전부 QFD 다.
    serviceKey String @default("qfd")
    bmItemSummary    BmItemSummary?
    bmPersonas       BmPersonaProblem[]
    bmVersions       BmVersion[]
    bmHypotheses     BmHypothesis[]

    @@index([ownerId, serviceKey])
    @@index([programId, serviceKey])
}

/// 판. 모델과 평가를 한 묶음으로 얼린다. 직전 판을 복사해 만들고, 만들면 직전 판은 FINAL 이 된다.
model BmVersion {
    id          String   @id @default(cuid())
    projectId   String
    number      Int
    status      String   @default("DRAFT") // DRAFT | VALIDATING | FINAL
    title       String?
    changeNote  String?  // 직전 판에서 무엇을 왜 바꿨는가. 2판부터 필수(라우트가 강제)
    createdById String?  // FinalReport.updatedById 처럼 관계 없이 둔다. 계정 삭제를 막지 않는다
    createdAt   DateTime @default(now())
    project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
    valueItems      BmValueItem[]
    valueStatement  BmValueStatement?
    canvasCards     BmCanvasCard[]
    checkAnswers    BmCheckAnswer[]
    revenueLines    BmRevenueLine[]
    costLines       BmCostLine[]
    pnlAssumption   BmPnlAssumption?
    originHypotheses  BmHypothesis[] @relation("HypothesisOrigin")
    supportHypotheses BmHypothesis[] @relation("HypothesisSupports")
    @@unique([projectId, number])
    @@map("bm_versions")
}

/// BM-01 아이템 요약정리. 판 밖. Project 의 name·description 에 없는 항목만 둔다.
/// 기업명은 소유자의 MemberProfile.companyName 을 읽어 보여준다 — 기준선 origin/main 에는
/// Project.companyName 이 없고(미병합 브랜치에만 있음) BM 이 그 컬럼을 추가하면 병합 때 중복된다.
model BmItemSummary {
    projectId        String   @id
    overview         String?
    targetCustomer   String?
    usage            String?
    coreFeature1     String?
    coreFeature2     String?
    coreFeature3     String?
    customerBenefit  String?
    expectedPrice    String?
    updatedAt        DateTime @updatedAt
    project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
    @@map("bm_item_summaries")
}

/// BM-03 목표고객·문제. 한 행이 한 세그먼트이며 카드의 색 기준이다. 판 밖.
model BmPersonaProblem {
    id             String   @id @default(cuid())
    projectId      String
    targetCustomer String
    persona        String?
    problem        String?
    explanation    String?
    // 강의 양식의 출처 체크. NEWS | INTERVIEW_PUBLIC | INTERVIEW_EXPERT | RESEARCH | OTHER
    sources        String[] @default([])
    colorIndex     Int      @default(0) // 1~6. lib/bm/segments.ts 가 정본
    order          Int      @default(0)
    project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
    valueItems     BmValueItem[]
    canvasCards    BmCanvasCard[]
    @@index([projectId])
    @@map("bm_persona_problems")
}

/// BM-05 가치제안 캔버스 카드. side 가 고객 프로필(CUSTOMER)과 가치 도면(OFFER)을 가르고,
/// kind 가 JOB·PAIN·GAIN / PRODUCT·PAIN_RELIEVER·GAIN_CREATOR 를 가른다.
/// fitTargetId 는 가치 도면 카드가 잇는 고객 프로필 카드다(같은 표 안의 자기 참조).
model BmValueItem {
    id            String  @id @default(cuid())
    versionId     String
    segmentId     String
    side          String
    kind          String
    content       String
    evidenceLevel Int     @default(0) // 0~4. lib/bm/evidence.ts 가 정본
    fitTargetId   String?
    order         Int     @default(0)
    version       BmVersion        @relation(fields: [versionId], references: [id], onDelete: Cascade)
    segment       BmPersonaProblem @relation(fields: [segmentId], references: [id], onDelete: Cascade)
    fitTarget     BmValueItem?     @relation("ValueFit", fields: [fitTargetId], references: [id], onDelete: SetNull)
    fittedBy      BmValueItem[]    @relation("ValueFit")
    @@index([versionId, segmentId])
    @@map("bm_value_items")
}

/// BM-06 가치제안서. 빈칸 ①~⑦은 BM-05 카드에서 제안한 초안이며 body 가 사용자가 고친 최종 문장이다.
model BmValueStatement {
    versionId String   @id
    slot1     String?
    slot2     String?
    slot3     String?
    slot4     String?
    slot5     String?
    slot6     String?
    slot7     String?
    body      String?
    updatedAt DateTime @updatedAt
    version   BmVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
    @@map("bm_value_statements")
}

/// BM-07 캔버스 카드. 한 줄 주장이다. hypothesisId 가 있으면 "가설로 표시"된 카드다.
model BmCanvasCard {
    id            String  @id @default(cuid())
    versionId     String
    block         String  // 9블록 키. lib/bm/canvas.ts 가 정본
    content       String
    segmentId     String?
    evidenceLevel Int     @default(0)
    hypothesisId  String?
    order         Int     @default(0)
    version       BmVersion         @relation(fields: [versionId], references: [id], onDelete: Cascade)
    segment       BmPersonaProblem? @relation(fields: [segmentId], references: [id], onDelete: SetNull)
    hypothesis    BmHypothesis?     @relation(fields: [hypothesisId], references: [id], onDelete: SetNull)
    @@index([versionId, block])
    @@map("bm_canvas_cards")
}

/// BM-09 가능성 점검 답. 문항은 lib/bm/checklist.ts 가 정본이고 DB 에는 답만 둔다.
model BmCheckAnswer {
    id         String @id @default(cuid())
    versionId  String
    questionId String
    answer     String // YES | NO | UNKNOWN. UNKNOWN 은 NO 로 세지 않는다
    version    BmVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
    @@unique([versionId, questionId])
    @@map("bm_check_answers")
}

/// BM-11 가설. 가설·실험·학습을 한 행에 둔다. 판을 가로질러 쌓인다.
model BmHypothesis {
    id                String  @id @default(cuid())
    projectId         String
    statement         String  // "우리는 ( )라고 믿는다"
    counterStatement  String? // 반증가설
    type              String  // DESIRABILITY | FEASIBILITY | VIABILITY | ADAPTABILITY
    sourceBlock       String? // 어느 캔버스 블록에서 나왔는가
    originVersionId   String?
    supportsVersionId String? // 이 가설의 결과가 근거가 된 판
    importance        Int     @default(3) // 1~5
    evidence          Int     @default(0) // 0~4
    status            String  @default("PLANNED") // PLANNED | RUNNING | VALIDATED | INVALIDATED
    experiment        String?
    metric            String?
    successCriteria   String?
    duration          String?
    cost              String?
    observation       String?
    learning          String?
    decision          String? // KEEP | MODIFY | PIVOT
    order             Int     @default(0)
    project           Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
    originVersion     BmVersion? @relation("HypothesisOrigin", fields: [originVersionId], references: [id], onDelete: SetNull)
    supportsVersion   BmVersion? @relation("HypothesisSupports", fields: [supportsVersionId], references: [id], onDelete: SetNull)
    canvasCards       BmCanvasCard[]
    @@index([projectId, status])
    @@map("bm_hypotheses")
}

/// BM-12 매출 행. 엑셀 정본의 "아이템 × 예상거래업체 × 연도" 를 연 단위로 옮겼다.
model BmRevenueLine {
    id        String  @id @default(cuid())
    versionId String
    kind      String  // PRODUCT | GOODS | SERVICE (제품·상품·서비스 매출)
    itemName  String
    buyerName String?
    qtyY1     Float?
    qtyY2     Float?
    qtyY3     Float?
    priceY1   Float?
    priceY2   Float?
    priceY3   Float?
    order     Int     @default(0)
    version   BmVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
    @@index([versionId])
    @@map("bm_revenue_lines")
}

/// BM-12 원가·판관비 행. group 이 손익계산서의 어느 줄로 합산되는지 정한다.
model BmCostLine {
    id        String  @id @default(cuid())
    versionId String
    group     String  // COGS_PRODUCT | COGS_GOODS | COGS_SERVICE | PAYROLL | SGA
    item      String
    y1        Float?
    y2        Float?
    y3        Float?
    note      String?
    order     Int     @default(0)
    version   BmVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
    @@index([versionId, group])
    @@map("bm_cost_lines")
}

/// BM-12 가정값. 엑셀 비고란의 규칙이 기본값이다.
model BmPnlAssumption {
    versionId        String   @id
    welfareRatePct   Float    @default(8)  // 복리후생비 = 급여 × 5~12%
    severanceMonths  Float    @default(1)  // 퇴직급여 = 연봉 × 1/12
    taxRatePct       Float    @default(10) // 법인세 최저한세
    note             String?
    updatedAt        DateTime @updatedAt
    version          BmVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
    @@map("bm_pnl_assumptions")
}
```

새 테이블 11개. **마이그레이션 SQL 에 반드시 들어갈 것:** 테이블마다
`ALTER TABLE "bm_…" ENABLE ROW LEVEL SECURITY;` 한 줄. Supabase 의 public 테이블은 RLS 가 꺼져 있으면
REST 경로로 노출된다. `20260911000000_final_report_publication` 이 같은 방식으로 막았다. 테스트가
누락을 잡는다(Task 2).

### 6.4 v1 에 넣지 않는 것

§6.1 의 v2·v3 목록에 더해, 멘티의 둘째 BM 과제(추가 개설 승인 흐름), 멘토 대리 개설 화면, 팀원 초대,
엑셀 올리기·내려받기, 관리자 통계의 서비스별 집계. 이유는 "독립 작동"에 필요하지 않거나 `lib/ai/*`
처럼 다른 브랜치가 고치고 있는 영역을 건드려야 하기 때문이다. v1 에서 멘티는 BM 과제를 하나 가진다.
관리자·매니저는 종전 규칙대로 멘티 소유 과제를 여러 개 열 수 있다.

## 7. 파일 배치

```
lib/services/registry.ts                 서비스 키·라벨·경로·활성 판정(정본)
lib/bm/
    worksheets.ts                        BM 워크시트 id·경로·라벨·단계
    access.ts                            requireBmAccess = 활성 검사 + requireProjectAccess({ service: 'bm' })
    rows-route.ts                        id 보존 저장 라우트 팩토리(과제·판 범위 강제)
    versions.ts                          판 상태 전이, 새 판 복사 트랜잭션, 최신 판 찾기
    segments.ts                          세그먼트 색 6종(순수)
    evidence.ts                          근거 수준 E0~E4 라벨(순수)
    canvas.ts                            9블록 정의·그룹(Front/Back/Number)·판 비교 diff(순수)
    value-statement.ts                   BM-05 카드 → ①~⑦ 초안(순수)
    checklist.ts                         BM-09 문항 정본(블록·4축)·점수 계산(순수)
    hypothesis.ts                        유형·상태 전이·사분면 판정(순수)
    number.ts                            매출·원가·판관비·손익·손익분기 계산(순수)
    completeness.ts                      완성도 규칙·다음에 할 일(순수)
    guide.ts                             블록별 강의 질문 정본
    schemas.ts                           zod 본문 스키마
    mentor-analysis.ts                   워크시트별 멘토 분석 스키마
    report-payload.ts                    BM 초안 스키마
    report-document.ts                   문서 블록 빌더(순수)
app/bm/
    page.tsx                             BM 과제 목록·개설
    [id]/layout.tsx                      활성 관문 + 상단 바(판 선택) + 단계 레일 + 맥락 패널 + 멘토 분석
    [id]/page.tsx                        BM-01 아이템 요약 + 완성도
    [id]/{customers,value,statement,canvas,check,hypotheses,number,history,report}/page.tsx
app/api/projects/[id]/bm/
    item/ customers/ versions/ versions/[n]/{value,statement,canvas,check,number}/
    hypotheses/ history/ overview/ comments/ report/ report/docx/
components/platform/ServiceSwitch.tsx
components/bm/                           BmShell(레일·패널), VersionPicker, CardBoard, SegmentDot, EvidenceBadge,
                                         ValueCanvas, Statement, CanvasBoard, Checklist, Radar, HypothesisBoard,
                                         NumberWorkbench, VersionTimeline, BmMentorAnalysis, BmComments
scripts/assert-local-db.mjs
tests/services-registry.test.ts, tests/bm-*.test.ts, tests/integration/bm-*.integration.test.ts
```

판에 속한 워크시트의 API 는 `versions/[n]/…` 아래에 둔다. 경로에 판 번호가 있어야 지난 판 조회와
최신 판 저장이 같은 핸들러에서 갈리고, `FINAL` 판에 쓰려는 요청을 라우트 층에서 409 로 거절할 수 있다.

## 8. Task

공통 완료 기준: `npx tsc --noEmit && npx vitest run && npx next lint` 통과. **마일스톤 병합 전(M1·M2·M4 끝)에는
`npm run check:encoding` 과 `npm run build` 도 통과한다** — CI(main push·PR 에만 실행, Node 20)가 그 둘을 더 돌리는데 브랜치 push 로는
CI 가 돌지 않아 병합 순간에 처음 알게 되기 때문이다. 신규 순수
모듈은 `npx stryker run stryker.crap.config.json --mutate <파일>` 100% 와 `mutate` 목록
등재. 새 소스 파일 첫 줄에 한국어 역할 주석(`AGENTS.md`). 보고서는 작업 커밋과 별도의
둘째 커밋. 테스트를 먼저 쓴다.

### 준비

#### Task 0 — 독립 디렉터리와 개발 DB 준비

행위자를 줄마다 적는다. `[사용자]` 는 터미널에서 직접, `[감리자]` 는 Claude 세션(BM 디렉터리에서 연 것)이 한다.
현행 `CLAUDE.md` 는 migrate·시드·dev 서버를 디렉터리 조건 없이 금지하므로, 0.3 의 예외 문단 커밋이 끝나기 전에는 감리자가
0.6 을 거부하는 것이 정상이다. 급하면 0.6 전체를 `[사용자]` 가 한다. Task 0 에서는 **push 하지 않는다**(결정 7·8 뒤에 사용자가 한다).
셸은 PowerShell 5.1 기준이다(`&&` 없음. 네이티브 명령 뒤 `$LASTEXITCODE`, cmdlet 뒤 `$?` 를 본다).

**0.1 [사용자] 사전 정리(Task 0 이전)**

- [ ] 결정 7(저장소 공개와 문서 내용)·결정 8(Vercel Preview)을 §10 에서 정한다. Task 0 자체는 push 가 없어 막히지 않는다.
- [ ] 결정 6 수정안(§10)에 따라 무충돌 브랜치만 선병합할지 정한다. `codex/deploy-main-remediation` 은 `%TEMP%` 아래 worktree 에만
      있어(휘발 경로) 유실 위험이 있으니 BM 과 무관하게 origin 에 push 해 둔다. `codex/login-role-validation` 은 선병합하지 않는다.
- [ ] `E:\Dropbox\codetest2\.claude\settings.local.json` 의 `Bash(npx prisma *)`·`migrate reset --force`·`node -e *` 허용은 CLAUDE.md
      최우선 제약과 모순이다. 제거를 권한다(BM 범위 밖, 사용자 판단).

**0.2 [감리자, 2026-10-11 완료] 디렉터리 — clone**

```powershell
# 대상 폴더 "E:\Dropbox\coding-1\business plan\bm" 는 비어 있어야 한다
git clone https://github.com/cavinseo/codetest2.git "E:\Dropbox\coding-1\business plan\bm"
Set-Location "E:\Dropbox\coding-1\business plan\bm"
git rev-parse origin/main                      # 이 SHA 를 task-0.md 에 적는다(2026-10-11: f96262b)
git switch -c feat/bm-service --no-track origin/main
git status --short                             # 비어 있어야 한다
Get-ChildItem -Force -Filter '.env*' | Select-Object Name   # .env.example 한 줄뿐이어야 한다
# Dropbox 동기화 제외(폴더가 있어야 속성을 걸 수 있으므로 먼저 만든다)
New-Item -ItemType Directory -Force node_modules, .next, .stryker-tmp | Out-Null
foreach ($d in '.git','node_modules','.next','.stryker-tmp') { Set-Content -Path $d -Stream com.dropbox.ignored -Value 1 }
```

다른 기기(충돌 사본을 만든 기기)에서는 Dropbox 선택 동기화에서 `coding-1\business plan\bm` 을 제외한다.

- [x] `git diff --stat ed63529 origin/main -- prisma/schema.prisma lib/authorization.ts lib/project-creation-approval.ts lib/bulk-worksheet-route.ts app/api/projects/route.ts app/api/programs/route.ts "app/api/programs/[id]/route.ts" "app/api/programs/[id]/projects/route.ts" components/admin/ProgramsTab.tsx "app/project/[id]/layout.tsx" app/dashboard/page.tsx package.json .env.example stryker.crap.config.json eslint.config.mjs CLAUDE.md`
      출력을 task-0.md 에 붙이고, §4 설계에 영향이 있는지 한 줄씩 적는다(2026-10-08 기준 영향 없음. 2026-10-11 f96262b 에서 42a942e 이후 접점 변동 0).

**0.3 [감리자] 문서 반입과 BM 디렉터리 규칙 — 첫 커밋**

- [ ] 미추적 문서 6건을 **파일 단위로** 복사한다(패턴 복사 금지 — Dropbox 충돌 사본이 섞인다):
      `docs/superpowers/plans/2026-10-04-bm-service.md`, `docs/superpowers/specs/2026-10-03-founder-platform-architecture-design.md`,
      `docs/superpowers/specs/2026-10-08-bm-worksheets-ux-design.md`, `docs/superpowers/specs/2026-10-08-startup-commercialization-plan-overview.md`,
      `docs/superpowers/prompts/2026-10-04-bm-service/session-start.md`, `docs/superpowers/prompts/2026-10-04-bm-service/task-1.md`.
      이름에 "충돌된 사본" 이 든 파일은 가져오지 않는다. 결정 7 의 결과에 따라 설계서 §1 의 파일명·쪽수를 줄인다.
- [ ] `CLAUDE.md` 에 아래 예외 문단(S10)을 "⚠️ 최우선 환경 제약" 절 끝에 넣는다.
- [ ] `docs/superpowers/reports/2026-10-04-bm-service/.gitkeep` 을 만든다.
- [ ] 커밋 `docs: BM 계획·설계 문서를 반입하고 BM 디렉터리 규칙을 적는다`. 본문에 "왜"(기준선 origin/main 에는 이 문서가 없고, 예외 문단이
      있어야 감리자가 로컬 DB 작업을 할 수 있다)를 적는다. 이 커밋 뒤 계획서 수정은 **이 디렉터리에서만** 한다. Dropbox 원본은 더 고치지 않는다.

CLAUDE.md 예외 문단 문안:

```markdown
### BM 디렉터리 예외 (feat/bm-service, E:\Dropbox\coding-1\business plan\bm)

위 금지는 `.env` 가 원격 실DB 를 가리키는 디렉터리의 규칙이다. `E:\Dropbox\coding-1\business plan\bm`(브랜치 `feat/bm-service`)은
`.env` 의 `POSTGRES_PRISMA_URL`·`POSTGRES_URL_NON_POOLING` 호스트가 `localhost`·`127.0.0.1` 일 때에 한해 다음을 허용한다.

- dev 서버: `npm run dev:local` 로만 띄운다. `npm run dev`·`npx next dev`·launch.json 의 `npm run dev` 항목은 여기서도 금지다.
- 마이그레이션: `npm run migrate:local -- <하위명령>` 으로만. `npx prisma migrate …`·`db push`·`migrate reset`·`studio` 금지.
  두 스크립트가 아직 없으면(Task 1 이전) 사용자가 터미널에서 직접 한다.
- 시드: `node scripts/seed-admin.mjs <주소>` 를 이 디렉터리 루트에서, `--yes` 없이. `enable-supabase-rls`·`import-postgres-data`·
  `export-current-db-data`·`seed-kano`·`seed-random-kano` 는 여기서도 금지다.
- 접속 문자열을 `.env` 밖(셸 변수·인라인·`--env-file`)에서 바꾸지 않는다. `.env.local`·`.env.development*`·`prisma/.env` 를 만들지 않는다.
- `prisma generate` 가 `EPERM … query_engine-windows.dll.node` 로 실패하면 이 디렉터리에서 띄운 `dev:local`·vitest 를 내리고 다시 한다.
  다른 디렉터리의 서버를 건드리지 않는다.
- 가드가 거부하거나(종료 코드 1) 호스트가 로컬이 아니면 우회하지 말고 중단·보고한다.
- 위임 프롬프트의 첫 명령은 `git rev-parse --show-toplevel && git branch --show-current` 이고, 출력이 `E:/Dropbox/coding-1/business plan/bm`·`feat/bm-service`
  가 아니면 중단한다. worktree 격리(spawn_task·EnterWorktree·`git worktree add`)와 `git pull` 은 쓰지 않는다.
```

**0.4 [사용자] 로컬 PostgreSQL 16 — 역할과 DB 2개**

클러스터 로캘이 `Korean_Korea.949` 라 template1 이 UTF8 이 아닐 수 있다. `ENCODING 'UTF8' TEMPLATE template0` 은 필수다.
전용 역할에 `CREATEDB` 를 주는 이유는 Task 2 의 `migrate dev --create-only` 가 섀도 DB 를 만들기 때문이다. 비밀번호는 `\password` 로
대화식 입력한다(명령행에 적으면 PowerShell 이력에 남는다).

```powershell
psql -U postgres -h 127.0.0.1 -c "CREATE ROLE codetest2_dev LOGIN CREATEDB;"
psql -U postgres -h 127.0.0.1 -c "\password codetest2_dev"
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE codetest2_bm_dev  OWNER codetest2_dev ENCODING 'UTF8' TEMPLATE template0;"
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE codetest2_bm_test OWNER codetest2_dev ENCODING 'UTF8' TEMPLATE template0;"
psql -U codetest2_dev -h 127.0.0.1 -d codetest2_bm_dev -c "SHOW server_encoding;"   # UTF8, 역할 접속 확인
```

**0.5 [사용자] `.env` 작성**

`.env.example` 을 베껴 **새로 쓴다**. Dropbox 디렉터리의 `.env`·`.env.local` 은 열어 보지도 않는다. `.env.local`·`.env.development`·
`.env.development.local`·`prisma/.env` 는 만들지 않는다. `DATABASE_URL` 과 `NEXTAUTH_SECRET` 은 넣지 않는다. 비밀번호에 `@ : / ? #` 가
있으면 퍼센트 인코딩한다. `pgbouncer=true` 는 Supabase 풀러 옵션이라 붙이지 않는다.

```
POSTGRES_PRISMA_URL="postgresql://codetest2_dev:<비밀번호>@localhost:5432/codetest2_bm_dev?schema=public"
POSTGRES_URL_NON_POOLING="postgresql://codetest2_dev:<비밀번호>@localhost:5432/codetest2_bm_dev?schema=public"
INTEGRATION_DATABASE_URL="postgresql://codetest2_dev:<비밀번호>@127.0.0.1:5432/codetest2_bm_test?schema=public"
SESSION_SECRET="<node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\" 출력>"
ADMIN_EMAILS="<본인 개발용 주소>"
NEXT_PUBLIC_ENABLED_SERVICES="qfd,bm"
```

`INTEGRATION_DATABASE_URL` 의 호스트는 반드시 `127.0.0.1` 이다(`tests/integration/mentor-multiple-mentees` 가 그 값만 허용한다).
선택값(없으면 코드 기본값과 같다): `NEXTAUTH_URL`(http://localhost:3000), `ALLOW_DEV_ADMIN`(false), `AI_PROVIDER`(rule).

- [ ] 셸에 접속 변수가 남아 있지 않다: `Get-ChildItem Env: | Where-Object Name -match 'POSTGRES|DATABASE_URL'` 이 비어 있다.
- [ ] `.env*` 파일이 `.env`·`.env.example` 두 개뿐이다.

**0.6 [사용자, 또는 0.3 커밋 뒤 감리자] 설치 → 생성 → 호스트 확인 → 마이그레이션 → 시드**

순서가 중요하다. `migrate deploy` 는 클라이언트를 생성하지 않고 `seed-admin` 은 `@prisma/client` 를 import 한다. 전부 **이 디렉터리의**
`node_modules` 에 한다(Dropbox 쪽 생성 클라이언트는 다른 브랜치 스키마다).

```powershell
Set-Location "E:\Dropbox\coding-1\business plan\bm"
npm ci
npx prisma validate
npx prisma generate
node -e "process.loadEnvFile();for(const k of ['POSTGRES_PRISMA_URL','POSTGRES_URL_NON_POOLING','INTEGRATION_DATABASE_URL']){const v=process.env[k];const u=v&&new URL(v);console.log(k,u?u.host+u.pathname:'(없음)')}"
npx prisma migrate status            # Datasource … at "localhost:5432" 줄을 task-0.md 에 원문으로
npx prisma migrate deploy
npx prisma migrate status            # Database schema is up to date
node scripts/seed-admin.mjs <본인 개발용 주소>    # '대상 DB :' 줄이 localhost 인지 보고 y. --yes 금지
```

- 위 `node -e` 한 줄의 세 호스트가 전부 `localhost:5432`·`127.0.0.1:5432` 여야 다음으로 간다.
- 마이그레이션은 저장소에 해시가 커밋된 `admin@ks-qfd.com` 계정을 자동 생성한다(`20260819010000` migration.sql). 그 계정은 쓰지 않는다.
  `ADMIN_EMAILS` 와 seed-admin 인자에는 본인 개발용 주소를 쓴다. 새 계정이라 임시 비밀번호가 화면에 한 번 찍힌다 — 보고서·로그에 적지 않는다.
- 통합테스트 DB 에도 마이그레이션을 적용한다. 통합 테스트는 migrate 를 돌리지 않으므로 빼먹으면 "컬럼 없음" 으로 실패한다.
  **마이그레이션이 늘 때마다(Task 2, 이후 BM 마이그레이션) 다시 한다.** 셸 변수가 `.env` 보다 우선하는 성질을 쓰는 유일한 예외이며 사용자가 한다.

```powershell
$env:POSTGRES_PRISMA_URL = "postgresql://codetest2_dev:<비밀번호>@127.0.0.1:5432/codetest2_bm_test?schema=public"
$env:POSTGRES_URL_NON_POOLING = $env:POSTGRES_PRISMA_URL
npx prisma migrate deploy            # Prisma 가 'conflict' 경고를 찍지만 정상이다
Remove-Item Env:POSTGRES_PRISMA_URL; Remove-Item Env:POSTGRES_URL_NON_POOLING
```

**0.7 [감리자] 도구 설정(둘 다 gitignore 대상이라 커밋되지 않는다 — task-0.md 에 만든 사실을 적는다)**

- [ ] `.claude/launch.json`: configuration 은 `bm-local` 하나(`runtimeExecutable: "npm", runtimeArgs: ["run","dev:local"], port: 3000`). Task 1 전까지는
      `dev:local` 이 없으므로 실행되지 않는 것이 맞다.
- [ ] `.claude/settings.local.json`: 첫 세션의 허용 대화상자에서 `npx prisma validate`·`generate`·`migrate status` 만 개별 허용한다.
      `npx prisma *`·`git worktree *`·`npm run *` 와일드카드는 넣지 않는다.

**0.8 [감리자] 기준선 기록 → `docs/superpowers/reports/2026-10-04-bm-service/task-0.md`**

```powershell
node -v; npx prisma -v
npx tsc --noEmit
npx vitest run
npx next lint
npm run check:encoding
npm run build
$env:INTEGRATION_DATABASE_URL = "postgresql://codetest2_dev:<비밀번호>@127.0.0.1:5432/codetest2_bm_test?schema=public"
npx vitest run --config vitest.integration.config.ts tests/integration/mentoring.integration.test.ts tests/integration/mentor-project-creation.integration.test.ts
Remove-Item Env:INTEGRATION_DATABASE_URL
```

- `npm run test:integration` 전체는 한 DB 로 통과할 수 없다. `import-restore`·`overview-market`·`review-regressions`·`password-settings` 네 파일이
  다른 DB 이름·포트를 고정하고 있다. BM 은 파일 지정 실행만 요구하며 그 네 건의 실패를 회귀로 보지 않는다. BM 통합 테스트의 가드도 기존 다수
  파일과 같은 형태(비어 있음·`POSTGRES_PRISMA_URL` 과 동일·호스트 `127.0.0.1`/`localhost` 외 → throw)로 쓴다.
- task-0.md 에 적을 것: 기준선 SHA(`git rev-parse HEAD`, `git merge-base HEAD origin/main`), 접점 diff 판정(0.2), Node·Prisma 버전(CI 는 Node 20),
  두 DB 의 `migrate status` 원문, 게이트 6종과 통합 테스트 2파일의 마지막 줄, `git worktree list` 항목 수(Dropbox 쪽, 감리 때 늘지 않았는지 비교).
  비밀번호·임시 비밀번호·접속 문자열은 적지 않는다. 이 보고서는 둘째 커밋 `docs: Task 0 결과 보고서` 로 남긴다.

**0.9 [감리자] 개발 계정 준비 절차(Task 6 화면 검증 전까지. 개발 시드 스크립트는 만들지 않는다)**

SMTP·Google 설정은 DB `ServiceSetting` 에 저장되므로 빈 개발 DB 에서는 항상 미설정이다. 관리자 콘솔의 **직접 계정 생성**(임시 비밀번호가 메일로만
나간다)과 초대의 **메일 발송**(502) 버튼은 쓰지 않는다. Google 로그인도 닫혀 있다.

1. seed-admin 이 찍은 임시 비밀번호로 `/admin` 로그인(관리자는 온보딩 관문을 거치지 않는다).
2. 프로그램 탭에서 BM 프로그램 개설(매니저 생략 = 관리자 본인. Task 5 이후에는 서비스에 `bm` 체크).
3. 초대 탭에서 멘티 주소로 초대 코드 발급 → 관리자에게는 화면에 코드가 보인다 → 복사.
4. 시크릿 창에서 초대 로그인(`/login` 의 초대 코드 모드 또는 `/signup` 에 MENTEE + 코드) → `/onboarding` 프로필 작성.
5. 다른 시크릿 창에서 `/signup` 으로 멘토 가입(비밀번호 직접 지정) → 관리자 콘솔 회원 탭에서 승인 → 온보딩.
6. 관리자 콘솔에서 멘티에게 멘토 배정.
7. 멘티로 과제 개설. 반복 초기화가 잦아지면 그때 `scripts/seed-dev-bm.mjs`(로컬 호스트 가드 포함)를 별도 Task 로 올린다.

**Task 0 완료 확인 체크리스트(감리자, 실행 AI 에게 넘기기 전)**

1. `git -C "E:\Dropbox\coding-1\business plan\bm" rev-parse --show-toplevel HEAD --abbrev-ref HEAD` → `E:/Dropbox/coding-1/business plan/bm`, 기록한 SHA, `feat/bm-service`.
   `git log --oneline -2` 의 첫 두 커밋이 문서 반입 커밋과 task-0.md 커밋이다. `git status` 가 깨끗하다.
2. `.env*` 는 `.env`·`.env.example` 뿐. `.vercel`·`prisma/.env` 없음. 셸 Env 에 `POSTGRES|DATABASE_URL` 없음.
3. 0.6 의 `node -e` 한 줄이 세 호스트 모두 로컬이고, DB 이름이 `postgres` 가 아니며 앱 DB 와 테스트 DB 이름이 다르다.
4. `node_modules\.prisma\client\query_engine-windows.dll.node` 가 있고 `npx prisma -v` 가 lock 의 6.19.x 다.
5. 두 DB 모두 `migrate status` 가 `Database schema is up to date`.
6. 본인 주소의 관리자로 `/admin` 에 로그인된다(dev 서버는 Task 1 뒤 `dev:local` 로. 그 전에는 로그인 확인을 Task 1 완료 후로 미룬다).
7. `.claude/launch.json` 에 `dev:local` 항목만 있고 `settings.local.json` 에 와일드카드 허용이 없다.
8. task-0.md 에 비밀값이 없다.

#### Task C — BM 워크시트 정본 확정 (완료 2026-10-08)

- [x] 사용자 강의 자료(`E:\Dropbox\강의교재 및 자료\BM\` 의 표준강의 2025-09, 고도화 강의 2022-11, 추정손익 v.2)를 정본으로 삼았다.
- [x] `docs/superpowers/specs/2026-10-08-bm-worksheets-ux-design.md` 에 5단계 16워크시트·화면 구성·토큰·모델 영향을 적었다.
- [x] 사용자가 권장안(결정 1~6)을 승인해 §6·§7·Task 7~18 을 그에 맞춰 다시 썼다.

Task 0 과 M1 은 이 확정과 무관하게 진행한다.

### M1 — 접점과 골격

#### Task 1 — 서비스 레지스트리, 활성 플래그, 로컬 DB 가드

신규: `lib/services/registry.ts`, `lib/bm/worksheets.ts`, `scripts/assert-local-db.mjs`,
`tests/services-registry.test.ts`, `tests/assert-local-db.test.ts`. 접점: S9.

```ts
// 서비스(방법론 모듈)의 키·라벨·경로와 활성 여부를 한 곳에서 정한다.
export const SERVICE_KEYS = ['qfd', 'bm'] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];
export const DEFAULT_SERVICE: ServiceKey = 'qfd';

export const SERVICES: Record<ServiceKey, { label: string; shortLabel: string; basePath: string }> = {
    qfd: { label: 'KS-QFD', shortLabel: 'QFD', basePath: '/project' },
    bm: { label: '비즈니스 모델 개발·고도화', shortLabel: 'BM', basePath: '/bm' },
};

export function parseServiceKey(value: unknown): ServiceKey | null {
    return SERVICE_KEYS.includes(value as ServiceKey) ? (value as ServiceKey) : null;
}

/**
 * 켜져 있는 서비스. qfd 는 끌 수 없다 — 값이 비거나 오타가 나도 기존 서비스가
 * 닫히면 안 된다. 모르는 키는 버린다.
 */
export function enabledServiceKeys(raw: string | undefined = process.env.NEXT_PUBLIC_ENABLED_SERVICES): ServiceKey[] {
    const requested = (raw ?? '').split(',').map((item) => item.trim().toLowerCase());
    return SERVICE_KEYS.filter((key) => key === DEFAULT_SERVICE || requested.includes(key));
}

export function isServiceEnabled(key: ServiceKey, raw?: string): boolean {
    return enabledServiceKeys(raw).includes(key);
}

export function projectPath(key: ServiceKey, projectId: string): string {
    return `${SERVICES[key].basePath}/${projectId}`;
}

/** 이 프로그램이 이 서비스의 과제를 운영하는가. */
export function programOffersService(program: { services: string[] }, key: ServiceKey): boolean {
    return program.services.includes(key);
}
```

`NEXT_PUBLIC_` 접두를 쓰는 이유: 화면(대시보드의 전환 링크)과 서버(라우트의 404)가
**같은 값**을 읽어야 반쯤 열린 상태가 생기지 않는다. `lib/feature-flags.ts` 가 상수로
지키던 것과 같은 속성이다. 상수 대신 환경변수인 이유는 "병합 = 출시"가 되지 않게 하기
위해서다.

`scripts/assert-local-db.mjs`: `loadEnvFileIfPresent()` 뒤의 **최종 `process.env`**(셸·인라인 값이 이기는 값)를 판정한다. 거부 조건:
`.env.example` 을 제외한 `.env.*` 파일(`.env.local`·`.env.development`·`.env.development.local` 등)이나 `prisma/.env` 가 있음(이름만 출력) /
`POSTGRES_PRISMA_URL`·`POSTGRES_URL_NON_POOLING` 중 하나라도 비었거나 파싱 불가 / 그 둘과, 설정돼 있다면 `DATABASE_URL`·
`INTEGRATION_DATABASE_URL` 의 호스트가 `localhost`·`127.0.0.1`·`::1`·`[::1]` 밖. 거부면 종료 코드 1. 판정 함수는 값을 받아 판정만
하게 분리해 테스트한다(`scripts/admin-recovery.mjs` 와 같은 구조, `describeDatabase` 재사용). 접속 문자열은 출력하지 않는다.
호스트 이름만 찍는다. DB 에는 접속하지 않는다.

```json
"dev:local": "node scripts/assert-local-db.mjs && next dev --turbopack",
"migrate:local": "node scripts/assert-local-db.mjs && prisma migrate"
```

`migrate:local` 은 `npm run migrate:local -- dev --create-only`·`-- deploy`·`-- status` 처럼 하위 명령을 받는다. `migrate dev` 는
`--create-only` 여도 미적용 마이그레이션을 대상 DB 에 먼저 적용하고 섀도 DB 를 만들므로, dev 서버와 같은 가드 아래 둔다.

- [ ] 테스트: 빈 값·오타·대소문자·공백·`bm` 만 준 경우에도 qfd 가 켜져 있다. 모르는 키는 무시된다.
- [ ] 테스트: 원격 호스트·`.env.local`·`.env.development.local`·`prisma/.env` 존재·값 없음·`.env` 는 로컬인데 셸 값이 원격인 경우에서 가드가 거부한다. 출력에 사용자명·비밀번호·전체 URL 이 없다.
- [ ] 레지스트리 뮤테이션 100%, `mutate` 목록 등재.

#### Task 2 — 스키마와 마이그레이션

접점: S1. 신규: `prisma/migrations/<시각>_bm_service/migration.sql`, `tests/bm-schema.test.ts`.

- [ ] §6.2 를 스키마에 넣는다. 기존 모델에는 컬럼 2 개와 역관계만 더한다.
- [ ] 개발 DB 에 `npm run migrate:local -- dev --create-only` 로 SQL 을 만들고, 새 테이블 11 개(§6.3)에 RLS 줄을 붙인다. 폴더 이름이 origin/main 과 병합 대기 브랜치의 어떤 마이그레이션보다 뒤인지 확인한다(미병합 `20261008000000_enable_rls_missing_tables` 가 있다).
- [ ] 테스트 DB(`codetest2_bm_test`)에도 같은 마이그레이션을 적용한다(Task 0 의 통합테스트 DB 절차). 통합 테스트는 migrate 를 돌리지 않는다.
- [ ] 테스트: 마이그레이션 SQL 의 모든 `CREATE TABLE "bm_` 에 대응하는 `ENABLE ROW LEVEL SECURITY` 가 있다.
- [ ] 테스트: BM 모델이 전부 `Project` 로 `onDelete: Cascade` 다. `Project.serviceKey`·`Program.services` 의 기본값이 qfd 다.
- [ ] 테스트: 마이그레이션에 `DROP`·`RENAME`·`ALTER COLUMN … TYPE` 이 없다.
- [ ] `npx prisma validate`, `npx prisma generate`.

감리 표본: SQL 을 직접 읽어 기존 테이블에 대한 변경이 `ADD COLUMN … DEFAULT` 2 건과
인덱스 2 건뿐인지 확인한다.

#### Task 3 — 권한 접점

접점: S2·S3·S4. 신규: `lib/bm/access.ts`, `tests/bm-access.test.ts`.

```ts
// lib/authorization.ts — requireProjectAccess
options: { write?: boolean; roles?: ProjectAccessRole[]; service?: ServiceKey } = {}
// select 에 serviceKey 추가
// 서비스가 다른 과제는 이 라우트에 존재하지 않는 것으로 본다. 기본값이 qfd 라 기존
// 라우트는 고치지 않아도 다른 서비스의 과제를 거절한다. 403 이 아니라 404 인 이유는
// "있지만 못 본다"가 아니라 "이 서비스에는 없다"가 사실이기 때문이다.
if (project.serviceKey !== (options.service ?? DEFAULT_SERVICE)) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
}
```

```ts
// lib/project-creation-approval.ts
// 첫 과제 무승인은 서비스별로 센다. 합쳐 세면 BM 과제 하나가 멘티의 첫 QFD 과제에
// 승인을 요구하게 만든다.
const serviceKey = data.serviceKey ?? 'qfd';
if (requiresApproval && await tx.project.count({ where: { ownerId: data.ownerId, serviceKey } }) >= 1) {
```

```ts
// lib/bm/access.ts
// BM 라우트의 관문. 서비스가 꺼져 있으면 과제 조회보다 먼저 404 로 닫는다.
export async function requireBmAccess(request: NextRequest, projectId: string, options: { write?: boolean } = {}) {
    if (!isServiceEnabled('bm')) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return requireProjectAccess(request, projectId, { ...options, service: 'bm' });
}
```

- [ ] 테스트: qfd 과제 + 기본 옵션 → 통과. bm 과제 + 기본 옵션 → 404. bm 과제 + `service: 'bm'` → 통과. qfd 과제 + `service: 'bm'` → 404.
- [ ] 테스트: 서비스 불일치는 권한 판정(`resolveProjectRole`)보다 먼저 404 다. 남의 과제 id 로도 403 이 아니라 404 가 나온다.
- [ ] 테스트: BM 과제 1 건을 가진 멘티의 첫 QFD 과제가 승인 없이 열린다. QFD 2 건째는 종전대로 승인을 요구한다.
- [ ] `tests/` 의 `authorization` 관련 mock 에 `serviceKey: 'qfd'` 를 채운다. **`?? 'qfd'` 같은 누락 허용 폴백을 넣어 테스트를 통과시키지 않는다.**
- [ ] 격리 DB 통합 테스트 `mentor-project-creation`·`mentoring` 이 그대로 통과한다.

감리 표본: 이 Task 가 계획 전체의 1 순위다. 기본값 가드는 `requireProjectAccess` 를 거치는
라우트에만 걸린다. 2026-10-04 에 `grep` 으로 확인한 결과(origin/main 42a942e 에서는 `dev-plan` 라우트가 사라져 49 개), `app/api/projects/[id]/**` 중
이 함수(또는 `createBulkWorksheetRoute`)를 쓰지 않는 것은 `mentors/route.ts` 하나다. 멘토
배정은 과제가 아니라 멘티 단위라 서비스 중립이고, BM 과제에서도 그대로 동작해야 한다.
`projects/[id]` 밖에서 과제 id 를 다루는 것은 `admin/projects`(목록·삭제), `admin/projects/[id]/transfer`
(이관), `programs/[id]/projects`(프로그램 이동, Task 5 에서 서비스 일치 검사), `survey/[token]`
(Kano 토큰, QFD 전용) 넷이다. 기준선이 바뀌었을 수 있으니 구현 시점에 다시 확인한다.

#### Task 4 — 과제 목록·개설 접점

접점: S5. 테스트: `tests/api-projects-service.test.ts`.

- [ ] GET `?service=`. 없으면 qfd. 모르는 값은 400, 꺼진 서비스는 404. 목록 범위 계산은 그대로 두고 `where` 에 `serviceKey` 만 더한다.
- [ ] POST `serviceKey`. 없으면 qfd. 꺼진 서비스는 404.
- [ ] 세 갈래(멘토·멘티·관리자/매니저)가 대상 프로그램을 정한 뒤 한 번, `programOffersService` 로 검사한다. 아니면 400 `이 프로그램은 <서비스명> 과제를 운영하지 않습니다.`
- [ ] `serviceKey !== 'qfd'` 이면 `approvalRequestId` 를 무시한다. QFD 용으로 받은 승인이 BM 개설에 소비되면 안 된다.
- [ ] 테스트: `service` 를 주지 않은 GET 응답에 BM 과제가 섞이지 않는다(대시보드 회귀).
- [ ] 테스트: BM 을 운영하지 않는 프로그램의 멘티가 BM 과제를 열 수 없다. QFD 를 운영하지 않는 프로그램의 멘티가 QFD 과제를 열 수 없다.
- [ ] 테스트: 멘티가 본문에 `programId`·`ownerMenteeId` 를 실어도 무시되는 기존 규칙이 `serviceKey: 'bm'` 에서도 지켜진다.

#### Task 5 — 프로그램의 운영 서비스

접점: S6. 테스트: `tests/api-programs-services.test.ts`, `tests/admin-programs-render.test.ts` 보강.

- [ ] 개설·수정 본문에 `services`. 관리자만. 비어 있을 수 없고 켜진 서비스의 부분집합이어야 한다. 생략하면 `['qfd']`.
- [ ] 목록 응답에 `services` 를 싣는다.
- [ ] 과제가 남아 있는 서비스를 프로그램에서 빼려 하면 400.
- [ ] 과제 이관(`programs/[id]/projects`)은 대상 프로그램이 그 과제의 서비스를 운영할 때만 허용한다.
- [ ] `ProgramsTab` 은 켜진 서비스가 둘 이상일 때만 체크박스를 그린다. 하나면 화면이 지금과 같다.

#### Task 6 — BM 진입 화면 골격

신규: `components/platform/ServiceSwitch.tsx`, `app/bm/page.tsx`, `app/bm/[id]/layout.tsx`,
`app/bm/[id]/page.tsx`, `components/bm/BmShell.tsx`(상단 바·단계 레일·맥락 패널 틀), `lib/bm/worksheets.ts`,
`app/api/projects/[id]/bm/overview/route.ts`, `lib/bm/schemas.ts`. 접점: S7·S8.

- [ ] `/bm`: `GET /api/projects?service=bm` 목록과 "새 BM 과제". 멘티는 이름·설명만, 관리자·매니저는 BM 을 운영하는 프로그램과 그 멘티를 고른다.
- [ ] `/bm/[id]` 레이아웃은 서버 컴포넌트다. `isServiceEnabled('bm')` 이 아니면 `notFound()`.
- [ ] 과제 진입 화면은 BM-01 아이템 요약정리(Task 8)가 채운다. 이 Task 는 `Project` 공통 컬럼(`name`·`description`)과 소유자 프로필의 `companyName`(읽기 전용)만 읽어 상단 바와 빈 레일을 그린다. 과제 이름 변경 권한은 QFD 개요 라우트와 같은 기준(`write: true`).
- [ ] `app/project/[id]/layout.tsx`: 세션 쿠키가 유효하고 과제의 `serviceKey` 가 qfd 가 아니면 `redirect(projectPath(...))`. 세션이 없으면 조회하지 않는다.
- [ ] `ServiceSwitch`: 켜진 서비스가 하나면 `null`. 대시보드와 `/bm` 머리말에 둔다.
- [ ] 테스트: 플래그 off 에서 `/bm` 관련 라우트 전부 404, `ServiceSwitch` 가 아무것도 그리지 않는다.
- [ ] `npm run dev:local` 로 개설 → 개요 저장 → 재조회를 확인하고 화면 캡처를 보고서에 붙인다.

**M1 완료 시 로컬 병합까지 가능.** 플래그가 꺼져 있어 운영 동작은 같지만, main push 가 곧 운영 배포이므로 push 는 §9 의 순서(마이그레이션 선행)를 따른다.

### M2 — 판과 워크시트

각 Task 공통: 라우트는 `requireBmAccess` 를 쓴다. 조회 `write: false`, 저장 `write: true`. GET 은 쓰지
않는다. 판에 속한 표의 저장은 `rows-route.ts` 를 거치며, 대상 판이 최신이 아니거나 `FINAL` 이면 409 다.
화면은 `components/project/AssetsTable.tsx` 의 흐름(불러오기 실패 시 저장 차단, 과제 id 가 바뀌면 다시
불러오기)을 따르되, 입력이 멈춘 1초 뒤 자동 저장하고 상단 바에 저장 상태를 보인다. 각 Task 에
"멘토(배정)는 저장 가능, 매니저(미배정)는 조회만, 남의 멘티는 404, 지난 판은 409" 권한 테스트를 둔다.
화면 문구와 배치는 설계서 §4·§5 와 시안(Artifact "BM 고도화 워크스페이스")을 따른다.

#### Task 7 — 판 골격

신규: `lib/bm/versions.ts`, `lib/bm/rows-route.ts`, `versions/route.ts`, `versions/[n]/route.ts`,
`components/bm/VersionPicker.tsx`, `tests/bm-versions.test.ts`, `tests/bm-rows-route.test.ts`,
`tests/integration/bm-versions.integration.test.ts`.

```ts
// lib/bm/versions.ts
export type VersionStatus = 'DRAFT' | 'VALIDATING' | 'FINAL';
/** 허용되는 전이: DRAFT→VALIDATING, VALIDATING→FINAL, DRAFT→FINAL. FINAL 에서는 나가지 못한다. */
export function canTransition(from: VersionStatus, to: VersionStatus): boolean;
/** 새 판 만들기. 과제 행을 FOR UPDATE 로 잠근 뒤 최신 판의 소속 표를 전부 복사하고 직전 판을 FINAL 로 바꾼다. */
export async function createNextVersion(tx, projectId, input: { changeNote: string; basisHypothesisIds: string[]; createdById: string }): Promise<BmVersion>;
```

- [ ] 판 목록·상태 변경·새 판 만들기 라우트. `changeNote` 와 근거 가설 1개 이상이 없으면 400.
- [ ] 복사 대상 표 7개(가치 카드·가치제안서·캔버스 카드·점검 답·매출·원가·가정값)를 한 트랜잭션에서 복사한다. 가치 카드의 `fitTargetId` 는 새 id 로 다시 잇는다.
- [ ] `rows-route.ts`: 본문 id 보존 저장. 과제(또는 판) 범위 밖 id 는 무시하고 새로 만들지 않는다. 지워진 행 수·만든 행 수를 응답에 싣는다.
- [ ] `VersionPicker`: 판 번호·상태, 지난 판 선택 시 읽기 전용 띠.
- [ ] 통합 테스트: 새 판 만들기를 동시에 두 번 눌러도 판이 하나만 는다. 복사 뒤 두 판의 행 수가 같고 id 는 전부 다르다.

#### Task 8 — BM-01 아이템 요약정리, BM-03 목표고객·문제

신규: `lib/bm/segments.ts`(순수, 뮤테이션 100%), `item/route.ts`, `customers/route.ts`,
`components/bm/{ItemSummary,CustomerTable,SegmentDot}.tsx`.

- [ ] BM-01 은 `Project` 공통 컬럼(과제명·설명)과 `BmItemSummary` 를 한 화면에서 저장한다. 기업명은 소유자 `MemberProfile.companyName` 을 읽기 전용으로 보여주고 저장하지 않는다(§6.3 주석). 과제명 변경 권한은 QFD 개요 라우트와 같은 기준.
- [ ] BM-03 행 = 세그먼트. 저장 시 `colorIndex` 를 비어 있는 색 중 가장 작은 번호로 준다(순수 함수). 7번째 세그먼트부터는 색이 돈다.
- [ ] 출처는 다중 선택 체크(뉴스·일반인 면접·전문가 면접·연구·기타). 출처가 하나도 없는 행은 저장은 되지만 "근거 없음" 표시.
- [ ] 세그먼트 삭제 시 딸린 가치 카드·캔버스 카드 수를 화면이 먼저 알리고 확인받는다.
- [ ] 통합 테스트: 저장을 두 번 해도 세그먼트 id 가 유지되고 가치 카드가 남는다.

#### Task 9 — BM-05 가치제안 캔버스, BM-06 가치제안서

신규: `lib/bm/evidence.ts`, `lib/bm/value-statement.ts`(둘 다 순수, 뮤테이션 100%),
`versions/[n]/value/route.ts`, `versions/[n]/statement/route.ts`,
`components/bm/{ValueCanvas,Statement,EvidenceBadge}.tsx`.

- [ ] 세그먼트 탭으로 고객 프로필을 바꾼다. 6종 카드, 근거 배지 E0~E4.
- [ ] 적합 연결: 불만 해소 → 불만, 혜택 창출 → 혜택만 허용(순수 검증). 다른 조합은 400.
- [ ] 적합률 = 이어진 중요 불만·혜택 ÷ 전체. 이어지지 않은 불만은 "아직 풀지 않은 문제" 묶음.
- [ ] 저장 시 점검 문구 3가지(세그먼트 혼합·활동과 결과 혼동·기능적 활동만)를 규칙으로 판정해 알린다. 막지 않는다.
- [ ] BM-06 초안: ①제품명 ②세그먼트 ③가장 중요한 불만 ④제품 카드 ⑤기존 대안(비어 있으면 빈칸) ⑥미해소 불만 ⑦혜택. 사용자가 고친 슬롯은 다시 덮어쓰지 않는다(초안과 다른 슬롯 = 사용자 수정).

#### Task 10 — BM-07 비즈니스 모델 캔버스

신규: `lib/bm/canvas.ts`(순수, 뮤테이션 100%), `versions/[n]/canvas/route.ts`,
`components/bm/{CanvasBoard,CardBoard}.tsx`.

```ts
export const CANVAS_BLOCKS = ['KP','KA','KR','VP','CR','CH','CS','CO','RS'] as const;
export const BLOCK_GROUP: Record<CanvasBlock, 'front' | 'back' | 'number' | 'vp'>;
/** 두 판의 블록별 차이. 같은 문구는 유지, 한쪽에만 있으면 추가·삭제. 문구가 바뀐 카드는 삭제+추가로 본다. */
export function diffCanvas(previous: CanvasCard[], next: CanvasCard[]): Record<CanvasBlock, { added: CanvasCard[]; removed: CanvasCard[]; kept: CanvasCard[] }>;
```

- [ ] 실제 캔버스 배치(KP | KA·KR | VP | CR·CH | CS / CO | RS). 820px 이하에서는 블록 세로 쌓기.
- [ ] 카드 추가(더블클릭·`N`), `Enter` 저장, 드래그와 `Alt+↑↓` 로 순서·블록 이동. 키보드만으로 전부 가능해야 한다.
- [ ] 카드 메뉴: 세그먼트 색, 근거 수준, "가설로 표시"(Task 12 의 가설을 만들고 `hypothesisId` 를 건다).
- [ ] 오버레이 2종(그룹·변화). 위험·근거 오버레이는 v2.
- [ ] 세그먼트에 닿지 않는 VP 카드는 경고 표시(연결 기능은 v2 이므로 v1 은 세그먼트 색 유무로 판정).
- [ ] 테스트: `diffCanvas` 가 순서 변경만 있는 두 판을 "변화 없음"으로 본다.

#### Task 11 — BM-09 가능성 점검

신규: `lib/bm/checklist.ts`(문항 정본 + 점수, 순수, 뮤테이션 100%), `versions/[n]/check/route.ts`,
`components/bm/{Checklist,Radar}.tsx`.

- [ ] 문항은 강의 슬라이드 28·35·43·46·47·157 의 질문을 블록·4축(수용·실현·생존·적응)으로 분류해 코드 상수로 둔다. 문항 id 는 안정적이어야 한다(바꾸면 답이 고아가 된다).
- [ ] 점수 = 축별 예 ÷ (예+아니오) × 100. 모름은 분모에도 넣지 않는다. 답이 하나도 없는 축은 null.
- [ ] 블록 위험 = 그 블록 문항의 아니오 비율로 높음·보통·낮음(기준은 상수). 캔버스 위험 오버레이(v2)의 데이터원이다.
- [ ] 레이더에 직전 판 점수를 겹쳐 그린다. 축 라벨은 글자로, 색만으로 구분하지 않는다.
- [ ] 테스트: 모름만 있는 축이 0 이 아니라 null 로 나온다.

#### Task 12 — BM-11 가설·실험 보드

신규: `lib/bm/hypothesis.ts`(순수, 뮤테이션 100%), `hypotheses/route.ts`, `components/bm/HypothesisBoard.tsx`.

- [ ] 문장 틀: "우리는 ( )라고 믿는다" + 반증가설 자동 제안("…하지 않을 것이라고 믿는다") + 유형 + 출처 블록.
- [ ] 중요도(1~5) × 증거(0~4) 매트릭스. 사분면 판정은 순수 함수. 왼쪽 위(중요도 ≥ 4, 증거 ≤ 1)가 "먼저 검증".
- [ ] 상태 전이 `PLANNED → RUNNING → VALIDATED | INVALIDATED`. 입증·기각으로 바꿀 때 `observation` 과 `decision` 이 비면 400.
- [ ] 카드 넘기기(가설 → 실험 → 학습)는 한 행의 세 묶음이다.
- [ ] 가설은 판 밖이다. 만든 판(`originVersionId`)을 적고, Task 7 새 판 만들기에서 근거로 고르면 `supportsVersionId` 가 찍힌다.
- [ ] 기각된 가설 목록을 "다음 판의 근거 후보"로 판 선택기 옆에 노출한다(BM-13 마법사는 v2).

#### Task 13 — BM-12 Number(연 단위)

신규: `lib/bm/number.ts`(순수, 뮤테이션 100%), `versions/[n]/number/route.ts`,
`components/bm/NumberWorkbench.tsx`.

```ts
/** 입력이 비면 null. 화면은 null 을 0 이 아니라 '—' 로 그린다. 0 나눗셈은 null. */
export function revenueByYear(lines: RevenueLine[]): [number | null, number | null, number | null];   // Σ 수량 × 가격
export function costByGroup(lines: CostLine[]): Record<CostGroup, [number, number, number]>;
export function profitAndLoss(revenue, costs, assumption): PnlStatement;  // 매출총이익·판관비(급여+퇴직급여+복리후생+기타)·영업이익·법인세·당기순이익
export function breakEvenYear(pnl: PnlStatement): 1 | 2 | 3 | null;
```

- [ ] 세 하위 탭: 매출(아이템 × 거래처, 제품·상품·서비스 구분), 원가·판관비(원가 3종·급여·판관비), 손익(읽기 전용 계산 + 차트).
- [ ] 입력 칸과 계산 칸을 색으로 구분하고 계산 칸에 계산 방법을 말로 보여준다. 엑셀의 `#DIV/0!`·`#REF!` 류 오류가 화면에 나오지 않는다.
- [ ] 가정값 패널: 복리후생비율 슬라이더(5~12), 퇴직급여 1/12, 법인세 10%. 엑셀 비고란 규칙이 기본값.
- [ ] 결과 차트: 연도별 매출 막대 + 영업이익 선 + 손익분기 연도. 직전 판 영업이익 선을 흐리게 겹친다.
- [ ] 금액 입력은 `components/ui/MoneyInput`. 미입력과 0 을 구분한다.
- [ ] 테스트: 급여가 없으면 퇴직급여·복리후생비가 0 이 아니라 null 이고 손익 합계에서 빠진다. 법인세는 영업이익이 양수일 때만 붙는다.

#### Task 14 — BM-14 판 비교·개선 이력

신규: `history/route.ts`, `components/bm/VersionTimeline.tsx`.

- [ ] 타임라인: 판마다 상태·날짜·변경 사유·근거 가설·4축 점수(Task 11)·영업이익(Task 13).
- [ ] 두 판을 골라 캔버스를 나란히 두고 `diffCanvas`(Task 10) 결과를 블록별로 보여준다.
- [ ] 저장하는 것이 없다. 이 라우트는 GET 만 있다.

**M2 완료 시 로컬 병합까지 가능.** push 는 §9.

### M3 — 멘토링

#### Task 15 — 완성도, 다음에 할 일, 가이드 패널

신규: `lib/bm/completeness.ts`, `lib/bm/guide.ts`, `overview/route.ts`, `components/bm/BmShell.tsx`.

- [ ] 필수: BM-01(과제명·설명·목표고객), BM-03(행 1개 이상, 출처 있는 행 1개 이상), BM-05(세그먼트마다 고객 쪽 1 + 제안 쪽 1), BM-06(본문), BM-07(9블록 모두 1장 이상), BM-09(4축 모두 답 1개 이상), BM-12(매출 1행·원가 1행). 선택: BM-11.
- [ ] 완성도는 최신 판 기준. 결과는 QFD 의 `WorksheetCompletenessResult` 와 같은 모양이지만 BM 자체 타입이다(통합 대장 5).
- [ ] 단계 레일의 상태 점(빈칸·작성 중·완료)과 "다음에 할 일" 카드가 이 결과를 쓴다. 잠그지 않는다.
- [ ] 가이드 패널: 선택한 블록의 강의 질문 체크리스트(`guide.ts`). 체크는 브라우저에만 남기고 서버에 저장하지 않는다.

#### Task 16 — 워크시트 코멘트

`WorksheetComment` 테이블을 그대로 쓴다. `worksheetId` 는 `lib/bm/worksheets.ts` 의 id(`bm-` 접두라
QFD id 와 겹치지 않는다). 작성 권한은 원본과 같다: 관리자 또는 배정 멘토. v1 은 워크시트 단위 의견이고
카드 고정 의견은 v2 다.

- [ ] QFD 코멘트 라우트는 `bm-` id 를 거절하고, BM 라우트는 QFD id 를 거절한다.
- [ ] 맥락 패널 "의견" 탭에 현재 워크시트의 의견 수를 보인다.

#### Task 17 — 멘토 분석과 결과보고서 저장

신규: `lib/bm/mentor-analysis.ts`, `lib/bm/report-payload.ts`, `bm/report/route.ts`,
`components/bm/BmMentorAnalysis.tsx`.

- [ ] 분석은 워크시트별 `{ analysis: string }`(최대 20,000자, Markdown). `FinalReport.draft.worksheetAnalysis` 에 넣는다.
- [ ] 저장·완료·분석 저장의 **트랜잭션 블록을 원본에서 그대로 옮긴다**: 과제 행 잠금 → 배정 멘토 재확인 → 버전 비교(409) → 용량 한도(413).
- [ ] 완료본 조회 응답에 초안 내용을 섞지 않는다.
- [ ] 보고서는 **확정(FINAL) 판 또는 최신 판** 기준이며 어느 판인지 초안에 적는다.
- [ ] `tests/api-final-report.test.ts` 의 권한·버전·공개 범위 사례를 BM 라우트용으로 옮긴다. 빠뜨린 사례는 보고서 DEVIATIONS 에 적는다.
- [ ] 격리 DB 통합 테스트: 저장 도중 멘토 배정이 바뀌면 저장이 거절된다.

감리 표본: 원본 라우트와 나란히 놓고 잠금 순서와 권한 판정이 같은지 줄 단위로 대조한다.

### M4 — 결과보고서

#### Task 18 — 문서 빌더, 미리보기, DOCX

신규: `lib/bm/report-document.ts`(순수, 뮤테이션 100%), `app/bm/[id]/report/page.tsx`,
`bm/report/docx/route.ts`(필요 시).

- [ ] **먼저 확인한다:** `cover` 블록 없이 `heading` + `keyValueTable` 로 시작하는 문서가 `FinalReportPreview` 와 `renderFinalReportDocx` 에서 정상 렌더링되는가. 테스트로 확인하고, 안 되면 구현을 멈추고 보고한다. 기존 표지에는 `KS-QFD` 문구가 들어 있어 BM 문서에 쓸 수 없다.
- [ ] 순서: 과제 정보 표(판 번호·상태 포함) → 워크시트마다 `절 제목 → 멘토 분석 → 표`. QFD 보고서가 정한 순서와 같다.
- [ ] 분석문을 요약하거나 지어내지 않는다. 미입력은 미입력으로 표시한다.
- [ ] 캔버스는 9블록 표, 점검은 4축 점수 표, Number 는 손익계산서 표로 넣는다. 그림 캡처는 v1 에 넣지 않는다.
- [ ] 판 비교 절: 직전 판 대비 추가·삭제 카드 목록(`diffCanvas`). 1판뿐이면 절을 생략한다.
- [ ] 저장 문서는 `reportDocumentSchema` 를 통과해야 한다.

### M5 — 출시 준비

#### Task 19 — 경계, 회귀, 실기동

- [ ] `eslint.config.mjs`: `lib/bm/**`·`components/bm/**`·`app/bm/**`·`app/api/projects/*/bm/**` 가 §4 import 허용 목록 밖의 QFD 모듈을 가져오면 오류.
- [ ] 플래그 off 회귀 모음: BM 화면·API 전부 404, 대시보드·관리자 화면 렌더 결과가 기준선과 같다.
- [ ] 격리 DB 통합: 과제 삭제·멘티 계정 삭제 시 BM 11 개 테이블이 함께 지워진다. 과제 이관 후 새 소유자의 배정 멘토가 BM 과제를 연다.
- [ ] `npm run dev:local` 시나리오(계정은 Task 0 의 '개발 계정 준비 절차'로 만든다 — SMTP 가 없어 직접 계정 생성·초대 메일 발송 버튼은 쓰지 않는다): 관리자가 BM 프로그램 개설 → 초대 코드 발급(화면에서 복사) → 멘티 초대 로그인·온보딩 → 멘토 셀프 가입·관리자 승인·배정 → 멘티가 BM 과제 개설 → BM-01·03·05·06·07·09·11·12 작성 → 가설 기각을 근거로 2 판 고도화 → BM-14 비교 → 멘토 분석·코멘트 → 보고서 완료 → 멘티가 완료본 열람. 같은 계정으로 QFD 과제 흐름이 그대로인지도 본다.
- [ ] `npm run check:encoding` 과 `npm run build` 통과(§8 마일스톤 조건).
- [ ] `docs/superpowers/reports/2026-10-04-bm-service/task-deployment.md` 에 §9 절차와 되돌리는 방법을 적는다.

## 9. 운영 반영 순서

사실(2026-10-08 확인): main 에는 브랜치 보호가 없고 main push 는 곧 Vercel 운영 배포다. 브랜치 push 는 Preview 배포를 만들고, Preview 의
`POSTGRES_*` 는 운영 DB 와 같다(Vercel 인증으로 보호돼 익명 공개는 아니다). CI 는 main push·PR 에만 돈다. Dropbox 작업 디렉터리의
`prisma/migrations` 에는 origin/main 에 없는 미병합 마이그레이션 3개(`20260918000000_add_rate_limit_hits`, `20261002000000_project_company_name`,
`20261004000000_report_market_data_opt_in`)가 있어 거기서 운영 `migrate deploy` 를 돌리면 BM 것과 함께 들어간다.

0. **운영 반영 전용 체크아웃을 만든다.** 병합된 main 만 체크아웃한 Dropbox 밖 디렉터리(예: `E:\Dropbox\coding-1\business plan\codetest2-main`). `.env` 는 사용자가 손으로 운영 값을
   넣고 Claude 세션은 열지 않는다. Dropbox 디렉터리와 BM 디렉터리는 운영 반영에 쓰지 않는다(전자는 미병합 마이그레이션, 후자는 로컬 DB 가드).
1. **마이그레이션을 먼저 적용한다.** 그 디렉터리에서 `npx prisma migrate status` 의 미적용 목록이 **BM 마이그레이션뿐**임을 확인한 뒤
   `npx prisma migrate deploy`. 미병합 3개가 목록에 보이면 중단하고 결정 6 으로 돌아간다. 새 코드는 `projects.serviceKey` 를 읽으므로, 컬럼이
   없는 DB 에 코드를 먼저 올리면 QFD 라우트 전부가 500 이 된다. 반대 순서(컬럼 먼저)는 옛 코드에 영향이 없다.
2. **그 다음 main 에 push 한다(= 운영 배포).** 1 이 끝나기 전에는 push 하지 않는다. `NEXT_PUBLIC_ENABLED_SERVICES` 는 비워 둔다. 이 시점의 운영은
   지금과 같다. push 전에 로컬에서 `npm run check:encoding`·`npm run build` 를 통과했어야 한다(§8).
3. QFD 회귀를 실계정으로 확인한다.
4. Vercel 대시보드에서 `NEXT_PUBLIC_ENABLED_SERVICES=qfd,bm` 을 넣고 **Redeploy**(빌드 시점에 화면에 박히는 값이라 재배포가 필요하다).
5. 관리자가 BM 프로그램을 개설하고 시범 멘티를 초대한다.

feat/bm-service 의 push 시점: Task 3 이후의 코드는 Preview 에서 운영 DB 에 `serviceKey` 가 없는 동안 QFD 라우트가 500 이다. 정상이며 1 뒤
해소된다. Preview 에서 BM 화면 검증을 하지 않는다(검증은 §3.5 의 `dev:local` 로만). Preview 빌드 자체를 끄려면 결정 8 의 Ignored Build Step 을 쓴다.

되돌리기: 4 를 되돌리면 BM 이 닫힌다. BM 데이터는 남고 QFD 는 영향이 없다. 마이그레이션은 되돌리지 않는다(추가만 했으므로 남아 있어도 무해하다).

## 10. 사용자 결정

| # | 결정 | 상태 | 막는 Task |
| --- | --- | --- | --- |
| 1 | "독립"의 뜻 = §2 | **확정(2026-10-08)** | — |
| 2 | 작업 디렉터리: 독립 clone + 로컬 PostgreSQL 16 | **확정.** 경로는 `E:\Dropbox\coding-1\business plan\bm`(사용자 결정 2026-10-11, Dropbox 안·공백 포함 — §3.5 완화책 적용). worktree → clone 으로 구현 방식만 바꿈 | — |
| 3 | BM 디렉터리에 한해 `npm run dev:local`·`migrate:local` 허용(`CLAUDE.md` 예외) | **확정(2026-10-08).** 예외 문단은 Task 0 첫 커밋에 포함 | — |
| 4 | BM 워크시트 정본 | **확정(2026-10-08).** 사용자 강의 자료 기반 설계서 §3, 5단계 16워크시트 | — |
| 5 | v1 범위 | **확정(2026-10-08).** 설계서 §3.2 의 v1 10개 + 결과보고서. 카드 간 연결(VP↔CS)은 v2 로 분류했으니 이견이 있으면 알려 달라 | — |
| 6 | 기준선과 선병합 | **수정안 제안.** 기준선은 심볼 `origin/main`. 선병합은 **무충돌 브랜치만**: `codex/deploy-main-remediation`(main+1, `%TEMP%` worktree 에만 있어 유실 위험 — push 필요), 로컬 `codex/ws10-spec-link-20261003`(+2), `claude/funny-zhukovsky-6d8c2f`(RLS 마이그레이션+테스트, +2). `codex/login-role-validation`(origin/main 과 29파일 충돌, `Project.companyName` 포함)은 **선병합하지 않고** BM 은 그 컬럼에 의존하지 않게 설계했다(§6.3). 오래된 브랜치 3개(`admin-account-password-recovery`, `carp-inspection`, `vibrant-borg`)는 폐기 후보 | Task 0 (0.1) |
| 7 | 공개 저장소에 올릴 문서 내용 | **필요.** `cavinseo/codetest2` 는 public 이다. 설계서 §1 의 강의 자료 파일명·쪽수·슬라이드 대응표, 강의 질문 상수(`lib/bm/guide.ts`)를 그대로 push 해도 되는가. 안 되면 push 전 §1 을 "사용자 강의 자료(비공개) 기반" 한 줄로 줄이고 파일명·쪽수를 뺀다. 장기적으로 저장소 비공개 전환 여부(마이그레이션의 관리자 bcrypt 해시가 이미 공개돼 있다) | feat/bm-service 첫 push·M1 병합 |
| 8 | Vercel Preview | **필요.** 브랜치 push 마다 운영 DB 에 붙는 Preview 가 생긴다. (가) 그대로 두고 Preview 에서 검증하지 않는다(권장, 비용 0) (나) Vercel Settings → Git → Ignored Build Step 에 `if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then exit 0; fi; exit 1` 을 넣어 main 외 빌드를 끈다. Deployment Protection 은 끄지 않는다 | 첫 push |
| 9 | 브랜치 보호 | 선택. main 에 force-push 금지·PR 필수를 걸지. 지금은 없다 | — |

## 11. 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 서비스 가드 누락으로 BM 과제에 QFD 데이터가 써짐 | 기본값이 qfd 라 누락이 곧 차단이다. `requireProjectAccess` 를 거치지 않는 경로를 Task 3 에서 직접 확인 |
| 코드가 마이그레이션보다 먼저 배포됨 | §9 순서. 배포 보고서에 명시 |
| 새 테이블이 Supabase REST 로 노출됨 | 마이그레이션에 RLS 줄 + Task 2 테스트 |
| 보고서 라우트 복제가 원본과 어긋남 | 원본 테스트 이식 + 줄 단위 대조 + 통합 대장 1 번 |
| 병합 대기 브랜치와 접점 파일 충돌 | 결정 6. 접점은 선택 인자 추가라 충돌 범위가 좁다 |
| 개발 디렉터리에 운영 `.env` 가 들어옴 | `dev:local` 가드. `.env.local` 금지 |
| 워크시트 구성이 가안과 크게 다름 | M1 은 구성과 무관. M2 전에 Task C 로 고정 |
| `NEXT_PUBLIC_` 값은 빌드에 박힘 | 켜고 끌 때 재배포가 필요하다는 것을 배포 보고서에 적는다 |
| 세그먼트·카드 전체 교체 저장으로 참조 유실 | `rows-route.ts` 의 id 보존 저장(Task 7) + 세그먼트 통합 테스트(Task 8) |
| 실행 AI 세션이 Dropbox 디렉터리나 중첩 worktree 에서 열림 | 위임 프롬프트 첫 명령 `git rev-parse --show-toplevel`. worktree 격리 금지(§3.5). 감리 때 `git worktree list` 항목 수 비교 |
| 절대 경로로 Dropbox 의 쓰기 스크립트를 호출 | Prisma 클라이언트가 `.env` 를 클라이언트 위치 기준으로 읽는다. 쓰기 스크립트 5종 금지, 허용 3종은 BM 루트 상대 경로로만(§3.5) |
| `migrate dev` 가 가드 없이 실행됨 | `migrate:local` 래퍼(Task 1). Task 2 부터 그것만 쓴다 |
| 통합 테스트 DB 가 마이그레이션에 뒤처짐 | Task 0 절차를 마이그레이션이 늘 때마다 반복. 보고서 VERIFIED BY 에 재적용 여부 |
| 운영 `migrate deploy` 를 낡은 디렉터리에서 실행 | §9 0단계 전용 체크아웃. `migrate status` 미적용 목록이 BM 뿐일 때만 deploy |
| main push 가 곧 운영 배포 | §9 순서. 마일스톤 "병합 가능" 은 로컬 병합까지. push 전 `check:encoding`·`build` |
| 공개 저장소에 강의 자료 유래 내용·로컬 경로가 올라감 | 결정 7. push 전 설계서 §1 축약 |

## 12. 확인한 주요 코드

- `lib/authorization.ts`, `lib/project-creation-approval.ts`, `lib/bulk-worksheet-route.ts`, `lib/bulk-save-schemas.ts`
- `app/api/projects/route.ts`, `app/api/programs/route.ts`, `app/api/programs/[id]/projects/route.ts`
- `app/api/projects/[id]/report/route.ts`, `lib/final-report-payload.ts`, `lib/mentor-worksheet-analysis.ts`
- `app/api/projects/[id]/comments/route.ts`, `components/project/{WorksheetComments,MentorWorksheetAnalysis,AssetsTable,FinalReportPreview}.tsx`
- `prisma/migrations/20260911000000_final_report_publication/migration.sql`, `scripts/enable-supabase-rls.mjs`, `scripts/admin-recovery.mjs`
- `git` 상태: `origin/main`, worktree 목록, 작업 트리와 `origin/main` 의 차이
