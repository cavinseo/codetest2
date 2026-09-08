# WS-10 세부스펙 목록 좁히기와 기술적 특성 자동 로드 Implementation Plan

> **For agentic workers:** 이 계획서가 Task 의 정본이다. Step 은 체크박스(`- [ ]`)로
> 추적하고, 완료 시 `- [x]` 로 갱신해 코드와 함께 커밋한다.

**Goal:** WS-10 기능기술체계도에서 (1) 세부스펙 후보 목록은 그 행의 **핵심스펙 하위**
세부스펙만 보여주고, (2) 세부스펙을 고르면 **기술적 특성**에 WS-2 가 그 세부스펙에 적어 둔
적용기술이 자동으로 채워지게 한다. 사용자 요청: "세부기능 클릭시 세부스팩 기능 리스트는
핵심스팩의 하위 세부스팩만 보여주어라 그리고 기술적 특성은 선택한 세부 스팩의 기술적
스팩을 자동으로 불러오도록 하라".

## 확인한 사실

- 후보 목록은 `lib/tech-tree-utils.ts` 의 `buildTechTreeSpecOptions()` 가 WS-2 스펙에서
  만든다. 매핑은 `coreSpec = CORE.name`, `subSpec = DETAIL.name`(세세부기술이 없으면
  `SUB.name`), `techCharacteristic = DETAIL → SUB → CORE` 순의 첫 적용기술이다. 이번
  변경은 이 매핑을 건드리지 않는다 — 요청은 "목록을 좁혀라"이지 단계를 바꾸라는 것이 아니다.
- 고치기 전 `components/project/TechTreeTable.tsx` 는 세부스펙 팝업(`specPicker`)과
  datalist 에 **전체 후보**를 넣었다. 핵심스펙이 '측정'인 행에서도 '제어' 아래 세부기능이
  같이 떠 계통이 어긋난 짝을 고를 수 있었다.
- 기술적 특성은 팝업으로 고를 때만 함께 반영됐고, 세부스펙 칸에 직접 입력하거나
  datalist 에서 고르면 앞 세부스펙의 기술이 그대로 남았다.
- 선례: WS-2 표(`components/project/SpecTable.tsx:1240`)도 세부기술 datalist 를
  `subOptionsByCore` 로 그 행의 핵심기술 아래로 좁히고, 핵심기술이 비면 전체를 보여준다.
  WS-10 도 같은 규칙을 쓴다.

## 결정

- **핵심스펙이 비어 있으면 전체 후보를 보여준다.** 좁힐 기준 자체가 없고, 팝업에서 고른
  항목이 핵심스펙까지 채워 주는 기존 동작이 그대로 쓸모 있다(WS-2 와 같은 규칙).
- **자동 로드는 덮어쓰되 지우지는 않는다.** WS-2 에서 그 세부스펙의 적용기술을 찾으면
  기술적 특성을 그 값으로 바꾸고, 못 찾거나 적용기술이 비었으면 사용자가 적어 둔 값을
  그대로 둔다. 직접 적은 이름을 쓰다가 기술 설명이 지워지는 일을 막기 위함이다.
- **핵심스펙을 바꿔도 이미 적힌 세부스펙을 지우지 않는다.** 요청 범위 밖이고, 사용자가
  적어 둔 값을 임의로 버리는 쪽이 위험하다.

## Global Constraints

- CLAUDE.md 최우선 제약: `.env` 의 DB 는 원격 실DB 다. `prisma migrate deploy`/`db push`/
  `studio`, DB 에 쓰는 스크립트, **dev 서버 기동** 전부 금지. 이번 Task 는 DB 도 서버도
  필요 없다. 실화면 검증은 감리자·사용자가 한다.
- 들여쓰기 4칸. 주석은 한국어 "~다" 체, 무엇이 아니라 **왜**를 적는다.
- 게이트: `npx tsc --noEmit && npx vitest run && npx next lint`.

---

### Task 1: 핵심스펙 기준 필터와 적용기술 자동 로드

**Files:**
- 수정: `lib/tech-tree-utils.ts` (순수 함수 2개 추가)
- 수정: `tests/tech-tree-utils.test.ts` (새 함수 테스트)
- 수정: `components/project/TechTreeTable.tsx` (팝업·datalist·세부스펙 변경 처리)

**Interfaces:**

