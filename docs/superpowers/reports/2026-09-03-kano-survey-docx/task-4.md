# Task 4 결과 보고서

## RESULT

계획서(`docs/superpowers/plans/2026-09-03-kano-survey-docx.md`) Task 4 의 Step 1·2·3 을 `components/project/KanoManager.tsx` 한 파일에 구현했다. [확정된 계약] 그대로다.

- **Step 1**: 질문 초기값 루프(구 143~152행)가 인라인 템플릿 대신 `resolveKanoQuestionPair(r)` 를 쓴다. `import { resolveKanoQuestionPair } from '@/lib/kano-survey-document';` 를 기존 import 블록(10행 `getKanoTopic` import 바로 아래)에 더했고, 루프 위 주석은 "기본 문구의 정본은 lib/kano-survey-document 다. 화면이 인쇄물(Word 설문지)과 어긋나면 안 되므로 같은 규칙으로 채운다" 로 갱신했다. `getKanoTopic` import 는 주제 헤더 표시(현 921행)가 아직 쓰므로 남겼다.
- **Step 2**: 「질문 저장」 버튼을 `<div className="flex items-center gap-2">` 로 감싸고 그 왼쪽에 `/api/projects/${projectId}/kano/survey-document` 내려받기 앵커를 두었다. **래퍼 `<div>` 여는 태그부터 `</a>` 까지(12행)는 계획서 Step 2 코드 블록과 바이트 단위로 동일하다**(VERIFIED BY 4 — Python 으로 계획서에서 뽑아 부분 문자열 일치 확인). `href`·`className`(`btn-secondary ...` + 저장 중 `' pointer-events-none opacity-50'`)·`aria-disabled={isSavingQuestions}`·`title`·svg path·문구 "설문지 Word 내려받기" 전부 계획서 그대로다. 기존 버튼의 속성·자식은 한 글자도 바꾸지 않았고 들여쓰기만 +4 됐다(래퍼 안으로 들어갔으므로 불가피하다).
- **Step 3**: 노란 안내문의 마지막 문장을 "저장된 질문이 미리보기, Google Forms, Word 설문지에 반영됩니다. 저장하지 않은 수정은 인쇄물에 나가지 않습니다." 로 바꿨다.

**의도된 미세 동작 변화(감리자 승인)**: 구 루프는 `||` 라 공백뿐인 저장값을 그대로 화면에 뿌렸지만, `resolveKanoQuestionPair` 는 trim 해서 기본 문구로 폴백한다. Task 1 에서 확정한 정본 규칙이며, 화면이 정본을 따라가는 것이 Step 1 의 목적이다.

계획서 Task 4 는 Step 1·2·3 을 `- [x]` 로 바꾸고, Step 4(게이트·화면 검증)는 `- [ ]` 로 두고 아래에 사유 인용문을 넣었다 — 게이트 3종은 사용자 로컬 몫, 화면 확인 3가지는 감리자 실계정 몫이라 **아직 돌지 않았다**는 내용이다. 이 컨테이너는 node_modules 가 없고 `.tsx`(JSX)는 node type stripping 으로 실행할 수 없어 이 Task 는 여기서 아무 실행 검증도 하지 못했다 — diff 정독과 바이트 비교가 게이트를 대신했다(RISKS 참고).

## FILES CHANGED

- `components/project/KanoManager.tsx` (수정, +30/−19) — 작업 커밋. git hunk 4개가 완료 판정의 3곳에 대응한다: (a) import 1줄 추가 hunk + 루프 교체 hunk(두 곳이 130여 행 떨어져 git 이 별개 hunk 로 낸다), (b) 버튼 감싸기 + 앵커 hunk, (c) 안내문 hunk. 이 밖의 줄은 바꾸지 않았다 — 948·965행이던 textarea placeholder 와 910행이던 topic 표시(현 921행)는 불변이다.
- `docs/superpowers/plans/2026-09-03-kano-survey-docx.md` (보고서 커밋) — Task 4 Step 1·2·3 `- [x]`, Step 4 `- [ ]` + 사유 인용문. 211행에 날 제어 바이트가 있어 Edit 도구를 쓰지 않고 Python 바이트 치환만 했다(치환 전 각 패턴 출현 횟수 1 을 assert). 고친 뒤 제어 바이트 줄이 여전히 `[211]` 하나뿐임을 확인했다. Task 1~3 의 체크박스는 건드리지 않았다.
- `docs/superpowers/reports/2026-09-03-kano-survey-docx/task-4.md` (이 파일, 보고서 커밋).

건드리지 않은 것: `lib/**`, `app/**`, `tests/**`, `package*.json`, `stryker.crap.config.json`, 기존 보고서(task-1~3), 계획서 211행, KanoManager.tsx 이외의 모든 코드. 새 상태·핸들러·의존성 없음.

## COMMIT

