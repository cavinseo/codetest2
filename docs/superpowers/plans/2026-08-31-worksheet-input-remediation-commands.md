# 위임 프롬프트 — 워크시트 자료입력 개선

**계획서(정본):** `docs/superpowers/plans/2026-08-31-worksheet-input-remediation.md`
**근거 검토서:** `docs/2026-08-31-worksheet-input-review.md` **rev.2**

각 블록을 그대로 실행 AI 에게 붙여넣는다. Task A·B·C 는 서로 독립이라 순서를 바꾸거나
병렬로 줘도 되고, **D 는 A·B 가 끝난 뒤에** 준다.

---

## 모든 Task 공통 — 프롬프트 머리에 반드시 함께 붙인다

```
[환경 제약 — 위반 시 즉시 중단]
- .env 의 POSTGRES_PRISMA_URL 은 실데이터가 있는 원격 Supabase 다.
- 절대 금지: prisma migrate deploy / db push / studio, DB 에 쓰는 스크립트,
  dev 서버 기동(신설·수정 API 라우트라도 dev 서버로 실기동 검증하지 않는다).
- 안전: npx prisma validate, npx prisma generate.
- 화면·API 실기동 검증이 필요하다고 판단되면 하지 말고 QUESTIONS 에 적어 올린다.
- npx prisma generate 가 EPERM ... query_engine-windows.dll.node 로 실패하면 dev 서버가
  DLL 을 잠근 것이다. 직접 죽이지 말고 중단·보고한다.
- 키·비밀번호·이메일을 로그·응답 본문에 남기지 않는다 (lib/logger.ts 규칙).

[저장소 관례]
- 커밋 메시지는 한국어. 본문에 "무엇"이 아니라 "왜"를 적는다.
  트레일러: Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
- 들여쓰기 4칸. 주석은 한국어 "~다" 체, 이유 중심.
- 새 소스 파일에는 한 줄짜리 한국어 머리 주석을 단다.
- 테스트는 tests/ 평면 배치. Prisma 는 vi.mock('../lib/prisma', ...) 로 전부 mock 한다.
- 계획서의 체크박스를 완료하면 - [x] 로 갱신해 코드와 같은 커밋에 담는다.

[게이트 — 전부 통과해야 완료다]
    npx tsc --noEmit && npx vitest run && npx next lint
- 한국어 파일을 새로 만들면 npm run check:encoding 도 함께 돌린다.
  ci.yml 의 npm test / npm run build 가 이 검사를 먼저 돌리므로, 인코딩이 틀리면
  게이트가 초록이어도 CI 가 빨개진다.

[산출물·보고]
작업을 마치면 보고서를 채팅이 아니라 저장소 파일로 남긴다.
  docs/superpowers/reports/2026-08-31-worksheet-input-remediation/task-<식별자>.md
형식은 아래 그대로 쓴다.
  RESULT          — 무엇이 달라졌는가. 표로 이전/이후를 대비시킨다.
  FILES CHANGED   — Add/Modify/Delete 로 구분한 파일 목록
  COMMIT          — 작업 커밋 해시와 제목
  VERIFIED BY     — 각 게이트의 실행 명령과 출력 마지막 줄을 원문 그대로
  DEVIATIONS      — 계획서와 다르게 한 것과 그 이유
  RISKS           — 남은 위험
  QUESTIONS       — 감리자 판단이 필요한 것
보고서는 작업 커밋과 별도의 둘째 커밋으로 남긴다 (docs: Task <식별자> 결과 보고서).
작업 커밋 해시가 보고서 본문에 들어가야 하므로 순서를 바꿀 수 없다.
두 커밋 뒤 git status 는 깨끗해야 한다.
```

---

## Task A — WS-2 초기화 결함 수정 + zod 검증

