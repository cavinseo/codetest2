# Task B 결과 보고서 — WS-3 를 WS-5 패턴으로 전환

## RESULT

**제품속성을 고쳐도 WS-4 적합도가 살아남는다.** 그리고 매번 뜨던 경고가 진짜 위험할
때만 뜨게 됐다.

| 항목 | 이전 | 이후 |
| --- | --- | --- |
| 저장 방식 | `deleteMany`(전량) + `createMany` | **빠진 행만 delete → update → 없으면 create** |
| id 유지 편집 시 WS-4 | 확인을 누르면 **전부 사라짐** | **남는다** |
| id 유지 편집 시 409 | **항상** 뜸 | 뜨지 않음 |
| 새 id 전체 교체 시 409 | 뜸 | **여전히 뜸**(의도한 동작) |
| 경고 문구의 숫자 | 프로젝트의 **모든** 적합도 | **실제로 죽을** 적합도만 |
| 교차 프로젝트 덮어쓰기 | (해당 없음) | `where` 에 `projectId` 동반 |

### 원인을 다시 짚는다 — id 문제가 아니었다

검토서 초판은 "저장할 때마다 id 가 새로 발급된다"고 적었지만 **틀렸다**. id 는 이미 세
단계 모두에서 보존되고 있었다.

| 단계 | 코드 | 상태 |
| --- | --- | --- |
| 화면 → 서버 | `ProductAttributesTable.tsx:339` | ✅ `id` 를 실어 보냄 |
| 스키마 | `bulk-save-schemas.ts:86-88` (주석까지 있었다) | ✅ 통과시킴 |
| 서버 → DB | `attributes/route.ts:96` `{...attr, projectId}` | ✅ 같은 id 로 재생성 |

**그런데도 사라졌다.** `deleteMany` 가 먼저 돌면서 캐스케이드로 `AttributeFitness` 를
지우고, 그 뒤에 같은 id 의 부모를 되살려도 **이미 지워진 자식은 돌아오지 않기** 때문이다.

> 고칠 곳은 스키마도 화면도 아니고 `deleteMany` 의 `where` 절 하나였다.

### 가드가 손실을 훈련시키고 있었다

`countAttributeCascadeImpact` 가 제출 id 를 보지 않아 **오타 한 글자를 고치는 저장에도**
"적합도 N건이 함께 삭제됩니다"가 떴다. `ProductAttributesTable.tsx:352` 가 그때마다
`window.confirm` 을 띄운다. 늘 뜨는 경고는 읽히지 않고, 사용자는 확인을 습관적으로
누르게 된다 — 그 순간 실제 손실이 일어난다.

`deleteMany` 를 고치면 정상 편집에서 지워질 행이 0건이 되므로, **가드는 자동으로
조용해진다.**

## FILES CHANGED

- Modify: `lib/import-cascade-guard.ts` (`countAttributeCascadeImpact` 에 `survivingAttributeIds` 추가)
- Modify: `app/api/projects/[id]/attributes/route.ts` (행 단위 upsert 로 전환, `generateId` import)
- Modify: `tests/import-cascade-guard.test.ts` (+2건)
- Modify: `tests/api-worksheet-cascade.test.ts` (단언 1건 반전, +8건, tx mock 을 모듈 수준 고정 객체로)

## COMMIT

- `85339a0` — fix: 워크시트 저장 결함 셋 (Task A·B·C)

## VERIFIED BY

run 33459364656 / job 99706076947, 커밋 `85339a0`.

```
$ npx tsc --noEmit
(출력 없음, exit 0)

$ npx vitest run --pool=threads
 Test Files  94 passed (94)
      Tests  1084 passed (1084)

$ npm run lint
> eslint .
(출력 없음, exit 0)

$ npx stryker run stryker.crap.config.json --mutate lib/import-cascade-guard.ts
-------------------------|--------|---------|----------|-----------|------------|----------|----------|
All files                | 100.00 |  100.00 |       71 |         0 |          0 |        0 |        0 |
 import-cascade-guard.ts | 100.00 |  100.00 |       71 |         0 |          0 |        0 |        0 |
-------------------------|--------|---------|----------|-----------|------------|----------|----------|

killed=71 survived=0 other=0
```

**mutation score 100%.** 새로 넣은 분기까지 전부 단언된다. 특히 이 두 건이 그 분기를
직접 죽인다.

```
✓ countAttributeCascadeImpact 살아남을 속성 id 를 주면 그 속성의 적합도는 세지 않는다 (killed 4)
✓ countAttributeCascadeImpact 빈 배열은 전량 삭제로 보고 필터 없이 센다 (killed 2)
```

### 뒤집은 단언

`tests/api-worksheet-cascade.test.ts:185` 의

> `'속성이 비어있지 않아도(전체 교체) 적합도가 있으면 409 로 막는다'`

는 우리가 고치려는 동작 그 자체였다. 다음으로 대체했다.

