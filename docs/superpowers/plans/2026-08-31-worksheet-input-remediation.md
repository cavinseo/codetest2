# 워크시트 자료입력 개선 계획

**근거 검토서:** `docs/2026-08-31-worksheet-input-review.md` **rev.2**
(초판이 아니다 — 초판은 네 주장 중 셋이 반증됐고, 그 정정이 이 계획의 전제다)
**브랜치:** `claude/carp-inspection-46phhc`
**작성:** 2026-08-31

---

## 이 계획이 채택한 설계 — 안1 "id 보존 upsert"

심사 결과 **23/30** 으로 1위. 이긴 이유는 성능도 우아함도 아니라 **새로 만들 것이 없어서**다.

`app/api/projects/[id]/requirements/route.ts:80-147` 이 이미 정답 구현이고, 그 테스트
(`tests/api-worksheet-cascade.test.ts:81-160`)도 이미 돌고 있다. **스키마 변경 없음,
마이그레이션 없음, 새 개념 없음.** WS-3 에 같은 형태를 옮기는 것이 전부다.

| 설계안 | 합계 | 탈락 이유 |
| --- | --- | --- |
| **안1 — id 보존 upsert (WS-5 패턴 이식)** | **23** | — |
| 안2 — 자연키 매칭 | 16 | 자연키 후보가 전부 빈 문자열·중복 허용이라 불안정 |
| 안3 — 변경분만 PATCH | 15 | 클라이언트가 변경 추적을 떠안고, 유실 시 조용히 틀린다 |

### 전제로 삼는 사실 (rev.2 에서 확정)

1. **WS-5 는 이미 되어 있다.** 다시 만들지 않는다.
2. **WS-3 의 id 는 이미 보존된다.** 문제는 id 가 아니라 **보존할 행까지 지우는 `deleteMany`** 다.
3. **leaf 워크시트는 지금이 옳다.** FK 자식이 없다.
   `tests/api-bulk-save-guards.test.ts:106,190` 의 `'id 는 저장되지 않는다'` 단언은 **유지한다.**
4. **WS-2 는 upsert 대상이 아니다.** `serializeSpecs`(`SpecTable.tsx:625`)가 매번
   `core_N`/`sub_N` 임시 id 를 새로 만들어 보내고 `SpecFunction` 에는 유입 FK 가 없다.
   진짜 전체 교체가 맞다.

---

## Task 순서와 근거

| Task | 내용 | 크기 | 선행 |
| --- | --- | --- | --- |
| **0** | 검토서 rev.2 정정 | (이 커밋) | — |
| **A** | WS-2 초기화 결함 수정 **+ zod 검증** | 반나절~1일 | 0 |
| **B** | WS-3 를 WS-5 패턴으로 전환 | 반나절~1일 | 0 |
| **C** | WS-3 스펙 선택기 병합 버그 | 0.5일 | 없음 |
| **D** | 미저장 이탈 경고 (저장 버튼 계열 12개) | 1~2일 | 없음 |
| **E** | 탭 전환 경고 (감리자 결정으로 추가) | 반나절~1일 | D |
| 이월 | 붙여넣기 · 키보드 이동 · 병합 그룹화 · 낙관적 잠금 · AI 위저드 409 · WS-2 N+1 | — | — |

A·B·C 는 서로 독립이라 순서를 바꿔도 되고 병렬로 위임해도 된다. **D 는 A·B 뒤에** 둔다 —
저장이 아직 손실을 일으키는 상태에서 "저장 안 했다" 경고만 붙이면 잘못된 안심을 준다.

---

## Task 0 — 검토서 정정 ✅

- [x] `docs/2026-08-31-worksheet-input-review.md` 를 rev.2 로 정정
- [x] 정정 이력 표를 문서 머리에 명시(초판 주장 / 판정 / 실제)
- [x] §1-1 표에서 WS-5 를 "이미 upsert" 로 이동, leaf 워크시트를 범위 밖으로 표시
- [x] §3 WS-3-1 을 "id 미보존" → "보존할 행까지 삭제" 로 재서술
- [x] §4 크기 재산정(키보드 1~2일 → 6~9일, upsert 3~5일 → WS-3 만 반나절~1일)
- [x] WS-3-5(`getRowSpan`) 신규 항목 추가