```
docs/superpowers/plans/2026-08-31-worksheet-input-remediation.md 의 "Task A" 절을
읽고 그대로 수행하라. 아래는 그 절의 요지와, 반드시 지켜야 할 제약이다.

[문제]
components/project/SpecTable.tsx:722 handleReset 이 { specFunctions: [] } 를 POST 하는데
app/api/projects/[id]/spec/route.ts:77-82 가 조기 반환한다.

    if (newSpecs.length === 0) {
        return NextResponse.json({ specFunctions: [], message: '스펙이 저장되었습니다' });
    }

deleteMany 가 실행되지 않는다. 클라이언트는 200 을 받고 setRows([]) 후
'AS-IS 스펙표가 초기화되었습니다.' 토스트를 띄운다. 화면만 비고 DB 는 그대로다.
새로고침하면 전부 되살아난다. 사용자는 지웠다고 믿는다.
우회 경로도 없다 — 이 라우트에는 GET·POST 뿐이고 DELETE 핸들러가 없다.

[가장 중요한 제약 — 두 변경은 한 커밋에 함께 들어간다]
조기 반환만 걷어내면 지금보다 나쁜 결함이 된다.
spec 라우트는 이 저장소에서 유일하게 zod 검증이 없다 (body.specFunctions || [], :75).
조기 반환을 없애면 오타 한 글자짜리 잘못된 본문이 [] 로 강등돼 무조건 전량 삭제를 돌린다.
이 사고는 이 저장소에서 이미 한 번 났다.
app/api/projects/[id]/improvements/route.ts:46-47 의 주석이 그 흔적이다.

    예전에는 items 가 배열이 아니면 조용히 [] 로 강등돼, 오타 난 바디 하나로
    개선포인트가 통째로 지워지고도 200 이 나갔다. 이제는 400 으로 막는다.

zod 없이 조기 반환만 지우는 커밋은 반려한다.

[할 일]
1. lib/bulk-save-schemas.ts 에 spec 스키마를 더한다. 다른 워크시트 스키마와 같은 자리다.
   - specFunctionRowSchema: id 선택, level 은 ['CORE','SUB','DETAIL'] 화이트리스트,
     name 은 trim().min(1).max(200), parentId 선택, technology 는 optionalText,
     order 는 coerce.number()
   - specBodySchema: { specFunctions: z.array(...).max(2000) }
   - name 에 min(1) 을 걸어도 안전하다. SpecTable.serializeSpecs 는 빈 이름을 만들지
     않는다 (:639 빈 행 스킵, :653/:674 빈 sub·detail 은 push 하지 않음). 직접 읽어 확인하라.
   - level 화이트리스트는 improvementRowSchema 의 type 과 같은 이유다.
   - id 는 저장하지 않는다. serializeSpecs 가 만드는 임시 id(core_0, sub_1)이고
     parentId 재매핑에만 쓴다. SpecFunction 에는 이 id 를 참조하는 FK 가 없다
     (prisma/schema.prisma:192-204 로 확인했다).

2. app/api/projects/[id]/spec/route.ts
   - body 파싱을 specBodySchema.parse 로 바꾼다
   - :77-82 조기 반환을 삭제한다. 왜 지우는지 주석으로 남긴다 — 빈 배열은 "저장할 게
     없다"가 아니라 "전부 지워라"는 뜻이고, 화면의 초기화 버튼이 보내는 유일한 신호다
   - catch 에 zod 분기를 더한다. requirements/route.ts:156-159 형태를 따른다
     (error.errors[0].message 를 400 으로). attributes/route.ts:117 처럼 메시지를
     '유효하지 않은 ... 데이터입니다.' 로 뭉개지 마라 — 어느 행이 잘못됐는지 알 수 없다
   - 트랜잭션 안의 3단계 create 루프는 건드리지 않는다

3. tests/api-spec-save.test.ts 신규. 이 라우트는 지금 라우트 테스트가 0건이다.
   Prisma 는 vi.mock 으로 전부 mock 한다. tests/api-bulk-save-guards.test.ts 의
   mock 구성을 본으로 삼아라. 최소 아래를 단언한다.
   - 빈 배열을 보내면 tx.specFunction.deleteMany 가 호출된다 (회귀 방지 본체)
   - 빈 배열 응답이 200 이고 specFunctions 가 [] 다
   - specFunctions 가 배열이 아니면 400 이고 deleteMany 가 호출되지 않는다
   - specFunctions 키가 아예 없으면 400
   - level 이 화이트리스트 밖이면 400
   - name 이 빈 문자열이면 400
   - 정상 저장 시 CORE → SUB → DETAIL 순으로 create 가 불리고 parentId 가 실제
     생성 id 로 재매핑된다
   - 권한이 없으면 403 이고 deleteMany 가 호출되지 않는다

[하지 말 것]
- DELETE 핸들러 신설 (화면이 이미 POST 로 초기화한다. 경로를 둘로 만들지 마라)
- 3단계 create 루프를 createMany 로 바꾸는 최적화 (별건, 이월 항목이다)
- SpecTable.tsx 의 handleReset 을 고치는 것 (서버가 고쳐지면 지금 코드가 옳아진다)
- dev 서버 기동으로 화면 확인

[커밋]
fix: AS-IS 스펙표 초기화가 실제로 DB 를 비우게 한다
본문에 왜를 적는다 — 조기 반환 때문에 화면만 비고 DB 는 그대로였다는 것, 그리고
zod 를 함께 넣지 않으면 잘못된 본문이 전량 삭제로 이어진다는 것.
```

