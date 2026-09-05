# 감리 하네스

감리 AI 가 **`node_modules` 없이** 이 저장소의 테스트를 돌리고, 회귀 그물을 역검증하고,
브라우저로 화면을 밟기 위한 도구다. `CLAUDE.md` 의 감리 규율과 `supervising-dual-ai-delivery`
스킬의 판정 레시피가 요구하는 "독립 재현"을 원격 컨테이너에서 가능하게 하는 것이 목적이다.

**개발자가 쓸 것이 아니다.** 일상 개발은 `npx vitest run`·`npx tsc --noEmit`·`npx next lint`
를 쓴다. 이 도구는 그 셋을 **대체하지 않고**, 그것들을 돌릴 수 없는 환경에서 판정 근거를
만드는 용도다.

## 왜 있나

감리 컨테이너는 npm 레지스트리가 막혀 `npm install` 이 안 된다. 그러면 게이트가 초록이라는
**보고서를 믿는 것 말고 할 수 있는 게 없어진다** — 스킬이 금지하는 바로 그 상태다.
이 하네스는 그 자리에 실행 가능한 근거를 놓는다.

## 쓰는 법

```sh
# 테스트 파일 하나
node --experimental-strip-types --import ./tools/supervisor/hook.mjs \
     ./tools/supervisor/run-test-file.mjs tests/api-kano-offline-responses.test.ts

# 전부 — 재현 가능한 범위를 잰다
node tools/supervisor/run-all-tests.mjs

# 회귀 그물 역검증(뮤테이션)
node tools/supervisor/mutate.mjs tools/supervisor/mutants/kano-offline-responses.json

# 브라우저 스모크(오프라인 Kano 설문)
node --experimental-strip-types --import ./tools/supervisor/hook.mjs \
     ./tools/supervisor/smoke/kano-offline-survey.mts
```

## 무엇이 있나

| 파일 | 하는 일 |
| --- | --- |
| `vitest-shim.mjs` | `describe`/`it`/`expect`/`vi` 의 최소 대체. 이 저장소 테스트가 쓰는 매처만 있다 |
| `resolver.mjs`·`hook.mjs` | `vitest`→셰임, 설치 불가 패키지→스텁, 확장자 없는 import 해석 |
| `stubs/` | `next/server`·`docx`·`@prisma/client` 스텁과 `lib/prisma`·`lib/authorization`·`lib/logger` 지연 전달자 |
| `run-test-file.mjs` | 테스트 파일 하나 실행 |
| `run-all-tests.mjs` | 전부 실행하고 **못 돌린 것까지 세어** 남는 몫을 드러낸다 |
| `mutate.mjs` | 소스에 변경을 하나씩 주입해 테스트가 잡는지 본다 |
| `mutants/` | 뮤턴트 정의(JSON). 한 파일이 한 판정의 근거가 된다 |
| `smoke/` | 실제 Chromium 으로 밟는 화면 검증 |

## 지금 재현되는 범위 (2026-09-04 측정)

```
돌아간 파일 53/104 · 전부 통과 52 · 일부 실패 1
테스트 621건 통과 / 622건 실행
```

실패 1건은 `tests/kano-offline-survey.test.ts` 의 `vi.doMock` + 모듈 리셋 케이스다.
ESM 은 평가된 모듈을 되돌릴 수 없어 셰임으로 흉내낼 방법이 없다 — **저장소의 실패가 아니라
이 도구의 한계**다.

못 돌린 51건은 전부 미설치 패키지다(zod 33·xlsx 8·bcryptjs 5·nodemailer 1·기타 4).

**zod 를 가짜로 만들면 33건이 초록이 된다. 하지 마라.** 그 테스트들이 시험하는 것이 바로
스키마 검증이라, 가짜 검증기 위의 초록은 아무것도 증명하지 않으면서 증명한 것처럼 보인다.
이 하네스의 값어치는 "돌아간 것"과 "못 돌린 것"을 섞지 않는 데 있다.

## 알아 둘 함정

- **로더 훅은 별도 스레드에서 돈다.** `resolve()` 안에서는 메인 스레드의 `globalThis` 가
  보이지 않는다 — `vi.mock` 레지스트리를 읽으려면 `stubs/lazy.mjs` 처럼 **모듈 본문**에서
  읽어야 한다. 이걸 모르면 "왜 mock 이 안 먹지"로 한참 헤맨다.
- **정적 import 는 `vi.mock` 보다 먼저 해석된다.** vitest 는 호이스팅으로 넘기지만 여기서는
  못 한다. 그래서 자주 mock 되는 모듈은 `resolver.mjs` 의 `LAZY` 에 지연 전달자로 올려 둔다.
  새 모듈이 필요하면 `stubs/authorization.mjs` 를 본떠 export 이름을 적고 `LAZY` 에 더한다.
- **셰임에 없는 매처는 조용히 실패한다** — `X is not a function` 으로 나온다. 저장소의 결함이
  아니니 매처를 채우고 다시 돌려라.
- `tests/` 밖이라 `vitest.config.ts` 의 `include: ['tests/**/*.test.ts']` 에 잡히지 않고,
  `.mjs`·`.mts` 라 `tsconfig.json` 의 `include: ["**/*.ts"]` 에도 잡히지 않는다. lint 는
  `eslint.config.mjs` 의 `ignores` 로 뺐다. **여기 `.ts` 파일을 두지 마라** — tsconfig 에
  걸린다.
- 전역 설치분(`playwright` 등)으로 떨어지는 경로가 있다. `SUPERVISOR_GLOBAL_MODULES` 로
  바꿀 수 있고, `node_modules` 가 있는 환경에서는 그 전에 정상 해석되므로 쓰이지 않는다.