---

## Task A — WS-2 초기화 결함 수정 + zod 검증

### 배경

`SpecTable.tsx:722 handleReset` 이 `{ specFunctions: [] }` 를 POST 하는데,
`spec/route.ts:77-82` 가 **조기 반환**해서 `deleteMany` 가 실행되지 않는다.

```ts
if (newSpecs.length === 0) {
    return NextResponse.json({ specFunctions: [], message: '스펙이 저장되었습니다' });
}
```

클라이언트는 200 을 받고 `setRows([])` 후 `'AS-IS 스펙표가 초기화되었습니다.'` 를 띄운다.
**화면만 비고 DB 는 그대로다.** 새로고침하면 전부 되살아난다. 우회 경로도 없다 —
`DELETE` 핸들러가 없고(`GET`·`POST` 뿐), 행을 전부 지우고 저장해도 같은 조기 반환에 걸린다.

### ⚠️ 조기 반환만 걷어내면 지금보다 나빠진다

spec 라우트는 **저장소에서 유일하게 zod 검증이 없다** — `body.specFunctions || []`(`:75`).
조기 반환을 없애면 **오타 한 글자짜리 잘못된 본문이 `[]` 로 강등돼 무조건 전량 삭제를
돌린다.** 이 사고는 이 저장소에서 이미 한 번 났고 흔적이 남아 있다
(`app/api/projects/[id]/improvements/route.ts:46-47`):

> 예전에는 items 가 배열이 아니면 조용히 [] 로 강등돼, 오타 난 바디 하나로
> 개선포인트가 통째로 지워지고도 200 이 나갔다. 이제는 400 으로 막는다.

**그래서 두 변경은 반드시 한 커밋에 함께 들어간다.**

### Step

- [x] A-1. `lib/bulk-save-schemas.ts` 에 spec 스키마를 더한다. 다른 워크시트와 같은 자리다.

```ts
// ── spec functions (WS-2) ─────────────────────────────────────
// id 는 SpecTable.serializeSpecs 가 만드는 임시 id(core_0, sub_1)다. 저장하지 않고
// parentId 재매핑에만 쓴다 — SpecFunction 에는 이 id 를 참조하는 FK 가 없다.
export const specFunctionRowSchema = z.object({
    id: z.string().optional(),
    level: z.enum(['CORE', 'SUB', 'DETAIL']),
    name: z.string().trim().min(1).max(200),
    parentId: z.string().optional(),
    technology: optionalText,
    order: z.coerce.number(),
});
export const specBodySchema = z.object({
    specFunctions: z.array(specFunctionRowSchema).max(2000),
});
```

  - `name` 에 `min(1)` 을 걸어도 안전하다. `serializeSpecs` 는 빈 이름을 만들지 않는다
    (`:639` 빈 행 스킵, `:653`·`:674` 빈 sub/detail 은 push 하지 않음).
  - `level` 은 화면이 세 갈래로만 렌더링하므로 화이트리스트로 고정한다
    (`improvementRowSchema` 의 `type` 과 같은 이유).
  - `.max(2000)` 은 행수 상한이다. 지금은 상한이 없다.

- [x] A-2. `app/api/projects/[id]/spec/route.ts`

```ts
const { specFunctions: newSpecs } = specBodySchema.parse(await request.json());
// 조기 반환을 없앤다 — 빈 배열은 "저장할 게 없다"가 아니라 "전부 지워라"는 뜻이다.
// 화면의 초기화 버튼이 보내는 유일한 신호이므로, 여기서 막으면 지웠다고 말해 놓고
// 지우지 않는 상태가 된다.
```

  - `if (newSpecs.length === 0) return ...` (`:77-82`) 삭제
  - `catch` 에 zod 분기를 더한다. **`requirements/route.ts:156-159` 형태를 따른다**
    (`error.errors[0].message` 를 400 으로). `attributes/route.ts:117` 처럼 메시지를
    뭉개지 않는다 — 그쪽은 어느 행이 잘못됐는지 알 수 없어 검토서 §1-6 이 지적한 문제다.
  - 트랜잭션 안 3단계 루프는 **이번에 건드리지 않는다**(WS-2-3 N+1 은 이월).