- 작업 커밋: `50b7e56 feat: WS-6 설문지 Word 출력 - 화면 내려받기 버튼과 기본 질문 정본 통일` (`components/project/KanoManager.tsx` 만)
- 보고서 커밋: 이 파일과 계획서 체크박스. 해시는 커밋 후 `git log` 로 확인한다(자기 자신의 해시를 본문에 넣을 수 없다 — Task 1~3 보고서와 같다).
- 기준 커밋 `17b9cee`, 브랜치 `claude/admin-account-password-recovery-o93xgy`. **push 하지 않았다.** amend·재작업 없음, 새 브랜치 없음. 보고서 커밋 후 origin 대비 +2, `git status` 깨끗, `git diff 17b9cee HEAD --name-only` 는 위 3개 파일이어야 한다(커밋 직후 확인).

## VERIFIED BY

이 환경에는 node_modules 가 없고 npm 레지스트리가 403 이라 `npx tsc --noEmit`·`npx vitest run`·`npx next lint` 를 실행할 수 없다(시도하지 않았다). `.tsx` 는 JSX 라 node type stripping 실행도 불가능해 Task 3 식 하네스도 없다. 아래가 이 컨테이너에서 가능한 전부다.

**1. diff hunk 수 — 작업 커밋의 변경이 3곳(git hunk 4개)뿐이다**

```
$ git diff 17b9cee 50b7e56 -- components/project/KanoManager.tsx | grep -c '^@@'
4
```

hunk 4개의 내용을 처음부터 끝까지 정독했다: ① 10행 뒤 import 1줄 추가, ② 루프 교체(주석 2줄 + `qMap[r.id] = resolveKanoQuestionPair(r);`, `const topic` 줄 삭제), ③ 버튼을 래퍼로 감싸고 앵커 추가(버튼 속성·자식 문자열 불변, 들여쓰기 +4), ④ 안내문 한 문장 교체. 그 외 변경 없음.

**2. grep 수치**

```
$ grep -c "getKanoTopic" components/project/KanoManager.tsx
2        # 10행 import + 921행 사용
$ grep -c "resolveKanoQuestionPair" components/project/KanoManager.tsx
2        # 11행 import + 148행 사용
```

주의: 변경 전 `getKanoTopic` 카운트는 위임 프롬프트의 3이 아니라 **4**였다 — 구 143행 주석("없으면 getKanoTopic 기반 기본값")에도 그 문자열이 있었기 때문이다. 사라진 것은 146행 사용 + 143행 주석 언급 두 건이고, 목표 상태(import + 910행 사용 = 2)는 판정 기준 그대로 만족한다. DEVIATIONS 2 참고.

**3. 앵커 블록이 계획서 Step 2 코드 블록과 바이트 동일**

```
plan snippet lines: 12
present in component byte-for-byte: True    # <div className="flex items-center gap-2"> ~ </a>
loop block found in plan and comp: True     # for (const r of reqs) { qMap[r.id] = resolveKanoQuestionPair(r); }
import line in comp: True
```

(Python 으로 계획서에서 래퍼 여는 태그~`</a>` 를 뽑아 컴포넌트 파일에 부분 문자열로 존재하는지 확인. 루프 3줄과 import 1줄도 같은 방식.)

**4. 안내문·앵커 판정 문구**

```
Word 설문지 in comp: True   # "저장된 질문이 미리보기, Google Forms, Word 설문지에 반영됩니다. 저장하지 않은 수정은 인쇄물에 나가지 않습니다." 전문 일치
```

**5. `npm run check:encoding`**

```
> kano-qfd-webapp@0.1.0 check:encoding
> node scripts/check-text-encoding.mjs

한글 인코딩 검사 통과.
exit=0
```

(KanoManager.tsx 수정 후 1회, 계획서·보고서 수정 후 보고서 커밋 직전에 다시 1회 — 두 번 다 통과.)

**6. 제어 바이트 검사** (0x09 제외 0x20 미만 바이트가 있는 줄 번호)

```
components/project/KanoManager.tsx []
docs/superpowers/plans/2026-09-03-kano-survey-docx.md [211]
```

(계획서는 체크박스 치환 후 재검사해 같은 결과. 이 보고서 자신도 커밋 직전 `[]` 확인.)

**7. 무회귀·상태**

```
$ ls tests/*.test.ts | wc -l
98
$ git status --short          # 작업 커밋 직후
 M docs/superpowers/plans/...  # (계획서는 보고서 커밋 몫이라 예정대로 남아 있었다)
```

계획서 체크박스 상태는 `grep -an "^- \[.\] \*\*Step"` 으로 확인: Task 1 Step 5 와 Task 4 Step 4 만 `- [ ]`, 나머지 13개 전부 `- [x]` — Task 1~3 의 기존 상태를 건드리지 않았다.

## DEVIATIONS

**1) 코드에서 계획서·[확정된 계약]과 다른 곳은 없다.** 앵커 블록은 바이트 동일(VERIFIED BY 3), 루프·import·안내문은 계약 문구 그대로다. Ask First 항목(계획서 코드 변경, placeholder·topic 표시 변경, 새 상태·핸들러·의존성)은 발생하지 않았다.

