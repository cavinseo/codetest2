# Task A 결과 보고서 — WS-2 초기화 결함 + zod 검증

## RESULT

**"지웠다고 말해 놓고 지우지 않던" 상태를 없앴다.** 그리고 그것을 고치면서 생기는 더
나쁜 결함을 같은 커밋에서 막았다.

| 항목 | 이전 | 이후 |
| --- | --- | --- |
| 빈 배열 POST | 조기 반환, `deleteMany` 미실행 | **트랜잭션 실행, 실제로 비운다** |
| 화면 vs DB | 화면만 비고 새로고침하면 되살아남 | 일치 |
| 본문 검증 | **없음**(`body.specFunctions \|\| []`) | `specBodySchema.parse` |
| 배열이 아닌 본문 | `[]` 로 강등 → (수정 후라면) 전량 삭제 | **400, 아무것도 지우지 않음** |
| `level` 값 | 무검증 | `CORE/SUB/DETAIL` 화이트리스트 |
| 행수 상한 | 없음 | 2000 |
| 라우트 테스트 | **0건** | 12건 |

### 두 변경을 한 커밋에 넣은 이유

조기 반환만 걷어내면 지금보다 나빠진다. spec 라우트는 저장소에서 유일하게 zod 가 없어
`body.specFunctions || []` 가 잘못된 본문을 조용히 `[]` 로 강등시켰다. 조기 반환이
없어진 뒤에는 **그 강등이 곧 전량 삭제**다.

이 사고는 이 저장소에서 이미 한 번 났고, `app/api/projects/[id]/improvements/route.ts:46-47`
에 흔적이 주석으로 남아 있다.

> 예전에는 items 가 배열이 아니면 조용히 [] 로 강등돼, 오타 난 바디 하나로
> 개선포인트가 통째로 지워지고도 200 이 나갔다. 이제는 400 으로 막는다.

### `name` 에 `min(1)` 을 걸어도 안전한 근거

`SpecTable.serializeSpecs`(`components/project/SpecTable.tsx:625-690`)를 읽고 확인했다.
`:639` 에서 core 가 빈 행을 건너뛰고, `:653`·`:674` 에서 빈 sub·detail 은 아예 push 하지
않는다. 빈 이름이 만들어지는 경로가 없다.

## FILES CHANGED

- Modify: `lib/bulk-save-schemas.ts` (`specFunctionRowSchema`·`specBodySchema`·`SpecFunctionRow` 추가)
- Modify: `app/api/projects/[id]/spec/route.ts` (조기 반환 제거, zod 파싱, zod 400 분기)
- Add: `tests/api-spec-save.test.ts` (12건)

## COMMIT

- `85339a0` — fix: 워크시트 저장 결함 셋 (Task A·B·C)

Task A·B·C 를 한 커밋에 묶었다. 셋 다 "화면은 성공했다고 말하는데 데이터는 다르게
남는" 같은 종류이고, 서로 다른 파일을 건드려 충돌이 없다.

## VERIFIED BY

로컬에 `node_modules` 가 없어(조직 egress 정책이 npm 레지스트리를 막는다) 게이트를
GitHub Actions 에서 돌렸다. 임시 워크플로 `.github/workflows/gate-verify.yml`,
run 33459364656 / job 99706076947, 커밋 `85339a0`.

```
$ npx tsc --noEmit
(출력 없음, exit 0)

$ npx vitest run --pool=threads
 Test Files  94 passed (94)
      Tests  1084 passed (1084)
   Duration  10.08s

$ npm run lint
> eslint .
(출력 없음, exit 0)

$ npx prisma validate
The schema at prisma/schema.prisma is valid 🚀
```

직전 기준선은 1054 tests / 93 files(2026-08-27 CRAP 계획 Task 8 실측)였다.
Task A·B·C 합계로 **+30 tests / +1 file**.

새 테스트 12건이 단언하는 것:

```
스펙 저장 — 초기화가 실제로 지운다
  빈 배열을 보내면 deleteMany 가 실행된다
  빈 배열 응답은 200 이고 specFunctions 가 비어 있다
스펙 저장 — 잘못된 본문은 아무것도 지우지 않는다
  specFunctions 가 배열이 아니면 400 이고 deleteMany 를 부르지 않는다
  specFunctions 키가 없으면 400 이고 deleteMany 를 부르지 않는다
  level 이 화이트리스트 밖이면 400 이다
  name 이 빈 문자열이면 400 이다
  행수 상한을 넘으면 400 이다
  검증 실패 응답은 어느 항목이 문제인지 알려준다
스펙 저장 — 계층 재매핑
  CORE → SUB → DETAIL 순으로 저장하고 parentId 를 실제 id 로 바꾼다
  임시 id 는 저장하지 않는다
  클라이언트가 보낸 임의 필드는 저장되지 않는다
스펙 저장 — 접근 제어
  권한이 없으면 403 이고 아무것도 지우지 않는다
  프로젝트가 없으면 404 이고 아무것도 지우지 않는다
```

## DEVIATIONS

**zod 오류 로그에 메시지 대신 `path`·`code` 를 남겼다.** 계획은 `requirements/route.ts:157`
형태(`firstIssue: error.errors[0]?.message`)를 따르라고 했는데, zod 의
`invalid_enum_value` 메시지는 **받은 값을 그대로 문자열에 담는다**. 사용자가 보낸 값이
로그로 흘러가는 형태라 `lib/logger.ts` 규칙과 결이 맞지 않아, 로그에는
`{ path, code }` 만 남기고 **응답 본문에는 계획대로 메시지를 그대로 돌려준다**
(어느 항목이 문제인지 알려주는 것이 이 변경의 목적이므로).

## RISKS

**화면에서 재현하지 않았다.** 코드 경로로만 확정했고 dev 서버 기동은 환경 제약으로
금지돼 있다. 조치 전후 모두 실계정 확인이 남는다(계획서 D-C).

**`.max(2000)` 은 임의의 수다.** 현재 데이터에서 가장 큰 스펙 트리가 몇 행인지 재지
않았다. 상한이 없는 것보다는 낫지만, 실제 상한선은 근거가 아니라 짐작이다.

## QUESTIONS

**3단계 `create` 루프(N+1)는 손대지 않았다.** 계획대로 이월했다. 단계 안에서는
`createMany` 로 묶을 수 있지만, 이번 커밋의 목적(삭제 경로 교정)과 섞으면 회귀 원인을
가려서 뺐다. 스펙 트리가 커질수록 트랜잭션이 길어지는 문제는 그대로 남는다.
별건으로 잡을지 판단을 요청한다.