```ts
/** 핵심스펙 하위 후보만 남긴다. 핵심스펙이 비면 좁힐 기준이 없어 전부 돌려준다. */
export function filterTechTreeSpecOptionsByCore(
    options: TechTreeSpecOption[],
    coreSpec: string
): TechTreeSpecOption[];

/** 그 핵심스펙 아래 세부스펙의 적용기술. 없으면 빈 문자열(호출부가 기존 값을 유지한다). */
export function findTechTreeTechCharacteristic(
    options: TechTreeSpecOption[],
    coreSpec: string,
    subSpec: string
): string;
```

- [x] **Step 1: 순수 함수와 테스트**

두 함수 모두 앞뒤 공백을 무시하고 맞춘다(사용자가 손으로 적은 값과도 맞춰야 한다).
`findTechTreeTechCharacteristic` 은 세부스펙이 비면 곧바로 빈 문자열을 돌려준다 — 이름이
빈 WS-2 항목과 우연히 맞아 기술이 채워지는 일을 막는다.

- [x] **Step 2: 컴포넌트 연결**

- 팝업(`specPicker`)은 `pickerOptions` = 그 행 핵심스펙 하위 후보만 렌더한다. 비었을 때
  안내 문구도 "핵심스펙 아래 세부스펙이 없다"로 구분한다.
- 세부스펙 datalist 는 `getSubSpecOptions(row)` — 같은 핵심스펙의 WS-2 후보 + 같은
  핵심스펙을 쓰는 행에 이미 적힌 값.
- 세부스펙 입력의 `onChange` 를 `updateSubSpecGroup()` 으로 바꿔 세부스펙과 기술적 특성을
  한 번에 갱신한다. 병합된 셀 묶음을 찾는 부분은 `getGroupIds()` 로 뽑아
  `updateValueGroup`·`applySpecOption` 과 함께 쓴다(동작은 그대로).

- [x] **Step 3: 게이트**

```sh
npx tsc --noEmit
npx vitest run
npx next lint
```

**이 원격 세션에서는 실행 불가**: `registry.npmjs.org` 가 egress 허용 목록에 없어
(`x-deny-reason: host_not_allowed`) `npm install` 이 되지 않는다. 대신 아래로 확인했고,
정식 게이트는 의존성이 설치된 환경에서 감리자가 재실행한다.

- 순수 함수: `node --experimental-strip-types` 로 새 테스트와 같은 단언 16건 통과.
- 묶음 갱신 리팩터: 옛 구현과 새 구현을 3행 × 4열 × 값 3종(36건)으로 대조해 결과 동일.
  자동 로드 시나리오 5건(병합 묶음·빈 행·미매칭·빈 적용기술·값 삭제) 통과.
- 타입: 전역 tsc 6.0.2 + 최소 react 스텁으로 검사 — `lib`·`tests` 0건,
  컴포넌트는 스텁 때문에 생기는 `event` 암시적 any 4건(기존 줄) 외 0건.
- `node scripts/check-text-encoding.mjs` 통과.

## 감리 체크리스트

1. **경계**: diff 가 순수 함수 2개, 그 테스트, 컴포넌트의 팝업·datalist·세부스펙 onChange,
   계획서·보고서뿐인가. `buildTechTreeSpecOptions` 의 단계 매핑이 그대로인가.
2. **게이트 재실행**: 의존성이 설치된 환경에서 tsc·vitest·lint 3종.
3. **화면 검증(감리자·사용자, 실브라우저)**: WS-10 에서
   (a) 핵심스펙이 '측정'인 행의 '선택' 팝업에 '측정' 하위 세부스펙만 뜨는가,
   (b) 고르면 기술적 특성이 WS-2 의 적용기술로 채워지는가,
   (c) 세부스펙 칸에 직접 입력해도 WS-2 에 있는 이름이면 기술적 특성이 따라오는가,
   (d) WS-2 에 없는 이름을 적으면 기존 기술적 특성이 유지되는가,
   (e) 핵심스펙이 빈 행에서는 팝업에 전체 후보가 뜨고, 고르면 핵심스펙까지 채워지는가.

## 계획 밖

- 핵심스펙을 바꿨을 때 이미 적힌 세부스펙·기술적 특성을 어떻게 할지(그대로 두는 중).
- 기술적 특성 datalist 는 여전히 전체 값을 제안한다 — 요청 범위 밖이다.