---

## Task B — WS-3 를 WS-5 패턴으로 전환

```
docs/superpowers/plans/2026-08-31-worksheet-input-remediation.md 의 "Task B" 절을
읽고 그대로 수행하라.

[먼저 오해를 지운다]
이 작업은 "id 를 보존하는" 작업이 아니다. id 는 이미 세 단계 모두에서 보존된다.
직접 읽어 확인하라.
  - components/project/ProductAttributesTable.tsx:339  rows.map(r => ({...r, ...})) — id 를 실어 보낸다
  - lib/bulk-save-schemas.ts:86-88                     주석까지 있다: "id is preserved because
                                                       attribute fitnesses reference it"
  - app/api/projects/[id]/attributes/route.ts:96       {...attr, projectId} — 같은 id 로 다시 만든다

문제는 attributes/route.ts:90 의 deleteMany 가 보존할 행까지 지운다는 것이다.
캐스케이드로 AttributeFitness(WS-4)가 함께 사라지고, :95 의 createMany 가 같은 id 로
부모를 되살려도 이미 지워진 자식은 돌아오지 않는다.
고칠 곳은 스키마도 화면도 아니고 deleteMany 의 where 절이다.

[정본은 이미 저장소에 있다 — 새로 설계하지 마라]
app/api/projects/[id]/requirements/route.ts:80-147 이 정확히 그 형태다. 그것을 읽고 옮겨라.

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

update 가 아니라 updateMany 를 쓰는 이유가 있다. update 는 없는 행에 throw 하고,
where 에 projectId 를 함께 걸어야 남의 프로젝트 행을 id 만으로 덮어쓰는 것을 막는다.
이 형태를 그대로 가져와라. generateId 는 lib/id.ts 에 있다.

[할 일]
1. lib/import-cascade-guard.ts — countAttributeCascadeImpact 가 제출 id 를 보게 한다.
   - 시그니처를 (db, projectId, submittedIds?: string[]) 로 넓힌다
   - submittedIds 를 주지 않으면 지금과 똑같이 전량을 센다. 기존 호출부
     (import 계열 등 전체 교체가 진짜인 경로)를 깨지 않기 위해서다
   - AttributeCascadeCounter 인터페이스에 productAttribute.count 를 더한다.
     제출 id 로 살아남을 속성을 빼고 세야 한다
   - 이 파일은 순수 모듈이고 이미 stryker 대상이다(stryker.crap.config.json).
     mutation score 100% 를 유지해야 한다

2. app/api/projects/[id]/attributes/route.ts — 위 정본을 이식한다.
   - submittedIds 계산 → 지워질 기존 행 수 count → 0건이면 409 를 건너뛴다
   - 트랜잭션: deleteMany({ id: { notIn } }) → updateMany 시도 → 실패 시 create
   - createMany 는 사라진다. 응답의 findMany 는 그대로 둔다 (화면이 그것으로 재렌더한다)
   - 새 행 id 는 클라이언트가 attr_<ts>_<rand> 로 이미 만들어 보낸다
     (ProductAttributesTable.tsx:279). 없을 때만 서버가 generateId('attr') 로 채운다

3. tests/api-worksheet-cascade.test.ts 의 attributes 절(:162-230)을 고친다.
   - :185 '속성이 비어있지 않아도(전체 교체) 적합도가 있으면 409 로 막는다' 를 뒤집는다.
     이 단언은 우리가 고치려는 동작 그 자체다.
     새 이름: 'id 를 유지한 정상 편집은 적합도가 있어도 통과한다'
   - 유지: 빈 배열 전량 삭제는 적합도가 있으면 409
   - 유지: confirmCascade 면 진행
   - 신규: 새 id 로 전체 교체(AI 위저드 등)는 기존 행이 지워지므로 409
     (requirements 쪽 :127 과 대칭이다)
   - 신규: deleteMany 가 { projectId, id: { notIn: submittedIds } } 로 불린다
   - 신규: 기존 id 는 updateMany, 새 id 는 create 로 간다
   - 신규: updateMany 의 where 에 projectId 가 들어 있다 (교차 프로젝트 덮어쓰기 방지)

4. npx stryker run stryker.crap.config.json --mutate lib/import-cascade-guard.ts
   — score 100% 여야 한다. 생존 뮤턴트가 있으면 테스트를 더한다

[하지 말 것]
- leaf 워크시트로 확대 (팩토리 5개, improvements, assets, funding).
  FK 자식이 없어 얻는 것이 없고, tests/api-bulk-save-guards.test.ts:106,190 의
  '클라이언트가 보낸 id 는 저장되지 않는다' 단언과 정면으로 충돌한다.
  그 테스트를 고치지 마라. 그 단언은 leaf 워크시트에서 옳다.
- lib/row-sync.ts 같은 공용 모듈 신설. 적용 대상이 WS-3 하나뿐이라 지금은 과설계다
- WS-5(requirements)를 손대는 것. 이미 되어 있다
- 스키마·마이그레이션 변경. 필요 없다. prisma migrate 계열은 금지다
- 실DB 에 붙는 확인. npx prisma validate / generate 까지만

[커밋]
fix: 제품속성 저장이 적합도를 지우지 않게 한다
본문에 왜를 적는다 — id 는 이미 보존되고 있었고 문제는 보존할 행까지 지운 것이라는 점,
그리고 매번 뜨던 409 가 정상 편집에서 사라지므로 경고가 다시 읽히게 된다는 점.
```