- [x] A-3. `tests/api-spec-save.test.ts` 신규. spec 라우트는 지금 **라우트 테스트가 0건**이다.
      Prisma 는 `vi.mock('../lib/prisma', ...)` 로 전부 mock 한다.

  - [x] 빈 배열을 보내면 `tx.specFunction.deleteMany` 가 **호출된다**(회귀 방지 본체)
  - [x] 빈 배열 응답이 200 이고 `specFunctions: []` 다
  - [x] `specFunctions` 가 배열이 아니면 **400 이고 `deleteMany` 가 호출되지 않는다**
        (← improvements 사고의 재발 방지)
  - [x] `specFunctions` 키가 아예 없으면 400
  - [x] `level` 이 화이트리스트 밖이면 400
  - [x] `name` 이 빈 문자열이면 400
  - [x] 정상 저장 시 CORE → SUB → DETAIL 순서로 `create` 가 불리고 `parentId` 가
        실제 생성 id 로 재매핑된다
  - [x] 권한이 없으면 403 이고 `deleteMany` 가 호출되지 않는다
        (`api-bulk-save-guards.test.ts` 의 같은 단언을 참고)

- [x] A-4. 게이트 통과 확인

### 완료 기준

- 빈 배열 POST 가 실제로 DB 를 비운다(테스트로 단언)
- 잘못된 본문이 400 으로 막히고 **아무것도 지우지 않는다**(테스트로 단언)
- `npx tsc --noEmit && npx vitest run && npx next lint` 전부 통과

### 하지 말 것

- `DELETE` 핸들러 신설 — 화면이 이미 POST 로 초기화하고 있어 경로가 둘로 갈린다
- 3단계 `create` 루프를 `createMany` 로 바꾸는 최적화 — 별건이다
- **dev 서버 기동으로 화면 확인** (CLAUDE.md 환경 제약)

---

## Task B — WS-3 를 WS-5 패턴으로 전환

### 배경

`attributes/route.ts:90` 의 `deleteMany` 가 **보존할 행까지** 지운다. 캐스케이드로
`AttributeFitness`(WS-4)가 함께 사라지고, `:95` 의 `createMany` 가 **같은 id** 로 부모를
되살려도 자식은 돌아오지 않는다.

id 는 이미 세 단계 모두에서 보존된다 — 화면(`ProductAttributesTable.tsx:339`),
스키마(`bulk-save-schemas.ts:86-88`), 서버(`attributes/route.ts:96`).
**그러니 id 를 살리는 작업이 아니다. 지우지 않는 작업이다.**

가드도 함께 고친다. `countAttributeCascadeImpact`(`lib/import-cascade-guard.ts:83-89`)는
제출 id 를 보지 않고 프로젝트의 모든 적합도를 세므로 **정상 편집에도 매번 409** 를 낸다.
`ProductAttributesTable.tsx:352` 가 그때마다 `window.confirm` 을 띄우고, 늘 뜨는 경고는
읽히지 않는다. **가드가 사용자를 손실로 훈련시키고 있다.**

### 정본 — `requirements/route.ts:80-147`

```ts
const submittedIds = rows.map(r => r.id).filter((id): id is string => Boolean(id));

// notIn: [] 은 "아무것도 안 지움"이 아니라 전체 삭제다. 빈 제출은 필터 없이 센다.
const deletedExistingCount = submittedIds.length === 0
    ? await prisma.X.count({ where: { projectId } })
    : await prisma.X.count({ where: { projectId, id: { notIn: submittedIds } } });

if (deletedExistingCount > 0) { /* 여기서만 409 */ }

await prisma.$transaction(async (tx) => {
    await tx.X.deleteMany({
        where: submittedIds.length > 0 ? { projectId, id: { notIn: submittedIds } } : { projectId },
    });
    for (const row of rows) {
        if (row.id) {
            const updated = await tx.X.updateMany({ where: { id: row.id, projectId }, data });
            if (updated.count > 0) continue;
        }
        await tx.X.create({ data: { id: row.id || generateId('attr'), projectId, ...data } });
    }
});
```

`updateMany({ where: { id, projectId } })` 를 쓰는 이유가 있다 — `update` 는 없는 행에
throw 하고, `where` 에 `projectId` 를 함께 걸어야 **남의 프로젝트 행을 id 만으로 덮어쓰는
것을 막는다.** 이 형태를 그대로 가져온다.

