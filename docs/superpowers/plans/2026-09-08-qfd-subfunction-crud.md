# WS-9 기술특성의 세부기능 열 추가·삭제 Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WS-9 QFD 화면의 '기술특성' 영역에서 세부기능 열을 **삭제**할 수 있게 하고,
빈 칸을 다 쓴 뒤에도 열을 **추가**할 수 있게 한다.

**현황(감리자가 코드에서 직접 확인한 사실):**

- 기술특성 열 하나가 곧 세부기능 하나다. 열 머리글의 `<select>`로 세부기능을 고르면
  빈 칸(placeholder)이면 POST, 이미 있는 열이면 PATCH 한다
  (`components/project/QFDMatrix.tsx` `setTechnicalSubFunction`).
- **삭제 경로가 아예 없다.** `app/api/projects/[id]/qfd/technical/route.ts` 에는
  GET·PATCH·POST 만 있고 DELETE 가 없으며, 화면에도 열을 지우는 버튼이 없다.
  경쟁사 열에는 이미 `×` 삭제 버튼이 있어(같은 파일) 사용자가 기대할 만한 자리인데도 없다.
- 추가는 두 가지 길이 있다 — `+ 기술특성` 모달(이름·단위·목표치 입력), 그리고 빈 칸
  `<select>`에서 세부기능 고르기. 그런데 빈 칸은 `MIN_WORKSHEET_TECH_COLUMNS = 15`
  기준으로만 생겨서, **실제 열이 15개가 되면 빈 칸이 하나도 남지 않아** 두 번째 길이
  막힌다.

**Architecture:**

- API 에 `DELETE` 를 더한다. 소유권 확인은 PATCH 와 같은 방식
  (`findFirst({ where: { id, projectId } })` → 없으면 404)으로 맞춘다.
- 연결 데이터는 직접 지우지 않는다. `prisma/schema.prisma` 에서 `QFDMatrix.techChar`
  와 `TechCorrelation.tech1/tech2` 가 이미 `onDelete: Cascade` 라 DB 가 함께 지운다.
  두 곳에서 지우면 한쪽만 고쳐지는 회귀가 생긴다. **스키마 변경이 없으므로 마이그레이션도
  없다**(CLAUDE.md 의 원격 실DB 제약을 건드리지 않는다).
- 화면은 열 머리글에 `×` 버튼을 둔다 — 경쟁사 열의 기존 관용구를 그대로 따른다.
  관계 강도가 함께 지워지므로 확인 단계를 한 번 거친다. 확인 UI 는 이 컴포넌트에 이미
  있는 `showResetConfirm` 배너 형태를 따른다(새 패턴을 만들지 않는다).
- 추가는 "+ 세부기능" 버튼이 빈 칸을 하나 늘리는 방식으로 한다. 새 입력 폼을 만들지
  않고 **기존 `<select>` 흐름을 그대로 쓰기 위해서**다. 늘린 칸에 세부기능을 채우면
  실제 열이 되므로 늘린 개수를 하나 줄여, 채울 때마다 빈 칸이 쌓이지 않게 한다.

**Tech Stack:** 기존과 동일. 의존성·스키마 변경 없음.

## Global Constraints

- CLAUDE.md 최우선 제약: 원격 실DB — `prisma migrate deploy`/`db push`/`studio`,
  DB 에 쓰는 스크립트, **dev 서버 기동** 전부 금지. 이번 작업은 스키마를 바꾸지 않아
  마이그레이션이 필요 없다.
- 들여쓰기 4칸. 주석은 한국어 "~다" 체이고 무엇이 아니라 **왜**를 적는다.
- 테스트는 `tests/` 평면 배치, Prisma 는 `vi.mock('../lib/prisma', ...)` 로 mock.
- 완료 기준: `npx tsc --noEmit` + `npx vitest run` + `npx next lint`.
  신규 순수 모듈이 없으므로 stryker 대상은 늘지 않는다.
- 보고서는 `docs/superpowers/reports/2026-09-08-qfd-subfunction-crud/task-1.md` 로
  작업 커밋과 **별도의 둘째 커밋**.

---

### Task 1: 세부기능 열 삭제·추가

**Files:**

| 파일 | 책임 | 변경 |
|---|---|---|
| `app/api/projects/[id]/qfd/technical/route.ts` | 기술특성 삭제 엔드포인트 | Modify |
| `components/project/QFDMatrix.tsx` | 열 머리글 삭제 버튼, 확인 배너, "+ 세부기능" | Modify |
| `tests/api-qfd-technical-delete.test.ts` | 삭제 라우트 회귀 테스트 | Create |

- [x] **Step 1: DELETE 라우트를 추가한다**

`techDeleteSchema`(id 만) → 권한 확인 → 프로젝트 소속 확인(404) → `delete`.
오류 본문에는 원인을 담지 않는다(`기술특성 삭제 실패` 고정 문구) —
`tests/api-error-exposure.test.ts` 가 지키는 규칙과 같은 이유다.

- [x] **Step 2: 회귀 테스트를 쓴다** — `tests/api-qfd-technical-delete.test.ts`