---

## Task C — WS-3 스펙 선택기 병합 버그

```
docs/superpowers/plans/2026-08-31-worksheet-input-remediation.md 의 "Task C" 절을
읽고 그대로 수행하라.

[문제]
components/project/ProductAttributesTable.tsx:72-80 의 getRowSpan 은
숨김 판정과 계수 판정의 기준이 다르다.

    if (index > 0 && arr[index][key] === arr[index - 1][key]) return 0;   // core 비교 없음
    ...
    if (arr[i][key] === arr[index][key] && (key === 'core' || arr[i].core === arr[index].core)) count++;
    //                                      ↑ 세는 쪽에는 core 비교가 있다

core 가 다른데 sub 이름이 같은 인접 두 행에서
  - 위 행의 count 는 core 경계에서 멈춰 1
  - 아래 행은 0 을 받아 <td> 가 렌더되지 않는다
결과적으로 그 행의 세부기능 칸이 사라지고 오른쪽 열이 한 칸씩 밀린다.
"설치"·"관리" 같은 흔한 세부기능 이름이면 바로 재현된다.

[할 일]
1. 숨김 판정에 같은 조건을 더해 두 기준을 맞춘다.
   왜 그런지 한국어 주석으로 남겨라 — 두 판정의 기준이 어긋나면 그 칸이 아무에게도
   그려지지 않는다는 것.

2. 순수 함수로 뽑는다. 지금 getRowSpan 은 컴포넌트 안 클로저라 테스트할 수 없다.
   lib/product-attributes-utils.ts 로 옮기고 (rows, key, index) => number 로 export 한다.
   컴포넌트는 그것을 부르게 바꾼다.

3. tests/product-attributes-utils.test.ts 에 추가한다.
   - core 가 다르고 sub 이름이 같은 인접 두 행 → 두 행 모두 span >= 1 (회귀 본체)
   - 같은 core 안 연속 sub → 첫 행이 개수, 나머지 0
   - key: 'core' 는 core 만 본다
   - 빈 배열 · 단일 행

4. CRAP 게이트를 확인한다. 같은 파일의 buildSpecPickerRows 가 CRAP 29.5 이고
   .github/workflows/crap.yml:78 이 --fail-over=30 으로 PR 을 세운다. 여유가 0.5 뿐이다.
   분기를 더하는 만큼 테스트로 덮이는지 반드시 확인하라. 확신이 안 서면 QUESTIONS 에 적어라.

[하지 말 것]
- 검토서 §3 WS-3-2 의 "문자열 일치 병합" 자체를 바꾸는 것. 그것은 설계 이월 항목이다.
  이번엔 두 판정의 기준을 맞추는 것까지다
- buildSpecPickerRows 를 리팩터링하는 것. CRAP 최고값이라 게이트를 건드린다

[커밋]
fix: 스펙 선택기 행병합에서 세부기능 칸이 사라지던 문제
```

---

## Task D — 미저장 이탈 경고 (Task A·B 완료 후)

