# 위임 프롬프트 — 토스트 상태 로직을 공용 훅으로 통합

감리자가 발행한다. 아래 코드블록 안이 실행 AI 에게 그대로 주는 프롬프트다.

```
[역할]
너는 codetest2(KS-QFD 웹앱)의 리팩터링 담당 엔지니어다. 이번 작업은 13개 화면에
복붙돼 있는 토스트 상태 로직을 공용 훅 하나로 모으고, 그 과정에서 드러난 타이머
정리 누락을 고치는 것이다. **동작을 바꾸지 마라 — 타이머 정리 추가만 예외다.**

[배경 — 검증된 사실이니 재조사하지 마라]
감리자가 저장소를 직접 조사해 확정했다.

1. `components/HeaderToast.tsx` 는 이미 공용 표시 컴포넌트다. 이 파일은 잘 돼 있다.
   `export type ToastType = 'success' | 'error' | 'info'` 를 이미 내보낸다(12줄).
   **공용화되지 않은 것은 표시가 아니라 상태 관리다.**

2. **13개 파일이 같은 3종 세트를 복붙하고 있다**: `useState` + `toastTimer` useRef +
   `showToast` 함수.
     app/project/[id]/attributes/fitness/page.tsx
     components/project/ 의 DevPlanTable · FitnessWrapper · ImprovementsTable ·
       KanoManager · ProductAttributesTable · QFDMatrix · RequirementsTable ·
       SalesTable · SpecTable · TargetSpecTable · TechRoadmapTable · TechTreeTable
   (app/project/[id]/page.tsx 은 HeaderToast 슬롯만 두고 상태 로직이 없다 — 제외)

3. **결함 A — 13개 전부 언마운트 시 타이머를 정리하지 않는다.** 감리자가 전 파일에서
   `useEffect` 의 cleanup 을 grep 했고 결과가 0건이다. 각 파일의 clearTimeout 은
   showToast 내부의 "이전 타이머 취소"뿐이고 언마운트 정리가 아니다.
   워크시트 탭을 전환하면 이 컴포넌트들은 언마운트되는데, 저장 직후 3초 안에 탭을
   바꾸면 사라진 컴포넌트에 setState 가 걸린다. **이번 훅에서 반드시 고쳐라.**

4. **결함 B — showToast 시그니처가 6가지로 갈렸다.** 같은 개념인데 전부 다르다:
     (message: string)                                        × 1
     (msg: string)                                            × 4   ← 인자명도 다르다
     (message: string, type: 'success'|'error' = 'success')    × 1
     (message: string, type: 'success'|'error'|'info' = ...)   × 1
     (message: string, type: 'success'|'info'|'error' = ...)   × 1   ← 순서만 다름
     (message: string, type: ToastType = 'success')            × 5
5. **ToastType 이 6곳에 정의돼 있다.** HeaderToast 가 이미 export 하는데도 5개 파일이
   각자 재정의한다. 그중 셋은 'info' 가 빠진 좁은 버전이다:
     components/project/ProductAttributesTable.tsx:42   'success'|'error'
     components/project/RequirementsTable.tsx:24        'success'|'error'
     components/project/QFDMatrix.tsx:89                'success'|'error'
     components/project/KanoManager.tsx:88              'success'|'error'|'info'
     app/project/[id]/attributes/fitness/page.tsx:30    'success'|'error'
   전부 지우고 HeaderToast 의 것을 import 해라. 좁은 타입이 넓어지는 방향이라
   기존 호출부는 그대로 통과한다.

6. **이 저장소에는 React 훅을 테스트할 수단이 없다.** @testing-library/react ·
   jsdom · happy-dom 이 모두 미설치이고 vitest.config.ts 에 environment 설정도 없다
   (기본 node 환경). 기존 테스트는 전부 순수 lib 모듈과 API 라우트다.
   **그러니 이 훅에 단위 테스트를 붙이지 마라. 테스트 인프라를 새로 들이지도 마라**
   ([확정된 계약] 3번 참조).

7. 커스텀 훅 관례가 이 저장소에 아직 없다(hooks/ 디렉터리 없음, 기존 use* 훅 0개).
   위치는 감리자가 정했다 — 아래 [확정된 계약] 2번.

[용어·규칙]
- 들여쓰기 4칸. 주석은 한국어 "~다" 체이고, 무엇이 아니라 **왜**를 적는다.
- 커밋 메시지는 한국어, 본문에 "왜"를 적는다.
  트레일러: Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

[확정된 계약 — 감리자 승인, 이 결정을 따르라]
1. **동작을 바꾸지 않는다.** 표시 시간 3초, 이전 타이머 취소, 기본 타입 'success',
   렌더 위치(HeaderToast 포털) 전부 그대로다. 유일한 동작 변화는 언마운트 정리 추가다.
2. **훅 파일은 `components/useToast.ts`.** HeaderToast 와 짝이라 같은 디렉터리에 둔다.
   이 저장소에 hooks/ 관례가 없어 새 디렉터리를 만드는 것보다 응집도가 낫고,
   lib/ 은 "Prisma 를 mock 하지 않는 순수 모듈" 자리라 React 훅이 갈 곳이 아니다.
3. **새 npm 패키지를 설치하지 마라.** 특히 @testing-library/react·jsdom 을 들여
   훅 테스트를 만들지 마라. 이 저장소의 테스트 전략(순수 lib + API 라우트)을
   바꾸는 결정은 이 Task 의 권한 밖이다.
4. **HeaderToast.tsx 를 고치지 마라.** 이미 공용이고 잘 돼 있다.
5. 시그니처는 하나로 통일한다: `showToast(message: string, type?: ToastType)`,
   기본값 'success'. 인자명은 `message` 로 통일한다.
6. 표시 시간 3000ms 는 훅 안에 상수로 한 번만 둔다.
지시와 기존 계약이 충돌하면: 기존 계약을 따르고 이유를 보고하라.

[작업 내용]

A. components/useToast.ts (신규)
   - `useToast()` 가 `{ toast, showToast }` 를 돌려준다.
     toast 는 `{ message: string; type: ToastType } | null`.
   - showToast 는 [확정된 계약] 5번 시그니처. 이전 타이머를 취소하고 3초 뒤 자동으로
     닫는다(기존 동작 그대로).
   - **useEffect cleanup 에서 언마운트 시 타이머를 정리한다**(결함 A). 왜 필요한지를
     주석으로 남겨라 — 탭 전환으로 언마운트된 뒤 setState 가 걸리는 것을 막는다는 것.
   - showToast 는 useCallback 으로 감싸 참조가 매 렌더 바뀌지 않게 한다(의존성 배열에
     넣는 호출부가 생겨도 안전하도록).
   - ToastType 은 HeaderToast 에서 import 해 재수출하지 말고 그대로 쓴다.

B. 13개 파일 치환
   각 파일에서 useState·toastTimer·showToast 정의를 지우고 `const { toast, showToast }
   = useToast();` 로 바꾼다. 렌더는
   `{toast && <HeaderToast message={toast.message} type={toast.type} />}` 형태가 된다.
   - 지역 `type ToastType = ...` 정의 5개를 지운다([배경] 5번의 파일·줄번호 참조).
   - **호출부의 인자는 건드리지 마라.** showToast('저장되었습니다.') 도,
     showToast('실패', 'error') 도 새 시그니처로 그대로 통과한다.
   - 쓰이지 않게 된 useRef·useState import 를 정리한다(lint 가 잡는다).
   - QFDMatrix 는 토스트 외에도 상태가 많다. 토스트 관련 줄만 건드려라.

[환경]
- **최우선 제약 — 원격 실DB.** prisma migrate deploy/db push/studio, DB 에 쓰는
  스크립트, **dev 서버 기동** 전부 금지. 이번 작업은 DB 를 건드리지 않는다.
  → **실화면 확인은 네 몫이 아니다.** 감리자와 사용자가 한다. 하지 않은 것을
    했다고 쓰지 마라.
- 게이트: npx tsc --noEmit && npx vitest run && npx next lint
- stryker: 이번 작업은 순수 lib 모듈을 만들지 않으므로 **대상 없음.**
  stryker.crap.config.json 을 건드리지 마라.

[브랜치·커밋]
- 브랜치: claude/notification-warning-position-p3vlxx
- **작업 시작 전에 원격을 먼저 받아라**:
  `git fetch origin && git merge origin/claude/notification-warning-position-p3vlxx`
  **rebase 가 아니라 merge 다.**
- 끝나면 push: `git push -u origin claude/notification-warning-position-p3vlxx`
  (non-fast-forward 는 네트워크 실패가 아니다. 재시도 말고 위 merge 를 다시 하라.)
- force push 금지. main 병합·배포 금지.
- 건드리지 마라: prisma/** · app/api/** · lib/** · components/HeaderToast.tsx ·
  stryker.crap.config.json · 결과보고서 관련 파일(lib/final-report-*, tests/final-report-*,
  lib/worksheet-capture.ts) — 별개 작업이 진행 중이다.
- A(훅 신규)와 B(13개 치환)를 별개 커밋으로 나눠라. B 가 문제되면 A 만 남길 수 있다.

[작업 방식]
- **작업 시작 전 `npx vitest run` 의 파일 수·테스트 수를 먼저 재서 보고서에 적어라.**
  이 리팩터링은 테스트 수를 늘리지 않는다 — 작업 후 수가 같아야 정상이다.
- 기존 테스트를 하나도 수정·skip·삭제하지 마라. 동작을 바꾸지 않는 리팩터링이므로
  테스트가 깨지면 그건 네 변경이 동작을 바꿨다는 신호다.

[Ask First — 다음이 필요해지면 중단하고 보고하라]
- 어떤 파일의 토스트 동작이 다른 12개와 실제로 달라서 공용 훅으로 못 덮을 때
  (예: 표시 시간이 3초가 아니거나, 자동으로 닫히지 않거나, 여러 개를 동시에 띄우는 곳)
  — **억지로 맞추지 말고 그 파일을 빼고 보고하라.**
- 기존 테스트가 깨질 때
- 새 패키지가 필요해 보일 때
- HeaderToast.tsx 자체를 고쳐야 할 것 같을 때

[완료 판정 — 전부 만족해야 완료]
1. `npx tsc --noEmit` 오류 0.
2. `npx vitest run` 전체 통과. **작업 전과 테스트 수가 같다**(보고서에 둘 다 적었다).
3. `npx next lint` 오류 0.
4. `grep -rn "toastTimer" app components` 결과가 **0건**이다.
5. `grep -rn "type ToastType" app components` 결과가 **components/HeaderToast.tsx
   한 줄뿐**이다.
6. components/useToast.ts 에 언마운트 타이머 정리가 있다.
7. `git diff` 가 components/useToast.ts + 위 13개 파일로만 국한된다.
   lib/** · app/api/** · prisma/** · stryker 설정 · HeaderToast.tsx 변경 0건.
8. 커밋이 둘로 나뉘어 있다(훅 신규 / 13개 치환).
9. `git push` 성공. main 병합·배포 안 함.

[산출물·보고]
- 코드 (커밋 2개 + push 완료)
- 보고서: docs/superpowers/reports/2026-09-09-toast-hook/task-1.md
  **별도의 셋째 커밋**(`docs: 토스트 훅 리팩터링 결과 보고서`).

  RESULT / FILES CHANGED / COMMIT / VERIFIED BY / DEVIATIONS / RISKS / QUESTIONS

  - VERIFIED BY 에 완료 판정 1~5번의 **실행 명령과 출력 원문**을. 4·5번은 grep
    결과를 그대로 붙여라.
  - DEVIATIONS 에 13개 중 동작이 달라 손대지 못한 파일이 있으면 파일명과 이유를.
  - RISKS 에 **"실화면에서 토스트를 띄워보지 않았다"를 명시하라.** dev 서버 기동이
    금지돼 있으므로 그것이 정상이다.
```