### Step

- [x] B-1. `lib/import-cascade-guard.ts` — `countAttributeCascadeImpact` 에 제출 id 를 받는다.

```ts
export interface AttributeCascadeCounter {
    attributeFitness: {
        count: (args: {
            where: { projectId: string; attributeId?: { notIn: string[] } };
        }) => Promise<number>;
    };
}
```

**실제 구현은 계획보다 한 단계 정확하다.** 처음에는 requirements 처럼 "지워질 부모 행
수"를 먼저 세고 그때만 적합도 전량을 세려 했는데, 그러면 속성 한 줄을 지울 때도
"적합도 40건이 삭제됩니다"가 떠 숫자가 실제와 다르다. `attributeId: { notIn }` 으로
**죽을 적합도만** 직접 세면 쿼리도 하나로 줄고 문구도 정확해진다.

  - 시그니처를 `(db, projectId, submittedIds?: string[])` 로 넓힌다.
  - **기존 호출부를 깨지 않는다** — `submittedIds` 를 안 주면 지금과 같이 전량을 센다.
    `import/route.ts` 등 전체 교체가 진짜인 경로는 그 동작이 맞다.
  - 이 파일은 순수 모듈이고 이미 stryker 대상이다(`stryker.crap.config.json`).
    **mutation score 100% 를 유지해야 한다.**

- [x] B-2. `app/api/projects/[id]/attributes/route.ts` — 위 정본을 이식한다.

  - `submittedIds` 계산 → 지워질 기존 행 수 count → **0건이면 409 를 건너뛴다**
  - 트랜잭션: `deleteMany({ id: { notIn } })` → `updateMany` 시도 → 실패 시 `create`
  - `createMany` 는 사라진다. 응답의 `findMany` 는 그대로 둔다(화면이 그걸로 재렌더한다)
  - 새 행 id 는 클라이언트가 `attr_<ts>_<rand>`(`ProductAttributesTable.tsx:279`)로
    이미 만들어 보낸다. 없을 때만 서버가 `generateId('attr')` 로 채운다

- [x] B-3. `tests/api-worksheet-cascade.test.ts` 의 attributes 절(`:162-230`)을 고친다.

  - [x] **`:185 '속성이 비어있지 않아도(전체 교체) 적합도가 있으면 409 로 막는다'` 를
        뒤집는다.** 이 단언은 고치려는 동작 그 자체다. 새 이름:
        `'id 를 유지한 정상 편집은 적합도가 있어도 통과한다'`
  - [x] 유지: 빈 배열 전량 삭제는 적합도가 있으면 409
  - [x] 유지: `confirmCascade` 면 진행
  - [x] 신규: **새 id 로 전체 교체**(AI 위저드 등)는 기존 행이 지워지므로 409
        (requirements 쪽 `:127` 과 대칭)
  - [x] 신규: `deleteMany` 가 `{ projectId, id: { notIn: submittedIds } }` 로 불린다
  - [x] 신규: 기존 id 는 `updateMany`, 새 id 는 `create` 로 간다
  - [x] 신규: `updateMany` 의 `where` 에 `projectId` 가 들어 있다(교차 프로젝트 방지)

- [x] B-4. `npx stryker run stryker.crap.config.json --mutate lib/import-cascade-guard.ts`
      — score 100%

- [x] B-5. 게이트 통과 확인

### 완료 기준

- id 를 유지한 정상 편집이 **409 없이 통과하고 WS-4 적합도가 남는다**(테스트로 단언)
- 진짜 전량 삭제·새 id 전체 교체는 **여전히 409 로 막힌다**(테스트로 단언)
- `import-cascade-guard.ts` mutation score 100%
- 게이트 3종 통과

### 하지 말 것

- **leaf 워크시트로 확대** (팩토리 5개, improvements, assets, funding) — FK 자식이 없어
  얻는 것이 없고, `api-bulk-save-guards.test.ts:106,190` 의 `'id 는 저장되지 않는다'`
  단언과 정면으로 충돌한다. **그 테스트를 고치지 마라.**