```
docs/superpowers/plans/2026-08-31-worksheet-input-remediation.md 의 "Task D" 절을
읽고 그대로 수행하라.

[문제]
beforeunload 가 저장소에 0건이다. 입력은 전부 로컬 state 이고 "저장" 클릭에만
영속화되므로, 탭을 닫거나 뒤로 가면 조용히 사라진다.

[가장 중요한 제약 — 일괄로 걸면 오탐이 난다]
모든 워크시트가 저장 버튼 방식인 것은 아니다. 직접 읽어 확인하라.
  - WS-7 Kano 가중치 : components/project/KanoAggregationTable.tsx:157  onBlur 즉시 저장
  - WS-9 QFD 관계 셀 : components/project/QFDMatrix.tsx:276             클릭 즉시 POST
이 둘에는 걸지 않는다. 걸면 저장이 끝난 상태에서도 경고가 뜬다.
대상은 저장 버튼 계열 13개다 (WS-2·3·5 및 팩토리 계열).

또 하나 — 워크시트 간 탭 전환은 이 훅으로 막을 수 없다. setActiveTab 에 의한
언마운트이지 라우터 이동이 아니라 beforeunload 도 Next 라우터 가로채기도 걸리지 않는다.
1차 범위에서 뺀다. 되는 것처럼 보고하지 마라.

[할 일]
1. lib/use-unsaved-changes.ts 신규 — useUnsavedChanges(isDirty: boolean)
   - beforeunload 등록/해제만 한다. 브라우저가 커스텀 문구를 무시하므로 문구는 넣지 않는다
   - isDirty 가 false 면 리스너를 아예 걸지 않는다

2. dirty 판정은 직렬화 결과 비교로 한다. 마지막 저장 성공 시점의 스냅샷과 현재 rows 를
   비교한다. onChange 마다 플래그를 세우는 방식은 "고쳤다가 되돌린" 경우에 오탐한다.

3. 13개 컴포넌트에 적용한다. 목록은 검토서 §1-3 표의 첫 줄이다.

4. 테스트. 훅은 DOM 이벤트를 다루므로 순수 부분(dirty 판정)을 lib/ 에 분리해 그쪽을
   단언한다. 최소: 스냅샷과 같으면 false, 한 셀이라도 다르면 true,
   고쳤다가 되돌리면 다시 false, 행 순서만 바뀌어도 true.

[하지 말 것]
- WS-7·WS-9 에 적용
- 탭 전환 가로채기 (1차 범위 밖)
- 자동 저장 도입 (별건이고 실DB 쓰기 정책과 얽힌다)

[커밋]
feat: 저장하지 않고 나가면 경고한다 (저장 버튼 계열 13개)
본문에 왜를 적는다 — 왜 13개뿐인지(즉시 저장 워크시트는 오탐), 왜 탭 전환은 못 막는지.
```

---

## 감리 판정 기준 — 보고서를 받았을 때 볼 것

| Task | 1순위 판정 표본 |
| --- | --- |
| A | **zod 가 같은 커밋에 있는가.** 없으면 반려 — 조기 반환만 지운 상태는 지금보다 나쁘다 |
| A | 잘못된 본문이 400 이고 `deleteMany` 가 **불리지 않는** 단언이 있는가 |
| B | `tests/api-bulk-save-guards.test.ts` 가 **수정되지 않았는가.** 수정됐다면 leaf 로 범위를 넘긴 것이다 |
| B | `updateMany` 의 `where` 에 `projectId` 가 있는가 (교차 프로젝트 덮어쓰기) |
| B | 새 id 전체 교체가 **여전히 409** 인가. 이걸 같이 풀어버리면 AI 위저드가 조용히 WS-4 를 지운다 |
| B | `import-cascade-guard.ts` mutation score 가 100% 인가 |
| C | CRAP 이 30 을 넘지 않는가 (여유 0.5) |
| C | `getRowSpan` 이 `lib/` 로 나와 테스트되는가. 컴포넌트 안에 남았으면 단언이 불가능하다 |
| D | WS-7·WS-9 에 붙지 않았는가 |
| D | 탭 전환도 막았다고 보고하지 않았는가 (막을 수 없다) |
| 공통 | VERIFIED BY 에 게이트 3종의 **출력 마지막 줄이 원문으로** 있는가 |
| 공통 | 작업 커밋과 보고서 커밋이 **둘로** 나뉘어 있고 `git status` 가 깨끗한가 |
