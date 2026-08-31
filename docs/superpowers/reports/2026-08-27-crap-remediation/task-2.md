# Task 2 결과 보고서 — Node 버전 정렬로 뮤테이션 게이트 복구

## RESULT

`ci.yml` 을 Node 22 로 올리고 `package.json` 에 `engines` 를 명시했다.

StrykerJS 10 은 Node >= 22 를 요구하는데 `ci.yml` 이 20 이었다. 그래서
`npm run test:mutation` 은 프로젝트가 명시한 CI 환경에서 **한 번도 실행될 수 없었고**,
CLAUDE.md 가 신규 순수 모듈에 요구하는 뮤테이션 게이트도 그 환경에서는 성립하지
않았다. 실제 실패 메시지는 다음과 같았다.

```
Error: Node.js version v20.20.2 detected. StrykerJS requires version to match >=22.0.0.
```

Node 22 에서 `ci.yml` 의 전체 단계(`npm ci` → `prisma generate` → lint → tsc → test
→ build)가 통과하는 것을 확인했고, 같은 환경에서 뮤테이션이 16초 만에 완주했다.
즉 이 변경으로 게이트가 실제로 기동한다.

`engines` 를 함께 박은 이유는 로컬에서 Node 20 을 쓰면 설치 단계에서 드러나게 해,
같은 사고가 조용히 반복되지 않게 하려는 것이다.

## FILES CHANGED

- Modify: `.github/workflows/ci.yml` (`node-version: 20` → `22`, 이유 주석 2줄)
- Modify: `package.json` (`engines.node: ">=22"` 추가)

## COMMIT

- `b8d8ac8` — chore: CI 를 Node 22 로 올리고 engines 를 명시한다

## VERIFIED BY

측정 환경은 GitHub Actions `.github/workflows/phase1-verify.yml`
(run 33388101281, job 99475203811)이며, Task 2 가 바꾼 값과 같은 `node-version: 22`
로 돌려 `ci.yml` 의 단계들을 그대로 재현했다.

```
$ npx tsc --noEmit && echo "tsc OK"
tsc OK

$ npx vitest run
      Tests  1028 passed (1028)

$ npm run lint && echo "lint OK"
lint OK

$ npx next lint
✔ No ESLint warnings or errors

$ npm run build            # NODE_ENV=production, ci.yml 과 동일
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

$ npx stryker run stryker.crap.config.json --mutate lib/import-cascade-guard.ts
11:43:16 (4258) INFO MutationTestExecutor Done in 16 seconds.
```

DB 접속은 없었다. 더미 `POSTGRES_PRISMA_URL` 로 `prisma generate` 와 `next build` 만
수행했으며, 이는 기존 `ci.yml` 이 이미 하던 것과 같다.

## DEVIATIONS

1. **검증에 `npm run build` 를 추가했다.** 계획은 "확인하고 싶다면" 이라고 선택으로
   적었으나, CI 의 Node 버전을 바꾸는 변경이라 빌드까지 확인하는 편이 맞다고 판단했다.
2. **`ci.yml` 자체는 이 브랜치에서 실행되지 않았다.** `push: branches: [main]` 과
   `pull_request: branches: [main]` 에서만 돌기 때문이다. 대신 같은 단계를 같은 Node
   버전으로 재현해 검증했다. `ci.yml` 이 실제로 도는 것은 main 병합 또는 PR 생성
   시점에 확인된다.

## RISKS

`ci.yml` 을 브랜치에서 직접 돌려보지 못한 점이 남는다(DEVIATIONS 2). 다만 바뀐 것은
`node-version` 한 줄이고 그 값으로 전체 단계를 재현해 통과시켰으므로, 남은 위험은
워크플로 문법이 아니라 "값이 실제로 적용되는지"뿐이다.

## QUESTIONS

**`npx next lint` 가 폐기 예정이다.** 검증 중 다음 경고가 나왔다.

```
`next lint` is deprecated and will be removed in Next.js 16.
For existing projects, migrate to the ESLint CLI:
npx @next/codemod@canary next-lint-to-eslint-cli .
```

CLAUDE.md 의 검증 게이트는 `npx next lint` 를 명시하고 있어, Next 16 으로 올리면
게이트 명령 자체가 사라진다. `package.json` 의 `lint` 스크립트는 이미 `eslint .` 이고
`ci.yml` 도 `npm run lint` 를 쓰므로, **게이트 문구를 `npm run lint` 로 바꾸는 것이
자연스럽다.** 다만 CLAUDE.md 는 감리 규약이라 임의로 고치지 않았다. 판단을 요청한다.
