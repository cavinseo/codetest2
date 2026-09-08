# Task 1 결과 보고서 — WS-10 세부스펙 목록 좁히기와 기술적 특성 자동 로드

## RESULT

WS-10 기능기술체계도에서 세부스펙 후보를 그 행의 핵심스펙 하위로 좁히고, 세부스펙이 바뀌면
WS-2 가 그 스펙에 적어 둔 적용기술을 기술적 특성에 자동으로 채우게 했다.

- 팝업('선택')과 세부스펙 datalist 모두 `filterTechTreeSpecOptionsByCore()` 로 그 행의
  핵심스펙 아래 후보만 보여준다. 핵심스펙이 비어 있으면 좁힐 기준이 없어 전체를 보여주고,
  고른 항목이 핵심스펙까지 채운다(WS-2 `SpecTable` 의 세부기술 목록과 같은 규칙).
- 팝업이 비었을 때 문구를 나눴다 — 핵심스펙이 있으면 "WS-2에 '<핵심스펙>'의 하위 세부스펙이
  없습니다.", 없으면 종전의 "WS-2 AS-IS 스펙 후보가 없습니다."
- 세부스펙 입력의 `onChange` 가 `updateSubSpecGroup()` 으로 바뀌어 세부스펙과 기술적 특성을
  한 번에 갱신한다. WS-2 에 없는 이름을 적었거나 적용기술이 비어 있으면 기존 기술적 특성을
  지우지 않는다.
- 병합 셀 묶음 계산은 `getGroupIds()` 로 뽑아 `updateValueGroup`·`updateSubSpecGroup`·
  `applySpecOption` 이 함께 쓴다. 동작은 종전과 같다(아래 VERIFIED BY 의 대조 참조).

## FILES CHANGED

- `lib/tech-tree-utils.ts` — `filterTechTreeSpecOptionsByCore()`,
  `findTechTreeTechCharacteristic()` 추가. 기존 함수는 손대지 않았다.
- `tests/tech-tree-utils.test.ts` — 새 함수 테스트 9건 추가(기존 2건 그대로).
- `components/project/TechTreeTable.tsx` — 팝업 후보 필터·안내 문구, 행별 datalist
  (`getSubSpecOptions`), `getGroupIds`/`updateSubSpecGroup` 도입.
- `docs/superpowers/plans/2026-09-08-ws10-spec-filtering-autoload.md` — 계획서(신규).

## COMMIT

- `194b5fe` feat: WS-10 세부스펙 목록을 핵심스펙 하위로 좁히고 적용기술을 자동으로 불러온다

## VERIFIED BY

**게이트 3종은 이 원격 세션에서 실행하지 못했다.** `npm install` 이 실패한다:

```sh
$ curl -sS -i https://registry.npmjs.org/vitest
HTTP/2 403
x-deny-reason: host_not_allowed
Host not in allowlist: registry.npmjs.org. Add this host to your network egress settings to allow access.
```

`package.json` 의 `xlsx` 가 가리키는 `cdn.sheetjs.com` 도 같은 이유로 막혀 있다(프록시
status 의 `recentRelayFailures`). 허용 목록 문제라 재시도·우회는 하지 않았다. 대신 의존성
없이 할 수 있는 검증을 했고, `npx tsc --noEmit && npx vitest run && npx next lint` 는
의존성이 설치된 환경에서 감리자가 재실행해야 한다.

1. 순수 함수 — 새 테스트와 같은 단언 16건을 node 로 직접 실행(기존 테스트 2건의 단언 포함):

```sh
$ node --experimental-strip-types scratchpad/verify-tech-tree.mjs
OK: 16개 단언 통과
```

2. 묶음 갱신 리팩터 — 옛 `updateValueGroup` 과 새 구현을 3행 × 4열 × 값 3종으로 대조하고,
   자동 로드 시나리오(병합 묶음·빈 행·미매칭·빈 적용기술·값 삭제)를 확인:

```sh
$ node --experimental-strip-types scratchpad/verify-group-update.mjs
OK: 리팩터 대조 36건 + 자동 로드 5건 통과
```

3. 타입 — 전역 typescript 6.0.2 로 바뀐 세 파일 검사(react 는 최소 스텁으로 대체):

```
lib/tech-tree-utils.ts: 0건
tests/tech-tree-utils.test.ts: Cannot find module 'vitest' 1건(의존성 미설치)
components/project/TechTreeTable.tsx: 스텁 탓의 `event` 암시적 any 4건(모두 기존 줄) 외 0건
```

4. 인코딩:

```sh
$ node scripts/check-text-encoding.mjs
한글 인코딩 검사 통과.
```

## DEVIATIONS

- 계획서를 먼저 커밋하지 않고 작업 커밋에 함께 담았다(단일 Task 라 분리 이득이 없다).
- stryker 는 실행하지 못했다(같은 의존성 문제). `lib/tech-tree-utils.ts` 는
  `stryker.crap.config.json` 의 `mutate` 목록에 없어 재실행 의무 대상은 아니다.

## RISKS

- **게이트 미실행**이 가장 큰 위험이다. 특히 `npx next lint` 는 전혀 대체 검증하지 못했다.
- 컴포넌트 렌더링 테스트는 이 저장소에서 만들 수 없다(2026-09-07 계획 Task 2: Vitest 4 의
  oxc 변환기가 `jsx: preserve` 인 `.tsx` 를 못 읽는다). 팝업·datalist 는 화면 검증으로
  이월한다 — 계획서의 감리 체크리스트 3번.
- 핵심스펙을 나중에 바꾸면 이미 적힌 세부스펙·기술적 특성은 그대로 남는다(의도한 결정).
  화면에서 어색하다는 판단이 나오면 별도 요청으로 다룬다.

## QUESTIONS

- 세부스펙이 WS-2 후보와 맞는데 그 항목의 적용기술이 비어 있을 때, 지금은 기존 값을
  유지한다. 반대로 "빈 값으로 맞춰 비워라"가 맞다면 알려 달라 — 한 줄이면 바뀐다.