- `lib/row-sync.ts` 같은 공용 모듈 신설 — 적용 대상이 WS-3 하나뿐이라 지금은 과설계다.
  셋째 사례가 생기면 그때 뽑는다
- 스키마·마이그레이션 변경 — 필요 없다. `prisma migrate` 계열은 **금지**다
- **실DB 에 붙는 확인** — `npx prisma validate`/`generate` 까지만

---

## Task C — WS-3 스펙 선택기 병합 버그

### 배경

`components/project/ProductAttributesTable.tsx:72-80` — 숨김 판정과 계수 판정의 기준이 다르다.

```ts
if (index > 0 && arr[index][key] === arr[index - 1][key]) return 0;   // core 비교 없음
...
if (arr[i][key] === arr[index][key] && (key === 'core' || arr[i].core === arr[index].core)) count++;
//                                      ↑ 여기에는 있다
```

core 가 다른데 sub 이름이 같은 **인접** 두 행에서 위 행의 `count` 는 core 경계에서 멈춰 `1`,
아래 행은 `0` 을 받아 `<td>` 가 렌더되지 않는다. **세부기능 칸이 사라지고 오른쪽 열이 한
칸씩 밀린다.** "설치"·"관리" 같은 흔한 이름이면 바로 재현된다.

### Step

- [x] C-1. 숨김 판정에 같은 조건을 더한다.

```ts
// 숨김 판정과 계수 판정의 기준이 같아야 한다. core 가 다른데 sub 이름만 같은 인접 행을
// 숨기면, 위 행의 rowSpan 은 core 경계에서 멈춰 있어 그 칸이 아무에게도 그려지지 않는다.
const sameGroup = (a: FlatRow, b: FlatRow) =>
    a[key] === b[key] && (key === 'core' || a.core === b.core);
if (index > 0 && sameGroup(arr[index], arr[index - 1])) return 0;
```

- [x] C-2. 순수 함수로 뽑아 테스트한다. `getRowSpan` 은 지금 컴포넌트 안 클로저라
      테스트할 수 없다. `lib/product-attributes-utils.ts` 로 옮기고
      `(rows, key, index) => number` 시그니처로 export 한다.

- [x] C-3. `tests/product-attributes-utils.test.ts` 에 추가

  - [x] core 가 다르고 sub 이름이 같은 인접 두 행 → **두 행 모두 span ≥ 1**(회귀 본체)
  - [x] 같은 core 안 연속 sub → 첫 행이 개수, 나머지 0
  - [x] `key: 'core'` 는 core 만 본다
  - [x] 빈 배열·단일 행

- [x] C-4. **CRAP 게이트 확인.** `buildSpecPickerRows` 가 CRAP 29.5 로 `--fail-over=30`
      까지 여유가 **0.5** 뿐이다(`.github/workflows/crap.yml:78`). 같은 파일에 분기를
      더하므로, 새 함수가 테스트로 완전히 덮이는지 반드시 확인한다.

- [x] C-5. 게이트 통과 확인

### 완료 기준

- 위 회귀 케이스가 테스트로 고정된다
- CRAP 이 30 을 넘지 않는다
- 게이트 3종 통과

### 하지 말 것

- 검토서 §3 WS-3-2 의 "문자열 일치 병합" 자체를 바꾸는 것 — 그것은 설계 이월 항목(7번)이다.
  이번엔 **두 판정의 기준을 맞추는 것**까지다

---

## Task D — 미저장 이탈 경고 (저장 버튼 계열 12개)

### 배경

`beforeunload` 가 저장소에 **0건**이다. 입력은 전부 로컬 state 이고 "저장" 클릭에만
영속화되므로, 탭을 닫거나 뒤로 가면 조용히 사라진다.

### ⚠️ 일괄 적용하면 오탐이 난다

| 워크시트 | 저장 시점 | 경고 |
| --- | --- | --- |
| WS-2·3·5 및 팩토리 계열 12개 | 저장 버튼 | **건다** |
| WS-7 Kano 가중치 | `onBlur` 즉시 저장 (`KanoAggregationTable.tsx:157`) | 걸지 않는다 |
| WS-9 QFD 관계 셀 | 클릭 즉시 POST (`QFDMatrix.tsx:276`) | 걸지 않는다 |

