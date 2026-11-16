> **2026-10-11 이관됨.** 정본은 `E:\Dropbox\coding-1\business plan\bm`(브랜치 `feat/bm-service`, 커밋 `44c0745`)에 있다. 이 사본은 더 고치지 않는다.

# 위임 프롬프트 — BM Task 1 (서비스 레지스트리, 활성 플래그, 로컬 DB 가드)

감리자가 발행한다. 세션 착수 프롬프트(`session-start.md`)의 요약 관문을 통과한 뒤 준다. 아래
코드블록 안이 실행 AI 에게 그대로 주는 프롬프트다.

```
[역할]
너는 codetest2(KS-QFD 웹앱)의 기능 개발 담당 엔지니어다. 이번 작업은 BM 서비스 구축의 Task 1 —
순수 모듈 2개(서비스 레지스트리, BM 워크시트 목록)와 로컬 DB 가드 스크립트 1개, 설정 3곳을
만드는 것이다. 화면·라우트·스키마는 이번 범위가 아니다.

먼저 정독하라(이번 작업의 근거 문서다):
- docs/superpowers/plans/2026-10-04-bm-service.md 의 Task 1 절과 §6.1, §7   ← 정본
- docs/superpowers/specs/2026-10-08-bm-worksheets-ux-design.md 의 §3      ← 워크시트 이름·단계
계획서와 이 프롬프트가 어긋나면 이 프롬프트가 이긴다.

[배경 — 검증된 사실이니 재조사하지 마라]
감리자가 origin/main 의 코드를 직접 읽고 확정한 좌표다. grep 으로 다시 확인하지 말고 이대로 써라.

1. 플래그 선례 — lib/feature-flags.ts:1-10. 상수 하나를 화면과 라우트가 같이 읽어 "반쯤 열린
   상태"를 막는 패턴이다. 이번 레지스트리는 같은 목적이지만 **상수 대신 환경변수**를 읽는다
   (이유: 병합이 곧 출시가 되지 않게). 테스트 선례는 tests/feature-flags.test.ts.
2. 키 파싱 선례 — lib/member-roles.ts:12 의 `MEMBER_ROLES = [...] as const` 와 48-50 의
   `parseMemberRole`(`includes(value as …)` 패턴). 레지스트리의 SERVICE_KEYS·parseServiceKey 는
   이 모양을 그대로 따른다.
3. 가드 스크립트가 재사용할 함수 — scripts/admin-recovery.mjs:16-24 `loadEnvFileIfPresent()`
   (process.loadEnvFile 로 .env 를 읽되 **셸에 이미 있는 값이 우선**한다), 135-143
   `describeDatabase(url)` (비밀번호를 지우고 `host[:port]/path` 만 돌려준다). 둘 다 export 돼 있다.
   Node 는 v24 라 process.loadEnvFile 이 있다.
4. .mjs 스크립트를 vitest 로 테스트하는 선례 — tests/db-migration-models.test.ts:4-8 이
   `../scripts/db-migration-models.mjs` 를 import 한다. 가드의 판정 함수도 같은 방식으로 테스트한다.
5. package.json:5-19 의 scripts. `dev` 는 `next dev --turbopack` 이다. 새 스크립트는 여기에 더한다.
6. stryker.crap.config.json:11-39 의 mutate 배열. lib/feature-flags.ts 가 이미 들어 있다.
7. vitest.config.ts:17 — 테스트는 tests/**/*.test.ts 만 수집한다. 테스트 파일은 tests/ 평면에 둔다.
8. scripts/check-text-encoding.mjs 는 app·components·lib·prisma·tests 만 검사한다(scripts 는 제외).
   그래도 새 .mjs 의 한국어 주석은 UTF-8 로 쓴다.
9. .env.example 은 origin/main 에 추적돼 있고, .env 와 .env.local 은 .gitignore 에 있다.
10. Next.js 는 `process.env.NEXT_PUBLIC_…` 를 **그 이름 그대로 코드에 적었을 때만** 클라이언트
    번들에 박는다. `process.env[name]` 처럼 동적으로 읽으면 브라우저에서 undefined 다.
11. lib/worksheet-pages.ts 는 QFD 메뉴의 정본이다. 이번 작업에서 **건드리지 않는다**.

[용어·규칙]
- 들여쓰기 4칸. 주석은 한국어 "~다" 체이고 무엇을 하는지가 아니라 **왜** 그런지를 쓴다.
- 새 소스 파일 첫 줄에 한국어 한 줄 역할 주석(.mjs 도 같다).
- 테스트는 tests/ 평면 배치. 이번 모듈은 순수라 Prisma mock 이 필요 없다.
- 키·비밀번호·접속 문자열을 로그·출력·보고서에 남기지 않는다. 가드는 호스트 이름만 찍는다.
- 커밋 메시지는 한국어, 본문에 "왜". 트레일러는 CLAUDE.md 의 것.

[확정된 계약 — 감리자 승인, 이 결정을 따르라]
1. 서비스 키는 `['qfd', 'bm']` 두 개뿐이다. `item` 은 넣지 않는다.
2. 활성 여부는 환경변수 `NEXT_PUBLIC_ENABLED_SERVICES`(쉼표 구분) 하나로 정한다. **qfd 는 끌 수
   없다** — 값이 비거나 오타여도 qfd 는 켜져 있다. 모르는 키는 버린다. 대소문자·공백은 무시한다.
3. 레지스트리 API 는 계획서 Task 1 의 시그니처 그대로다:
   SERVICE_KEYS, ServiceKey, DEFAULT_SERVICE('qfd'), SERVICES(label·shortLabel·basePath),
   parseServiceKey, enabledServiceKeys(raw = process.env.NEXT_PUBLIC_ENABLED_SERVICES),
   isServiceEnabled(key, raw?), projectPath(key, id), programOffersService(program, key).
   SERVICES.qfd = { label: 'KS-QFD', shortLabel: 'QFD', basePath: '/project' },
   SERVICES.bm  = { label: '비즈니스 모델 개발·고도화', shortLabel: 'BM', basePath: '/bm' }.
4. lib/bm/worksheets.ts 는 v1 워크시트 9개를 아래 순서·값으로 export 한다(`BM_WORKSHEETS as const`).
   필드: id, href(과제 경로 뒤에 붙는 조각, 개요는 ''), label, phase(1~5), inVersion(boolean).
     bm-item        ''           BM-01 아이템 요약정리        phase 1  inVersion false
     bm-customers   'customers'  BM-03 목표고객·문제          phase 1  inVersion false
     bm-value       'value'      BM-05 가치제안 캔버스        phase 2  inVersion true
     bm-statement   'statement'  BM-06 가치제안서            phase 2  inVersion true
     bm-canvas      'canvas'     BM-07 비즈니스 모델 캔버스    phase 3  inVersion true
     bm-check       'check'      BM-09 가능성 점검            phase 4  inVersion true
     bm-hypotheses  'hypotheses' BM-11 가설·실험 보드         phase 4  inVersion false
     bm-number      'number'     BM-12 Number 추정손익        phase 4  inVersion true
     bm-history     'history'    BM-14 판 비교·개선 이력       phase 5  inVersion false
   단계 이름 상수 BM_PHASES: 1 아이템 정리, 2 가치 설계, 3 모델 설계, 4 검토·검증, 5 고도화.
   결과보고서(report)는 워크시트가 아니므로 이 목록에 넣지 않는다.
5. 가드 스크립트 scripts/assert-local-db.mjs 의 규칙:
   - 판정 함수 `assessLocalDbEnv({ urls, extraEnvFiles })` 를 export 한다. `urls` 는
     `{ POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING, DATABASE_URL?, INTEGRATION_DATABASE_URL? }` 의 **최종 process.env 값**
     (loadEnvFileIfPresent() 뒤의 값. 셸·인라인 값이 .env 를 이긴다 — 그래서 파일이 아니라 process.env 를 판정한다),
     `extraEnvFiles` 는 `.env.example` 을 제외한 `.env.*` 와 `prisma/.env` 중 존재하는 파일 이름 목록이다.
     반환 `{ ok: boolean, reasons: string[], hosts: string[] }`. 접속 문자열 원문·사용자명·비밀번호는 반환·출력하지 않는다.
   - 거부 조건(하나라도 참이면 ok=false): extraEnvFiles 가 비어 있지 않음(파일 이름을 reasons 에) /
     POSTGRES_PRISMA_URL·POSTGRES_URL_NON_POOLING 중 하나라도 비어 있음 / 어느 URL 이든 파싱 실패 /
     설정된 URL 들의 호스트가 `localhost`·`127.0.0.1`·`::1`·`[::1]` 밖(DATABASE_URL·INTEGRATION_DATABASE_URL 은
     설정돼 있을 때만 검사한다).
   - 실행부는 loadEnvFileIfPresent() → 파일 존재 조사 → 판정 → ok 면 호스트만 출력하고 종료 코드 0, 아니면 이유와
     호스트만 출력하고 종료 코드 1. 어떤 경우에도 DB 에 접속하지 않는다. 호스트 표시는 describeDatabase 를 쓴다.
6. package.json 에 두 스크립트를 더한다. 기존 `dev` 는 그대로 둔다.
     "dev:local": "node scripts/assert-local-db.mjs && next dev --turbopack"
     "migrate:local": "node scripts/assert-local-db.mjs && prisma migrate"
   `migrate:local` 은 `npm run migrate:local -- dev --create-only` 처럼 하위 명령을 뒤에 받는다.
7. .env.example 에 NEXT_PUBLIC_ENABLED_SERVICES 설명 블록을 더한다(기본은 비움 = qfd 만, 예: `qfd,bm`,
   빌드 시점에 화면에 박히므로 바꾸면 재배포). INTEGRATION_DATABASE_URL 설명은 이미 있으니 손대지 않는다.
8. 스키마·라우트·화면은 이번 범위가 아니다. 계획서 §4 의 접점 S2~S8 도 이번에 건드리지 않는다.
지시와 기존 계약이 충돌하면: 기존 계약을 따르고 이유를 보고하라.

[작업 내용]
A. lib/services/registry.ts (순수)
   계획서 Task 1 의 코드 스니펫이 정본이다. 그대로 구현하되 `enabledServiceKeys` 의 raw 기본값은
   [배경] 10번 때문에 반드시 `process.env.NEXT_PUBLIC_ENABLED_SERVICES` 를 글자 그대로 적는다.
B. lib/bm/worksheets.ts (순수)
   [확정된 계약] 4번의 표를 그대로. 보조 함수 `findBmWorksheet(id)` 와 `bmWorksheetPath(projectId, id)`
   (`/bm/<projectId>` 또는 `/bm/<projectId>/<href>`)를 export 한다.
C. scripts/assert-local-db.mjs + package.json dev:local·migrate:local
   [확정된 계약] 5·6번. 판정 함수와 실행부를 분리해 판정 함수만 테스트한다(선례 [배경] 3·4번).
D. .env.example 갱신([확정된 계약] 7번).
E. stryker.crap.config.json 의 mutate 배열에 lib/services/registry.ts 를 추가한다.
   lib/bm/worksheets.ts 는 상수표라 뮤테이션 대상에 넣지 않는다(라벨 문자열 뮤턴트가 테스트를
   라벨 복사본으로 만든다). 대신 구조 테스트로 고정한다(아래).
F. 계획서 Task 1 의 Step 체크박스를 [x] 로 갱신한다.

[환경]
- 여기는 독립 디렉터리(E:\Dropbox\coding-1\business plan\bm)이고 .env 는 로컬 DB 만 가리킨다. 이번 작업은 DB 를
  건드릴 일이 없다. 건드려야 할 것 같으면 설계가 틀린 것이니 중단하라.
- 게이트: npx tsc --noEmit && npx vitest run && npx next lint
- 뮤테이션: npx stryker run stryker.crap.config.json --mutate lib/services/registry.ts
  등가 뮤턴트는 테스트를 비틀지 말고 `// Stryker disable next-line <Mutator>: <이유>` 로 제외한다.
  이유 없는 disable 금지. disable 뒤에는 총 뮤턴트 수가 몇 개 줄었는지 세어 의도와 맞는지 확인하고,
  어긋나면 보고서에 적어라(한 줄에 같은 뮤테이터의 뮤턴트가 둘이면 둘 다 빠진다).