> `'id 를 유지한 정상 편집은 적합도가 있어도 통과한다'`

### 새로 넣은 단언

```
attributes 저장 캐스케이드
  새 id 로 전체 교체하면 기존 행이 지워지므로 409 로 막는다   ← AI 위저드 경로를 계속 막는다
attributes 저장 — 행 단위 upsert
  제출에서 빠진 행만 지운다                                 ← deleteMany 의 where 를 직접 본다
  빈 제출은 필터 없이 전량을 지운다
  기존 id 는 update 로 가고 create 를 부르지 않는다
  update 의 where 에 projectId 가 함께 걸린다               ← 교차 프로젝트 덮어쓰기 방지
  DB 에 없는 id 는 그 id 그대로 create 한다                 ← 적합도가 참조할 수 있으므로
  id 가 없는 행은 서버가 id 를 발급해 create 한다
  클라이언트가 보낸 임의 필드는 저장되지 않는다
```

### 계획서가 금지한 것을 지켰는지

- `tests/api-bulk-save-guards.test.ts` **수정 없음** — leaf 워크시트의 `'id 는 저장되지
  않는다'` 단언은 그대로 둔다. 그쪽은 FK 자식이 없어 지금 방식이 옳다.
- `requirements/route.ts` **수정 없음** — 이미 되어 있다.
- 스키마·마이그레이션 변경 **없음**. `npx prisma validate` 만 돌렸다.

## DEVIATIONS

**가드를 계획보다 한 단계 정확하게 만들었다.** 계획서 B-1 은 `productAttribute.count` 를
더해 "지워질 부모 행 수"를 먼저 세고, 0이 아닐 때만 적합도 **전량**을 세는 형태였다
(requirements 와 같은 2단 구조).

그대로 하면 속성 한 줄을 지울 때도 "적합도 40건이 삭제됩니다"가 떠 **숫자가 실제와
다르다.** 대신 `attributeFitness.count({ where: { projectId, attributeId: { notIn } } })`
로 **죽을 적합도만** 직접 셌다. 쿼리도 둘에서 하나로 줄고 문구도 정확해진다.
`AttributeCascadeCounter` 인터페이스는 `productAttribute` 없이 `attributeFitness` 만
넓혔다. 계획서 본문도 이 형태로 정정해 두었다.

**`survivingAttributeIds` 를 선택 인자로 두었다.** 주지 않으면 예전과 똑같이 전량을
센다. 지금 호출부는 attributes 라우트 하나뿐이지만, 기존 테스트 2건이 인자 없이 부르고
있어 그대로 통과한다.

**`tests/api-worksheet-cascade.test.ts` 의 tx mock 구조를 바꿨다.** 원래는 `$transaction`
콜백이 불릴 때마다 새 `vi.fn()` 을 만들어 넘겨서, `deleteMany` 의 `where` 절을 밖에서
단언할 수 없었다. 모듈 수준 고정 객체로 바꿔 같은 참조를 보게 했다. requirements 쪽
기존 테스트 5건은 응답 status 만 보므로 영향이 없다(전부 통과 확인).

## RISKS

**실기동·실측 검증이 없다.** 삭제 경로를 바꿨는데 확인은 전부 mock 테스트다.
`tests/integration/db-cascade.integration.test.ts` 가 있고 전용 설정
(`vitest.integration.config.ts`)과 스크립트(`npm run test:integration`)까지 있지만,
`vitest.config.ts:exclude` 가 기본 실행에서 빼고 `ci.yml` 은 `npm test` 만 부른다 —
**CI 에서 한 번도 돌지 않는다.** 실DB 접속이 필요해 환경 제약과 정면으로 부딪힌다.
계획서 D-A 로 남겼다.

**`updateMany` 는 없는 행에 조용히 count 0 을 준다.** 그때 같은 id 로 `create` 하는데,
경합 상황(같은 순간 다른 세션이 그 행을 만들면)에서는 PK 충돌로 트랜잭션이 실패한다.
지금은 낙관적 잠금이 없어 어차피 나중 저장이 이기는 구조라 새로 생긴 위험은 아니지만,
실패 방식이 "조용한 덮어쓰기"에서 "500"으로 바뀐다.

**행 수만큼 쿼리가 늘었다.** `createMany` 한 번이 `updateMany` × N 이 됐다.
requirements 가 이미 같은 형태로 돌고 있어 전례는 있지만, 속성이 수백 행이 되면
트랜잭션이 길어진다.

## QUESTIONS

**AI 위저드(`AttributeMentorWizard`)가 새 id 로 전체 교체하면 여전히 409 다.**
의도한 동작이고 테스트로 고정했다 — 그 경로는 진짜로 기존 행을 전부 지우므로 확인을
받아야 한다. 다만 사용자 입장에서는 "AI 초안을 적용할 때마다 경고"가 되므로, 위저드가
기존 행의 id 를 물려받게 만들 여지가 있다. 별건으로 볼지 판단을 요청한다.