**탭 전환은 이 훅으로 못 막는다.** 워크시트 간 이동은 `setActiveTab` 에 의한 언마운트이지
라우터 이동이 아니라 `beforeunload` 도 Next 라우터 가로채기도 걸리지 않는다.
**1차 범위에서 뺀다** — 막으려면 탭 컨테이너가 dirty 상태를 알아야 하고, 그건 별건이다.

### Step

- [x] D-1. `lib/use-unsaved-changes.ts` (또는 `hooks/`) 신규 — `useUnsavedChanges(isDirty: boolean)`

  - `beforeunload` 등록/해제만 한다. 브라우저가 커스텀 문구를 무시하므로 문구는 넣지 않는다
  - `isDirty === false` 면 리스너를 아예 걸지 않는다

- [x] D-2. dirty 판정을 각 컴포넌트에 붙인다. **직렬화 결과 비교**로 한다 —
      마지막 저장 성공 시점의 스냅샷과 현재 rows 를 비교한다. `onChange` 마다 플래그를
      세우는 방식은 "고쳤다가 되돌린" 경우에 오탐한다

- [x] D-3. 12개 컴포넌트에 적용 — 검토서 §1-3 표 첫 줄을 실제로 세어 12개였다.
      Sales·DevPlan·TechRoadmap·TechTree·TargetSpec·Assets·Improvements·Funding·
      Requirements·Spec·ProductAttributes·Fitness

- [x] D-4. 훅 테스트. 훅은 DOM 이벤트를 다루므로 순수 부분(dirty 판정)을 분리해
      `lib/` 에 두고 그쪽을 테스트한다

- [x] D-5. 게이트 통과 확인

### 완료 기준

- 12개 워크시트에서 미저장 상태로 닫으면 브라우저 확인이 뜬다
- WS-7·WS-9 에는 **붙지 않는다**
- 게이트 3종 통과

### 하지 말 것

- WS-7·WS-9 에 적용
- 탭 전환 가로채기 — 1차 범위 밖
- 자동 저장 도입 — 별건이고 실DB 쓰기 정책과 얽힌다

---

## 이월 항목

| 항목 | 크기 | 이월 이유 |
| --- | --- | --- |
| 붙여넣기 입력(`onPaste` TSV) | 2~3일 (WS-5 기준) | 표마다 열 구성이 달라 워크시트별 비용. 먼저 한 곳에서 검증 |
| 키보드 셀 이동 | **6~9일** | 초판 1~2일은 과소평가. 표마다 좌표계·병합 규칙이 다름 |
| WS-3 병합을 명시적 그룹으로 | 별도 검토 | 스키마+화면 동시 변경. 값싼 완화책(불일치 경고) 먼저 |
| 낙관적 잠금 (종합검진 H-5) | 별도 계획 | Task B 뒤에 범위가 줄어든다. WS-9 는 이미 셀 단위라 제외 |
| WS-2 3단계 `create` N+1 | 소 | 단계 안에서는 `createMany` 로 묶을 수 있으나 Task A 와 섞지 않는다 |
| WS-3 ↔ WS-2 문자열 복사 동기화 | 별도 검토 | `buildSpecPickerRows` 가 CRAP 최고값이라 손대면 게이트를 건드린다 |

---

## Task E — 탭 전환 경고 (감리자 결정으로 추가)

### 배경

Task D 가 막은 것은 "브라우저 창 닫기·새로고침"뿐이다. 워크시트 사이의 탭 전환은
`setActiveTab` 에 의한 언마운트라 `beforeunload` 가 걸리지 않는다.

**이 앱에서 실제로 가장 흔한 이탈 경로가 그쪽이다.** WS-1 부터 WS-17 까지 순서대로
채워 나가는 구조라, 사용자가 반복하는 행동이 "이 표 채우다가 다음 표로 넘어가기"다.
창을 닫는 일은 그보다 드물다.

### 설계

탭을 쥔 쪽(`app/project/[id]/page.tsx`)이 "지금 열린 워크시트가 저장 안 된 상태인가"를
알아야 한다. 워크시트 12개에 props 를 뚫어 내리는 대신 컨텍스트로 받는다.