---

## 감리자 메모 (프롬프트에 넣지 않는다)

### 사전 조사로 확정한 것

`grep -rl HeaderToast` 로 사용처 15개를 뽑고, 각 파일의 useState·toastTimer·showToast·
clearTimeout 을 세어 실태를 확정했다. 요청은 "공용 Toast 컴포넌트로 리팩터링"이었지만
**표시 컴포넌트는 이미 공용이었다**(HeaderToast, 이 세션 초반 PR #30). 공용화가 안 된
것은 상태 관리 쪽이라, 작업 대상을 그렇게 재정의했다.

조사 중 결함 둘을 찾았다. 둘 다 요청에는 없던 것이다:
- **언마운트 타이머 정리 누락 13/13.** `useEffect` cleanup 을 전 파일에서 grep 했고
  0건이다. 워크시트 탭 전환이 언마운트를 일으키므로 실제로 발생하는 경로다.
  리팩터링으로 훅 하나에 모으면 한 곳만 고치면 되니, 지금이 가장 싸다.
- **showToast 시그니처 6종 분기 + ToastType 6곳 중복 정의.** HeaderToast 가 이미
  export 하는데도 5곳이 재정의하고 그중 셋은 'info' 가 빠진 좁은 버전이다.

### 감리자가 대신 정한 것 (실행 AI 재량 아님)

1. **훅 위치 `components/useToast.ts`.** hooks/ 디렉터리 관례가 없고 기존 커스텀 훅도
   0개다. lib/ 은 stryker 설정 주석이 "순수 lib 모듈" 자리로 못박은 곳이라 React 훅이
   갈 자리가 아니다. HeaderToast 와 짝을 이루는 위치가 응집도가 높다.
2. **훅 단위 테스트를 만들지 않는다.** @testing-library/react·jsdom·happy-dom 이
   전부 미설치이고 vitest environment 설정도 없다(기본 node). 이 저장소는 지금까지
   React 컴포넌트 테스트를 하나도 하지 않았다 — 전부 순수 lib + API 라우트다.
   훅 하나 때문에 React 테스트 인프라를 들이는 것은 이 Task 의 권한 밖이라 보고
   [확정된 계약] 3번으로 금지했다. **대신 이 리팩터링은 테스트가 아니라 tsc·lint·
   grep 기반 완료 판정(4·5번)과 실화면으로 담보한다** — 그 점을 판정 때 감안할 것.
3. **결과보고서 작업과 파일이 겹치지 않으므로 같은 브랜치에서 병행 가능.**
   Task 4 프롬프트가 components/project/** 를 금지했고, 이 Task 는 lib/** 와
   결과보고서 파일을 금지했다. 양쪽 [브랜치·커밋] 절에 서로의 영역을 적어 뒀다.
   다만 **이 리팩터링을 Task 4 보다 먼저 돌리는 편이 낫다** — 새 보고서 화면도
   토스트를 쓰므로, 훅이 먼저 있으면 Task 4 가 복붙을 하나 더 만들지 않는다.
   Task 4 프롬프트는 이 작업 병합 후 useToast 사용을 한 줄 추가해 갱신한다.

### 판정 계획

1. 경계 확인 — diff 가 useToast.ts + 13개 파일에 국한되는지. lib/·HeaderToast.tsx·
   stryker 설정 무변경. **게이트보다 먼저.**
2. 표본 대조 — ① 언마운트 cleanup 이 실제로 있는지 ② toastTimer grep 0건
   ③ ToastType 정의가 HeaderToast 한 곳뿐인지 ④ 호출부 인자가 안 바뀌었는지
   ⑤ 3000ms 상수가 한 곳뿐인지
3. **테스트 수가 작업 전후로 같은지** — 늘었다면 훅 테스트를 만들었다는 뜻이고
   그건 계약 위반이다. 줄었다면 기존 테스트를 지웠다는 뜻이다.
4. 게이트 재실행 — 이 세션에서는 여전히 불가능(node_modules 없음, npm 403).
5. **실화면**: 워크시트에서 저장 → 토스트가 뜨는가 / 3초 뒤 사라지는가 /
   **저장 직후 3초 안에 탭을 바꿔도 오류가 없는가**(이번에 고친 결함) /
   초록·빨강 배경과 흰 글자가 유지되는가(이 세션 초반 사용자 요구).