- dev 서버는 이번 작업에 필요 없다. 띄우지 마라. 가드 스크립트는 단독으로 실행해 확인한다.

[브랜치·커밋]
- 브랜치 feat/bm-service, 기준선은 Task 0 보고서의 커밋({Task 0 보고서의 해시}). `git log --oneline -3`
  으로 첫 커밋이 "docs: BM 계획 문서 반입" 류의 Task 0 커밋인지 확인하고, 아니면 멈추고 보고하라.
- 수정 허용 파일: lib/services/registry.ts, lib/bm/worksheets.ts, scripts/assert-local-db.mjs,
  package.json(scripts 블록만), .env.example, stryker.crap.config.json(mutate 배열만),
  tests/services-registry.test.ts, tests/bm-worksheets.test.ts, tests/assert-local-db.test.ts,
  docs/superpowers/plans/2026-10-04-bm-service.md(체크박스만).
- 건드리지 마라: prisma/**, app/**, components/**, lib/ 의 다른 파일(특히 lib/feature-flags.ts,
  lib/worksheet-pages.ts, lib/member-roles.ts), CLAUDE.md, .claude/**, .env.
- push·브랜치 이동·reset·`git pull` 금지(`git fetch origin` 만). 완결 단위마다 즉시 커밋하라.
- 첫 명령: `git rev-parse --show-toplevel` 과 `git branch --show-current`. 출력이 `E:/Dropbox/coding-1/business plan/bm`·`feat/bm-service` 가
  아니면 중단·보고. 그 출력을 보고서 VERIFIED BY 에 담아라.

[작업 방식]
RED → GREEN: 실패하는 테스트를 먼저 작성하라.
- tests/services-registry.test.ts 최소 항목:
  · SERVICE_KEYS 가 정확히 ['qfd','bm'] 이고 DEFAULT_SERVICE 가 'qfd'
  · parseServiceKey: 'qfd'·'bm' 통과, 'item'·''·null·'QFD' 거부(대소문자 구분)
  · enabledServiceKeys: undefined → ['qfd'], '' → ['qfd'], 'bm' → ['qfd','bm'],
    ' BM , qfd ' → ['qfd','bm'], 'item,xyz' → ['qfd'], 'qfd' 만 → ['qfd']
  · isServiceEnabled('bm', 'qfd') false, isServiceEnabled('qfd', '') true
  · projectPath('bm','p1') === '/bm/p1', projectPath('qfd','p1') === '/project/p1'
  · programOffersService({services:['qfd']}, 'bm') false, (['qfd','bm'], 'bm') true, ([], 'qfd') false
- tests/bm-worksheets.test.ts 최소 항목:
  · id 9개가 전부 'bm-' 로 시작하고 중복이 없다 · href 중복 없음, 개요만 '' · phase 가 1~5 안이고
    단계 순서대로 비내림차순 · inVersion true 인 것이 정확히 value·statement·canvas·check·number
  · bmWorksheetPath('p1','bm-item') === '/bm/p1', bmWorksheetPath('p1','bm-canvas') === '/bm/p1/canvas'
- tests/assert-local-db.test.ts 최소 항목(판정 함수만):
  · localhost·127.0.0.1·::1 의 두 URL → ok
  · 한쪽이 원격 호스트(예: db.example.supabase.co) → ok=false, reasons 에 원격 호스트 사유,
    hosts 에 호스트만 있고 비밀번호·사용자명이 어디에도 없다
  · extraEnvFiles 에 '.env.local' 또는 '.env.development.local' 또는 'prisma/.env' → ok=false, reasons 에 그 이름
  · DATABASE_URL 만 원격 → ok=false · INTEGRATION_DATABASE_URL 이 127.0.0.1 → ok
  · 한쪽 URL 비어 있음 → ok=false · 파싱 불가 문자열 → ok=false
- 무회귀: 기존 테스트를 하나도 수정·skip·삭제하지 마라. `npx vitest run` 전체가 지금도 그린이고
  작업 후에도 그린이어야 한다.

[Ask First — 다음이 필요해지면 중단하고 보고하라]
- 스키마·라우트·화면을 고쳐야 할 때(이번 범위가 아니다)
- [확정된 계약]의 이름·값·순서를 바꾸고 싶을 때(바꾸지 말고 보고하라)
- 새 npm 패키지가 필요할 때(이번 Task 는 의존성 0개다)
- 기존 테스트가 깨질 때
- 등가 뮤턴트가 아닌데 stryker 100% 가 안 나올 때
- 기준선 커밋이 Task 0 보고서와 다를 때

[완료 판정 — 전부 만족해야 완료]
1. `npx tsc --noEmit` 오류 0.
2. `npx vitest run` 전체 통과. 기존 테스트 파일 수정·skip·삭제 0건.
3. `npx next lint` 오류 0.
4. `npx stryker run stryker.crap.config.json --mutate lib/services/registry.ts` 가 mutation score 100%.
5. lib/services/registry.ts 가 stryker.crap.config.json 의 mutate 배열에 들어 있다.
6. 이 디렉터리에서 `node scripts/assert-local-db.mjs` 를 실제로 1회 실행해 종료 코드 0 이고, 출력에
   `localhost` 또는 `127.0.0.1` 호스트만 있으며 비밀번호·사용자명·전체 URL 이 없다.
7. `POSTGRES_PRISMA_URL=postgresql://u:p@db.example.com:5432/x node scripts/assert-local-db.mjs` 를
   실행하면 종료 코드 1 이고 출력에 `db.example.com` 은 있되 `u:p` 는 없다(셸 값이 .env 보다 우선하는
   [배경] 3번 성질을 쓴 음성 시험이다. DB 에 접속하지 않는다).
8. package.json 에 `dev:local` 과 `migrate:local` 이 있고 `dev` 는 바뀌지 않았다.
9. `git diff --name-only <기준선>..HEAD` 가 [브랜치·커밋]의 수정 허용 파일 10개 안에 국한된다.
10. lib/services/registry.ts 의 enabledServiceKeys 기본값 식에 `process.env.NEXT_PUBLIC_ENABLED_SERVICES`
    가 글자 그대로 들어 있다.
11. 계획서 Task 1 의 Step 체크박스가 [x] 로 갱신돼 작업 커밋에 포함됐다.
12. 두 번의 커밋 후 `git status` 가 깨끗하다. push 하지 않았다.

[산출물·보고]
- 코드 + 테스트 + 설정 + 계획서 체크박스 갱신(커밋 완료 상태)
- 보고서 작성: docs/superpowers/reports/2026-10-04-bm-service/task-1.md
  형식은 RESULT / FILES CHANGED / COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS.
  **작업 커밋과 별도의 둘째 커밋**으로 남긴다(커밋 메시지: `docs: Task 1 결과 보고서`).
  - VERIFIED BY 에는 완료 판정 1~7번 각각의 **실행 명령과 출력 마지막 줄을 원문으로** 담아라.
    stryker 는 점수와 총 뮤턴트 수를 적어라. 6·7번 출력은 호스트만 남기고 그대로 붙여라.
  - DEVIATIONS 에는 지시와 다르게 처리한 것과 그 이유를.
  - RISKS 에는 검증하지 못한 것을 적어라. 하지 않은 것을 했다고 쓰지 마라.
```

---

## 감리자 메모 (프롬프트에 넣지 않는다)

이 프롬프트 발행 전에 감리자가 끝낸 사전 조사(2026-10-08, origin/main 42a942e 기준):

- 좌표 확정: [배경] 11개 항목을 `git show origin/main:<파일>` 로 직접 읽어 확인했다. 작업
  디렉터리(E:\Dropbox\codetest2)가 아니라 origin/main 을 본 이유는 실행 AI 의 기준선이 origin/main
  이기 때문이다. 특히 (3) admin-recovery.mjs 의 `describeDatabase` 가 비밀번호를 지우는 함수로
  이미 있어 가드가 새 파싱 코드를 쓰지 않게 했고, (10) NEXT_PUBLIC 동적 참조 함정을 계약 10번
  완료 판정으로 못 박았다.
- 공유 자원: migration·시나리오 번호 없음. 기준선 해시는 Task 0 보고서 값으로 치환해 발행한다.
- 결정권 경계: [확정된 계약] 8개. 워크시트 표(4번)는 설계서 §3 과 계획서 §6.1 을 합친 확정값이라
  실행 AI 가 라벨·순서를 바꾸면 안 된다. lib/bm/worksheets.ts 를 mutate 에서 뺀 것은 감리자 결정이다
  (상수표의 StringLiteral 뮤턴트는 테스트를 라벨 복사본으로 만든다).
- 완료 판정 12개 전부 제3자가 참/거짓 판정 가능하게 썼다. 6·7번이 "신설 실행물 1회 실행"이다.

수령 후 판정 순서(스킬의 레시피대로):
1. 경계 확인 — diff 가 10개 파일에 국한되는지, 기존 테스트 약화·stryker 설정 변조가 없는지.
   package.json 의 scripts 블록 외 변경이 없는지. **게이트 재실행보다 먼저.**
2. 표본 대조 — ① enabledServiceKeys 가 qfd 를 절대 빼지 않는지(코드로) ② NEXT_PUBLIC 글자 그대로
   참조 ③ 가드가 URL 원문을 어디에도 출력하지 않는지(console.* 전수) ④ worksheets 표의 inVersion
   5개 ⑤ dev 스크립트 불변.
3. 회귀 역검증 — 해당 없음(신규 모듈). 대신 stryker 를 감리자가 재실행한다.
4. 게이트 직접 재실행 — 보고된 출력을 쓰지 않는다.
5. 신설 실행물 — 감리자가 BM 디렉터리에서 `node scripts/assert-local-db.mjs` 를 직접 실행하고,
   원격 호스트 음성 시험(완료 판정 7)도 직접 재현한다. 그 다음에야 `npm run dev:local` 을 감리자가
   한 번 띄워 가드 통과 → next dev 기동까지 본다(Task 1 완료 판정이 아니라 Task 6 검증 준비다).
6. 화면 검증 — Task 1 에는 UI 가 없다.