**2) [작업 방식]의 "grep -c 3→2" 는 실측으로 "4→2" 였다.** 변경 전 파일의 구 143행 주석에 "getKanoTopic" 문자열이 들어 있어 위임 프롬프트가 센 3(코드 좌표 기준)보다 1 많았다. 코드 사용처 기준으로는 예측대로 줄었고(146행 사용 소멸, 10행 import·910행 사용 잔존), 최종값 2 는 완료 판정 그대로다.

**3) 루프 주석은 계약의 예시 문구를 그대로 옮기지 않고 두 줄로 다듬었다.** 계약이 "예:" 로 예시만 준 자리라 뜻(정본이 모델로 옮겨졌고 인쇄물과 어긋나면 안 된다)을 유지하며 파일 문맥에 맞게 적었다.

**4) 커밋 트레일러는 `CLAUDE.md` 의 `Claude Opus 5` 가 아니라 위임 프롬프트가 지정한 두 줄(`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` + `Claude-Session: ...`)을 썼다.** Task 3 보고서 DEVIATIONS 2 와 같은 사정이다.

**5) 계획서 Step 4 인용문은 Task 2·3 의 "게이트 기록" 문장이 아니라 "미실행" 사유문이다.** 위임 프롬프트 지시대로, 게이트가 아직 돌지 않았고 사용자 로컬·감리자 실계정 몫임을 적었다.

## RISKS

- **(a) 이 컨테이너에서 tsc·vitest·lint·렌더 어느 것도 실행하지 못했다.** node_modules 가 없고 레지스트리가 403 이며, `.tsx`(JSX)는 node type stripping 으로 실행조차 안 된다 — 이 Task 의 변경은 여기서 **한 번도 실행되지 않았다**. 특히 미확인인 것: `resolveKanoQuestionPair(r)` 의 인자 타입 정합(`reqs` 는 `reqData.requirements || []` 라 사실상 `any` 여서 tsc 는 통과할 공산이 크지만 실측이 아니다), JSX 문법·lint 규칙, `@/lib/kano-survey-document` 를 클라이언트 컴포넌트(`'use client'`)가 import 할 때의 번들 동작(그 모듈은 순수이고 `./utils/korean-utils`·`./kano-response-display` 만 끌어와 문제 없어 보이지만 빌드로 본 것은 아니다). 게이트 3종은 사용자 로컬에서 돌아야 하고, 그때까지 이 Task 는 미검증이다.
- **(b) 화면 3단계(버튼 존재·내려받기 동작·실브라우저 렌더)는 감리자 실계정 검증 몫이다.** 계획서 Step 4 의 확인 3가지(파일 내려받기와 Word·HWP 열림, 양식 구조, 저장/미저장 반영)를 나는 하나도 수행하지 못했다. dev 서버는 지시대로 기동하지 않았다.
- **(c) trim 폴백 동작 변화가 실화면에서 보이는지 미확인이다.** 공백뿐인 저장값을 가진 요구사항이 실DB에 있다면 그 행의 표시 문구가 저장값(공백)에서 기본 문구로 바뀐다 — 승인된 정본 규칙이지만, 실데이터에 그런 행이 있는지·화면이 기대대로 보이는지는 감리자 확인 몫이다.
- **(d) 그 밖의 미확인.** ① 저장 중 앵커 잠금은 `pointer-events-none` + `aria-disabled` 라 포인터만 막는다 — 키보드 포커스 후 Enter 는 막히지 않는다(계획서 코드 그대로이며 바꾸지 않았다, QUESTIONS 1). ② `btn-secondary`(`app/globals.css:91`) 가 이 어두운 카드 헤더에서 시각적으로 어울리는지는 실브라우저 몫이다. ③ 내려받기는 저장된 값만 나가므로 편집 중 내려받으면 화면과 파일이 다를 수 있다 — 안내문 둘째 문장이 이를 알리지만 사용자가 읽는지는 별개다. ④ 좁은 화면에서 h2 와 버튼 두 개가 한 줄(`justify-between`)에 놓일 때 줄바꿈 거동 미확인. 하지 않은 것을 했다고 적지 않았다.

## QUESTIONS

1. (Ask First 지시대로 바꾸지 않고 적는다) 948·965행이던 textarea placeholder 는 여전히 인라인 템플릿(`${topic}(이)라면...`)이라 기본 문구 규칙이 정본과 한 곳 더 중복된다. placeholder 는 상태가 빈 문자열일 때만 보여 실사용상 드물지만, 정본 문구가 바뀌면 어긋난다. 후속 Task 에서 `resolveKanoQuestionPair({ requirement: req.requirement })` 로 통일할지 감리자 판단을 구한다.
2. 저장 중 앵커의 키보드 활성화(RISKS d-①)를 실제로 막으려면 `tabIndex={-1}` 또는 조건부 `onClick preventDefault` 가 필요하다. 계획서 코드에 없어 넣지 않았다 — 필요하면 후속 지시를 달라.