단언 6개: 정상 삭제 / `write: true` 권한 요구 / 권한 거부 시 삭제 안 함 /
**다른 프로젝트 id 는 404 이고 delete 를 부르지 않음** / id 없으면 400 /
DB 오류 시 500 이고 원인 문자열이 응답에 없음.

- [x] **Step 3: 열 머리글에 삭제 버튼과 확인 배너를 넣는다**

`isPlaceholder` 가 아닌 열에만 `×` 를 붙인다(빈 칸은 지울 것이 없다).
배너 문구에 "관계 강도와 상관관계도 함께 지워집니다"를 적는다 — cascade 로 실제로
그렇게 되기 때문이다.

- [x] **Step 4: "+ 세부기능" 으로 빈 칸을 늘린다**

`extraTechColumnCount` 를 더해 빈 칸을 만들고, 채워지면 하나 줄인다.
접힌 그룹 뒤에 새 칸이 생기면 보이지 않으므로 추가 시 전체를 펼친다.

- [ ] **Step 5: 게이트** — 이 세션에서는 `npm install` 이 막혀 실행 불가. CI 로 확인한다.

## 감리 체크리스트

1. DELETE 가 **프로젝트 소속을 확인한 뒤** 지우는가 — id 만 믿고 지우면 남의 프로젝트
   열이 사라진다 (테스트로 고정)
2. 관계·상관관계를 코드에서 따로 지우지 않고 cascade 에 맡겼는가 (스키마 확인)
3. 삭제가 확인 한 단계를 거치는가, 문구가 무엇이 함께 지워지는지 말하는가
4. 빈 칸을 채운 뒤 표가 계속 길어지지 않는가 (`extraTechColumnCount` 감소)
5. 감리자 직접 재실행: tsc 0 · vitest 전체 통과 · lint 0

## 계획 밖 (사람이 하는 일)

- **실화면 검증** — dev 서버 기동은 실행 AI 에게 위임하지 않는다.
  검증 항목: 열 `×` → 확인 → 삭제 후 표·중요도 계산이 정상인지, "+ 세부기능" 이
  15칸을 넘겨도 동작하는지, 삭제 후 관계 점수가 남지 않는지.
- **접힘 그룹 인덱스 어긋남** — 그룹 접힘 상태는 열 순번 기준이라 열을 추가·삭제하면
  접어 둔 그룹이 밀린다. 이번 작업이 만든 문제가 아니라 원래 있던 성질이므로
  범위 밖으로 둔다(전체 펼치기로 복구된다).

---

### Task 2: 측정단위·설계 목표치 칸을 표에서 직접 입력한다

**요구:** 측정단위·자사·경쟁사·설계 목표치 칸에 입력이 안 된다. 입력 가능하게 하라.

**조사 결과 — 네 줄의 성격이 갈린다:**

| 줄 | 저장 자리 | 이번 처리 |
|---|---|---|
| 측정단위 | `TechnicalCharacteristic.unit` | 입력 가능하게 함 |
| 설계 목표치 | `TechnicalCharacteristic.targetValue` | 입력 가능하게 함 |
| 자사 | **없음** | 범위 밖 — 아래 참조 |
| 경쟁사 | **없음** | 범위 밖 — 아래 참조 |

측정단위·설계 목표치는 값을 담을 열이 이미 있고 PATCH 라우트도 이 둘을 받는다.
화면(`components/project/QFDMatrix.tsx` tfoot)이 읽기 전용 텍스트로만 그려서
`+ 기술특성` 모달로만 넣을 수 있었을 뿐이다.

**자사·경쟁사는 저장할 곳이 없다.** `Benchmark` 는 *요구사항* × 회사이지
(오른쪽 「중요도 및 경쟁 비교」 블록이 쓴다) *기술특성* × 회사가 아니다.
스키마에 기술특성별 자사/경쟁사 값을 담는 모델이 없으므로 새 테이블이 필요하고,
그것은 **원격 실DB 마이그레이션**을 뜻한다 — CLAUDE.md 최우선 제약에 따라 실행 AI 가
적용하지 않는다. 사용자 결정과 마이그레이션 적용 단계로 이월한다.

- [x] **Step 1: 두 줄을 입력 칸으로 바꾼다** — 초안을 들고 있다가 포커스를 뗄 때
  한 번만 PATCH 한다(글자마다 보내면 요청이 타자 수만큼 늘고 순서가 뒤집힌다).
  Enter 는 blur 로 처리해 같은 경로를 탄다. 빈 칸(placeholder) 열은 DB 행이 없어
  그대로 둔다.
- [ ] **Step 2: 게이트** — 이 세션에서는 실행 불가. CI 로 확인한다.

## Task 2 계획 밖 (사람이 정할 일)

- **자사·경쟁사 줄을 입력 가능하게 하려면** `TechnicalBenchmark`(projectId,
  technicalCharId, company, value) 같은 새 모델과 마이그레이션이 필요하다.
  스키마·라우트·화면은 준비할 수 있으나 **마이그레이션 적용은 사용자 몫**이다.
