# codetest2 감리(수퍼바이저) 프로필

이 파일은 **감리 AI(Claude Code)** 용이다. 감리 작업(위임 프롬프트 작성, 완료 보고
검증, 병합)을 할 때는 `supervising-dual-ai-delivery` 스킬을 사용하고, 아래 프로젝트
값을 그 스킬의 자리에 채워 넣는다. 실행 AI(코딩)는 계획서(`docs/superpowers/plans/`)와
`AGENTS.md`를 따른다.

## 검증 게이트 (스킬의 "게이트" 자리)

```sh
npx tsc --noEmit && npx vitest run && npx next lint
```

- 신규 순수 모듈에는 `npx stryker run stryker.crap.config.json --mutate <파일>`을
  추가로 요구할 수 있다 — mutation score 100%가 기준.

## ⚠️ 최우선 환경 제약 — 원격 실DB

`.env`의 `POSTGRES_PRISMA_URL`은 **실데이터가 있는 원격 Supabase**다.

- **절대 금지**: `prisma migrate deploy`/`db push`/`studio`, DB에 쓰는 스크립트,
  **dev 서버 기동**(신설 API 라우트라도 dev 서버로 실기동 검증하지 않는다).
- **안전**: `npx prisma validate`, `npx prisma generate`.
- 화면·API 실기동 검증이 필요하면 감리자가 직접 수행하거나, 사용자의 실계정으로
  검증하는 단계로 명시적으로 이월한다. 실행 AI에게 위임하지 않는다.
- `npx prisma generate`가 `EPERM ... query_engine-windows.dll.node`로 실패하면
  dev 서버가 DLL을 잠근 것이다. 직접 죽이지 말고 **중단·보고** — 감리자가 서버를 내린다.

## 계획서 관례

- 신규 기능은 `docs/superpowers/plans/<날짜>-<슬러그>.md`에 Task 단위 계획서를 먼저
  커밋한다(예: `2026-08-25-personal-ai-keys.md`). 계획서가 각 Task의 정본이며 코드
  스니펫까지 담는다 — 위임 프롬프트는 이 계획서 절을 감싸는 형태로 작성한다.
- 계획서는 체크박스(`- [ ]`)로 Step을 추적한다. 완료 시 `- [x]`로 갱신해 코드와
  함께 커밋한다.
- 각 Task 완료 기준: `npx tsc --noEmit` 통과 + `npx vitest run` 전체 통과 +
  (해당 시) `npx next lint` 통과.

## 저장소 관례

- 커밋 메시지는 한국어, 본문에 "왜"를 적는다. 트레일러: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 들여쓰기 4칸, 주석은 한국어 "~다" 체(이유 중심 — 무엇을 하는지가 아니라 왜 그런지).
- 테스트는 `tests/` 평면 배치, Prisma는 `vi.mock('../lib/prisma', ...)`로 전부 mock.
- **키·비밀번호·이메일을 로그·응답 본문에 남기지 않는다**(`lib/logger.ts` 규칙) —
  API 키를 다루는 Task는 이것이 1순위 판정 표본이다.
- 브랜치 전략 미확정 — 현재는 단일 브랜치에 연속 커밋, push는 사용자 지시 시에만.