```
useUnsavedChanges (워크시트 12개)
      ↓ setDirty(key, dirty)   ← 이펙트, 정리 함수가 언마운트 시 false 로 지운다
UnsavedChangesProvider (page.tsx)
      ↓ dirtyWorksheets: Set<string>   ← ref. 타이핑마다 페이지를 다시 그리지 않는다
navigateToTab(tabId)   ← 비어 있지 않으면 window.confirm
```

- [x] E-1. `lib/unsaved-changes.ts` 에 `applyDirtyReport`·`hasUnsavedWork`·
      `LEAVE_WORKSHEET_CONFIRM` 추가 (순수 부분이라 단언할 수 있다)
- [x] E-2. `lib/unsaved-changes-context.tsx` 신규. Provider 가 없어도 동작해야 한다 —
      워크시트는 프로젝트 페이지 밖에서도 쓰일 수 있고, 그때는 창 닫기 경고만 걸리면 된다
- [x] E-3. `useUnsavedChanges` 가 `useId()` 키로 자기 상태를 보고한다.
      **정리 함수가 핵심이다** — 탭을 옮기면 언마운트되는데 dirty 로 남으면 경고가
      다음 이동까지 따라다닌다
- [x] E-4. `page.tsx` 에 `navigateToTab` 을 두고 이동 버튼 4곳을 그리로 돌린다.
      `onSaved` 콜백 2곳은 **그대로 둔다** — 저장이 막 끝난 뒤라 되물으면 안 된다
- [x] E-5. 테스트 7건, 게이트 통과

### 하지 말 것

- dirty 를 state 로 들기 — 타이핑 한 글자마다 프로젝트 화면 전체가 리렌더된다
- `onSaved` 콜백을 가로채기 — 저장 직후 이동인데 되물으면 오탐이다

---

## 감리자 결정이 필요한 항목

- [x] **D-A. `tests/integration/` — 결정: 감리자가 수동으로 한 번 돌린다.**
      절차는 `docs/superpowers/reports/2026-08-31-worksheet-input-remediation/통합테스트-수동실행.md`.
      **정정:** 이 테스트는 실데이터 DB에 붙지 않는다. 별도 `INTEGRATION_DATABASE_URL`
      을 요구하고 앱 URL과 같으면 실패하는 안전장치가 코드에 있다. 판단을 요청할 때
      그 점을 정확히 전하지 못했다.

- [ ] ~~**D-A(원문). `tests/integration/` 을 게이트에 넣을지.**~~ `tests/integration/db-cascade.integration.test.ts`
      가 있고 전용 설정(`vitest.integration.config.ts`)과 스크립트(`npm run test:integration`)
      까지 있는데, `vitest.config.ts:exclude` 가 기본 실행에서 빼고 `ci.yml` 은
      `npm test` 만 부른다. **결과적으로 CI 에서 한 번도 돌지 않는다.**
      Task B 는 캐스케이드 삭제 경로를 바꾸므로 이 파일이 가장 값진 자리인데,
      실행에 실DB 접속이 필요해 환경 제약과 정면으로 부딪힌다.
      → 현재 계획은 **넣지 않는 쪽**으로 세웠다(mock 테스트만). 감리자가 로컬에서
      한 번 돌려보는 선택지는 남는다.

- [ ] **D-B. WS-2 계층 모델.** WS-2 는 매 저장마다 임시 id 를 새로 발급해 진짜 전체
      교체다. `SpecFunction` 에 유입 FK 가 없어 지금은 손실이 없지만, 앞으로 스펙을
      참조하는 워크시트가 생기면 WS-3 와 같은 문제가 그대로 재현된다.
      → 지금 고칠지, 참조가 생길 때 고칠지. **현재 계획은 이월.**

- [ ] **D-C. 실기동 확인.** WS-2 초기화 결함은 코드 경로로만 확정했다. 조치 전후로
      실계정 재현이 있으면 좋은데, **실행 AI 에게 위임할 수 없다**(dev 서버 기동 금지).
      → 감리자 또는 사용자가 직접.

---

## 위임 프롬프트

각 Task 의 위임 프롬프트는 `docs/superpowers/plans/2026-08-31-worksheet-input-remediation-commands.md`
에 있다. 위 Task 절을 그대로 감싸는 형태이며, 계획서가 정본이다.
