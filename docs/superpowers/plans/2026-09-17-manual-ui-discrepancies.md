# 화면과 실제 동작의 불일치 정리 Implementation Plan

> **For agentic workers:** 이 계획서가 각 Task 의 정본이다. Step 은 체크박스(`- [ ]`)로
> 추적하고, 완료 시 `- [x]` 로 갱신해 코드와 함께 커밋한다.

**Goal:** 사용 매뉴얼(`docs/manual/`)을 쓰면서 확인한 **화면 표시와 실제 동작이 어긋나는
16 곳**을 고친다. 안내 문서에 그대로 옮기면 사용자를 잘못 이끄는 항목들이라, 문서를
고치는 대신 화면을 사실에 맞춘다.

## 배경

매뉴얼 부록 E(`docs/manual/13-appendix.md`)에 같은 목록이 있다. 문서는 현재 동작을
그대로 적고 주의를 달아 두었으므로, 이 계획의 각 항목을 고칠 때 **부록 E 의 해당 줄과
본문의 주의 문구를 함께 지운다.** 둘이 갈리면 문서가 다시 거짓말을 하게 된다.

모든 항목은 코드로 확인했다. 재조사하지 말고 아래 좌표를 그대로 쓴다.

## ⚠️ 환경 제약

`CLAUDE.md` 의 최우선 제약을 그대로 따른다.

- **dev 서버를 띄우지 않는다.** 신설 화면이라도 실기동 검증은 감리자가 맡는다.
- **DB 에 쓰는 명령을 실행하지 않는다.** `.env` 의 `POSTGRES_PRISMA_URL` 은 실데이터가
  있는 원격 Supabase 다.
- 검증은 `npx tsc --noEmit`, `npx vitest run`, `npx next lint` 세 게이트와 DOM 테스트로
  한다.
- 이 저장소에서 확인된 사항 하나. 원격 컨테이너에서는 npm 레지스트리가 프록시에서
  403 으로 막혀 `npm ci` 가 실패한다. 게이트는 의존성이 설치된 환경에서 돌린다.

## 먼저 정할 것

아래 다섯 가지는 **사용자 결정이 필요하다.** 결정 전에는 Task C-2, Task E 를 시작하지
않는다. 나머지 Task 는 결정과 무관하게 진행할 수 있다.

| 번호 | 무엇을 정하나 | 권고 |
| --- | --- | --- |
| 결정 1 | 팀원 제외를 누구에게 허용할 것인가 (A-2) | **소유자만.** 초대와 같은 권한으로 맞춘다 |
| 결정 2 | 관리자 개요의 시스템 정보 카드를 살릴 것인가 (B-3) | **카드를 제거한다.** 실제 점검이 필요하면 별도 과제 |
| 결정 3 | WS-16 자금 AI 초안을 열 것인가 (C-2) | **연다.** 로직과 테스트가 이미 있다 |
| 결정 4 | 가져오기 이력 조회 화면을 만들 것인가 (C-4) | **만들지 않는다.** 감사 기록으로만 남긴다 |
| 결정 5 | WS-4 와 WS-7 의 두 벌 화면을 어떻게 정리할 것인가 (E) | 아래 Task E 참고. **데이터가 걸려 있어 결정 없이 손대지 않는다** |

---

## Task A — 잘못 동작하는 UI

사용자가 실제로 막히는 결함이다. 우선순위가 가장 높다.

**A-2 를 먼저 한다.** 세 건 중 유일하게 접근 권한이 걸린 문제다. 나머지 둘은 사용자가
불편을 겪거나 저장 실패를 놓치는 것이지만, A-2 는 **잘못 초대한 편집자의 쓰기 권한을
거둘 방법이 없는 상태**다.

### A-1. 팀원 초대의 Coach 선택은 반드시 실패한다

**증상.** 프로젝트 설정 → 팀원 초대에서 역할을 "💬 Coach - 코멘트만" 으로 고르면
`Only EDITOR can be invited.` 영문 오류가 뜨고 초대가 실패한다.

**원인.** 서버가 옳고 화면이 틀렸다. `app/api/projects/[id]/members/route.ts:12-17` 에
이유가 주석으로 남아 있다.

```ts
// 팀 초대로는 EDITOR(편집자)만 붙인다. 멘토(COACH) 배정은 대상의 시스템 역할을
// 검사하는 POST /api/projects/[id]/mentors 로만 해야 하므로 여기서 제외한다.
role: z.enum(['EDITOR'], {
    errorMap: () => ({ message: 'Only EDITOR can be invited.' }),
}),
```

멘토는 시스템 역할 검사를 거쳐야 붙일 수 있으므로 **서버 규칙을 바꾸면 안 된다.**
화면에서 고를 수 없게 한다.

**수정.** `app/project/[id]/settings/page.tsx`

- `:34` `const [inviteRole, setInviteRole] = useState<'EDITOR' | 'COACH'>('EDITOR');` 를
  제거한다.
- `:89` `role: inviteRole,` 를 `role: 'EDITOR',` 로 바꾼다.
- `:493-505` 의 `<select>` 를 고정 표시와 안내로 바꾼다.

```tsx
<div>
    <label className="block text-sm font-medium text-gray-300 mb-2">역할</label>
    {/* 서버가 EDITOR 만 받는다(app/api/projects/[id]/members/route.ts). 코치(멘토)는
        시스템 역할을 검사하는 멘토 배정으로만 붙이므로 여기서 고르게 하지 않는다. */}
    <p className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white">
        ✏️ Editor - 편집 권한
    </p>
    <p className="text-xs text-gray-500 mt-2">
        코치(멘토)는 관리자 또는 프로그램 매니저의 멘토 배정으로만 연결됩니다.
    </p>
</div>
```

**Steps**

- [ ] 실패를 재현하는 DOM 테스트를 먼저 추가한다. 초대 모달에 Coach 선택지가 없고
      제출 본문의 `role` 이 항상 `EDITOR` 인지 검증한다.
- [ ] 위 세 곳을 고친다.
- [ ] `tests/api-project-members.test.ts` 가 서버의 EDITOR 전용 계약을 그대로 지키는지
      확인한다. **서버 계약은 바꾸지 않는다.**
- [ ] `docs/manual/05-mentee.md` 5.4 절의 Coach 경고 문단과 부록 E 해당 줄을 지운다.

**위험.** 낮다. 화면에서 고를 수 없던 값을 제거하는 것이므로 기존 동작이 줄지 않는다.

### A-2. 팀원을 뺄 수 있는 방법이 아예 없다

**증상.** `app/project/[id]/settings/page.tsx:354-358` 의 🗑️ 버튼에 `onClick` 이 없다.
눌러도 아무 일이 없다.

```tsx
{member.role !== 'OWNER' && (
    <button className="text-gray-400 hover:text-red-400 transition-colors">
        🗑️
    </button>
)}
```

**이것은 버튼 하나의 문제가 아니다.** 저장소를 전수 확인한 결과 **팀원 한 명을 빼는
경로가 코드 어디에도 없다.**

| 확인한 것 | 결과 |
| --- | --- |
| `app/api/projects/[id]/members/route.ts` | `POST`(`:21`)와 `GET`(`:113`)뿐. `DELETE` 가 없다 |
| 코드 전체의 `projectMember` 삭제 호출 | `lib/project-transfer.ts:122` 한 곳뿐 |
| 그 한 곳이 하는 일 | 관리자의 소유권 이전 중 **옛 소유자와 대상 멘티 행만** 정리한다 |
| 그 밖의 삭제 | `ProjectMember` 의 `onDelete: Cascade` 로 **회원 계정이나 프로젝트를 통째로 지울 때만** 사라진다 |

따라서 지금 잘못 초대한 편집자를 빼려면 **그 사람의 계정을 지우거나 프로젝트를 통째로
지우는 수밖에 없다.** 관리자에게 요청해도 같다. 관리자 화면에도 팀원 단위 제외 기능이
없다.

**그래서 버튼 제거는 답이 아니다.** 잘못 초대한 편집자가 프로젝트에 대한 쓰기 권한을
영구히 갖는다. 화면에서 버튼만 사라지고 접근 권한을 회수할 수단이 없는 상태는 그대로
남는다. 초대는 되는데 회수는 안 되는 비대칭 자체가 결함이다.

**수정 — DELETE 라우트를 만들고 버튼을 잇는다.**

다행히 범위가 작다. `ProjectMember` 에 딸린 하위 데이터가 없어 정리할 것이 없다.
워크시트와 코멘트는 프로젝트에 속하므로 제외해도 남는다. 접근 권한은 요청마다
`resolveProjectRole` 이 계산하므로 **제외 즉시 반영되고 세션을 따로 끊을 필요가 없다.**

서버는 `app/api/projects/[id]/members/route.ts` 에 다음을 더한다.

```ts
// DELETE: 팀원 제외
//
// 초대(POST)만 있고 회수가 없으면 잘못 초대한 편집자의 쓰기 권한을 거둘 방법이
// 계정 삭제나 프로젝트 삭제뿐이 된다. 초대와 같은 권한으로 회수도 할 수 있게 한다.
// 접근 권한은 요청마다 resolveProjectRole 이 계산하므로 제외는 즉시 반영된다.
export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { roles: ['OWNER'] });
    if (accessResult instanceof NextResponse) return accessResult;
    const { userId: requesterId } = accessResult.user;

    try {
        const { userId } = removeSchema.parse(await request.json());

        // roles: ['OWNER'] 를 통과했으므로 요청자가 곧 소유자다. 소유자는 멤버 행이
        // 아니라 프로젝트 자체에 붙으므로 제외 대상이 아니며, 허용하면 소유자가 자기
        // 프로젝트에서 스스로 잠기는 길이 열린다.
        if (userId === requesterId) {
            return NextResponse.json({ error: '프로젝트 소유자는 제외할 수 없습니다.' }, { status: 400 });
        }

        // 같은 버튼을 두 번 눌러도 안전하도록 조건부 삭제로 처리하고 건수로 판정한다.
        const removed = await prisma.projectMember.deleteMany({ where: { projectId, userId } });

        if (removed.count === 0) {
            return NextResponse.json({ error: '이 프로젝트의 팀원이 아닙니다.' }, { status: 404 });
        }

        // 이메일은 남기지 않는다(lib/logger.ts 규칙).
        log.info('팀원 제외', { projectId, removedUserId: userId });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        log.error('팀원 제외 오류', error);
        return NextResponse.json({ error: '팀원 제외 중 오류가 발생했습니다.' }, { status: 500 });
    }
}
```

**프로젝트를 다시 조회하지 않는다.** `requireProjectAccess` 가 프로젝트 부재를 이미
404 로 거르고(`lib/authorization.ts:125-127`), `roles: ['OWNER']` 를 통과했다는 것은
`resolveProjectRole` 이 요청자를 소유자로 판정했다는 뜻이다. 따라서 요청자 id 가 곧
소유자 id 이고, 소유자 확인을 위한 두 번째 질의는 도달할 수 없는 방어 코드가 된다
(`AGENTS.md` 의 단순성 규칙).

대상은 `ProjectMember.id` 가 아니라 **`userId` 로 지정한다.** `GET` 이 소유자를
`id: 'owner'` 라는 가짜 행으로 끼워 넣기 때문에(`:138-146`) 행 id 는 키로 쓰기에
불안정하고, 스키마의 `@@unique([projectId, userId])` 가 userId 를 자연 키로 만든다.

```ts
const removeSchema = z.object({
    userId: z.string().min(1, '제외할 팀원을 선택하세요.'),
});
```

화면은 버튼에 확인 절차를 붙인다. **무엇이 벌어지는지 말해야 한다.**

```tsx
{member.role !== 'OWNER' && (
    <button
        onClick={() => void handleRemoveMember(member.userId, member.name || member.email)}
        disabled={removingUserId === member.userId}
        className="text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
        aria-label={`${member.name || member.email} 팀원 제외`}
    >
        {removingUserId === member.userId ? '제외 중...' : '🗑️'}
    </button>
)}
```

확인 문구는 이렇게 한다.

> {이름} 님을 팀원에서 제외할까요? 이 프로젝트에 더 이상 접근할 수 없습니다. 작성한
> 내용은 그대로 남습니다.

**Steps**

- [x] 결정 1 을 확인한다. **사용자가 소유자(멘티) 권한으로 정했다.** 초대와 같은
      `roles: ['OWNER']` 게이트를 쓴다. 시스템 관리자는 이 경로로 제외할 수 없다.
- [x] `tests/api-project-members.test.ts` 에 RED 테스트를 먼저 추가한다. 정상 제외,
      소유자 권한 아님, 소유자 본인 제외, 비팀원 userId, userId 누락, 응답에 이메일
      미포함 여섯 가지를 덮는다.
- [x] `DELETE` 핸들러를 더한다. 기존 `POST`·`GET` 의 계약은 건드리지 않는다.
- [x] 화면의 버튼에 확인 창과 처리 중 표시를 잇고, 성공 후 목록을 다시 불러온다.
      실패는 목록 위 붉은 배너로 알린다.
- [x] 제외 뒤 접근이 막히는지 확인한다. **새 테스트를 만들지 않았다.**
      `tests/authorization.test.ts:140` 의 `rejects a non-member` 가 멤버 행이 없는
      사용자의 접근 거부를 이미 고정하고 있으며, 제외 후 상태가 정확히 그 상태다.
- [x] 제외해도 워크시트 코멘트와 작성물이 남는지 확인한다. **테스트를 만들지 않았다.**
      `ProjectMember` 를 참조하는 하위 모델이 스키마에 없어 구조적으로 지워질 것이
      없다. 코멘트는 `WorksheetComment.authorId` 로 사용자에 붙고 프로젝트에 속한다.
- [x] 매뉴얼 `docs/manual/05-mentee.md` 5.4 절의 휴지통 주의 문구를 새 동작 설명으로
      바꾸고 부록 E 줄을 지운다.
- [ ] **남은 일.** 프로젝트 설정 화면의 DOM 테스트가 없다. 확인 창 취소 시 요청이
      나가지 않는 것과 처리 중 중복 클릭이 막히는 것을 화면 수준에서 고정해야 한다.
      이 저장소 컨테이너에서 게이트를 돌릴 수 없어(아래 참고) 검증 못 할 테스트를
      추가하지 않았다.

**위험.** 중간이다. 접근 권한을 거두는 기능이라 잘못 만들면 남의 프로젝트에서 팀원을
뺄 수 있게 된다. 권한 검사를 `POST` 와 같은 `roles: ['OWNER']` 로 두고, 소유자 본인과
비팀원 userId 를 반드시 막는다.

**범위 밖.** 멘토는 `ProjectMember` 가 아니라 `MentorAssignment` 로 붙으므로 이
기능으로 빠지지 않는다. 멘토 해제는 관리자·매니저의 멘토 배정 화면에서 한다. 화면
안내에도 이 구분을 적는다.

### A-3. WS-15 저장 실패가 화면에 표시되지 않는다

**증상.** 저장에 실패해도 아무 표시가 없다. 사용자는 저장된 줄 알고 화면을 떠난다.

**원인.** `components/project/AssetsTable.tsx:62-79` 가 성공만 알린다.

```tsx
if (res.ok) {
    alert('저장되었습니다.');
    loadData();
}
} catch (error) {
    console.error('Failed to save assets:', error);
}
```

**수정.** 실패도 알린다.

```tsx
const handleSave = async () => {
    setIsSaving(true);
    try {
        const res = await fetch(`/api/projects/${projectId}/assets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assets })
        });
        // 성공만 알리면 실패가 조용히 묻힌다. 저장된 줄 알고 화면을 떠나는 사고를 막는다.
        if (!res.ok) {
            alert('저장에 실패했습니다. 잠시 후 다시 시도하세요.');
            return;
        }
        alert('저장되었습니다.');
        loadData();
    } catch (error) {
        console.error('Failed to save assets:', error);
        alert('저장 결과를 확인하지 못했습니다. 연결 상태를 확인하세요.');
    } finally {
        setIsSaving(false);
    }
};
```

**Steps**

- [ ] 저장 실패와 통신 실패에서 각각 안내가 뜨는 DOM 테스트를 먼저 추가한다.
- [ ] 위 함수를 고친다.
- [ ] 매뉴얼 `docs/manual/07-worksheets.md` 7.14 절의 주의 문단과 부록 E 줄을 지운다.

**참고.** 다른 워크시트는 토스트를 쓴다. 이 화면만 알림 창인 것도 일관성 문제지만
**이번 범위에서는 실패 표시만 고친다.** 토스트 전환은 화면 구조를 건드리므로 별도로
다룬다.

---

## Task B — 사실과 다른 안내 문구

동작은 맞는데 화면의 설명이 틀린 곳이다.

### B-1. 서비스 설정의 저장 위치 경고가 옛 구현 문구다

**증상.** Google 과 SMTP 설정 폼 아래에 같은 경고가 있다.

> ⚠️ 서버 메모리에만 저장되며, 재시작 시 다시 입력해야 합니다.

**원인.** `app/settings/page.tsx:319` 와 `:424`. 실제로는 `lib/service-settings.ts` 가
설정을 암호화해 `ServiceSetting` 테이블에 저장한다. 같은 파일 머리 주석에 왜 DB 로
옮겼는지가 적혀 있다.

**수정.** 두 줄을 사실에 맞게 바꾼다.

```tsx
<p className="text-sm text-gray-400">저장한 값은 암호화되어 데이터베이스에 보관됩니다. 입력칸을 비워 두면 기존 값이 유지됩니다.</p>
```

경고 색(`text-yellow-300`)도 함께 내린다. 경고할 일이 아니라 안내다.

**Steps**

- [ ] 두 곳의 문구와 색을 바꾼다.
- [ ] 문구가 남아 있지 않은지 `grep -n "서버 메모리에만" app/settings/page.tsx` 로 확인한다.
- [ ] 매뉴얼 3.10 절의 "알아 둘 화면 문구 차이" 절과 부록 E 줄을 지운다.

**위험.** 없다. 표시 문구만 바뀐다.

### B-2. 새 프로젝트의 사업계획서 형식 안내가 실제와 다르다

**증상.** 대시보드의 새 프로젝트 모달에 "PDF, DOC, DOCX, TXT (최대 10MB)" 라고 적혀
있지만 XLSX 와 XLS 도 받는다. 엑셀 양식으로 개요를 자동으로 채우는 기능이 있는데도
사용자가 엑셀을 올릴 수 있는지 알 수 없다.

**원인.** `app/dashboard/page.tsx:588` 의 안내가 `lib/business-plan-file.ts` 의 실제
허용 목록과 갈라져 있다. 프로젝트 개요 화면은 이미 여섯 종을 적고 있어 화면끼리도
다르다.

**수정.** 문구를 상수로 올려 한 곳에서 관리한다. `lib/business-plan-file.ts` 에 추가한다.

```ts
/** 화면 안내에 쓰는 허용 형식·크기 문구. 실제 허용 목록과 갈라지지 않게 한 곳에 둔다. */
export const BUSINESS_PLAN_FILE_HINT = 'PDF, DOC, DOCX, TXT, XLSX, XLS · 최대 10MB';
```

`app/dashboard/page.tsx:588` 과 프로젝트 개요 화면의 같은 안내를 이 상수로 바꾼다.

**Steps**

- [ ] 상수를 추가하고 두 화면에서 쓴다.
- [ ] 상수와 `MIME_BY_EXTENSION` 의 확장자 목록이 어긋나면 실패하는 단위 테스트를
      추가한다. 다음에 형식이 늘어도 안내가 따라오게 한다.
- [ ] 매뉴얼 `docs/manual/05-mentee.md` 5.3 절의 형식 차이 주의와 부록 E 줄을 지운다.

### B-3. 관리자 개요의 시스템 정보가 고정 표시다

**증상.** "저장소 / 버전 / 환경 / 상태" 네 줄이 실제 점검 결과처럼 보이지만
`app/admin/page.tsx:748-751` 에 박혀 있는 값이다. 운영 환경에서도 "환경 = 개발 모드",
"상태 = 정상 작동" 이 그대로 나온다.

**결정 2 가 필요하다.**

**권고안 — 카드를 제거한다.** 장애 판단에 쓸 수 없는 값을 상태처럼 보여 주는 것이
위험하다. 실제 점검이 필요하면 DB 연결과 SMTP·Google 설정 여부를 확인하는 상태
엔드포인트를 따로 만드는 편이 맞다.

**Steps**

- [ ] 결정 2 를 확인한다.
- [ ] (제거안) `app/admin/page.tsx` 의 시스템 정보 카드 블록을 지운다.
- [ ] (유지안을 고른 경우) 이 Task 를 중단하고 상태 점검 엔드포인트 설계를 먼저 한다.
      값마다 근거가 있어야 하며 "정상 작동" 은 무엇을 확인한 결과인지 정의해야 한다.
- [ ] 매뉴얼 3.2 절의 주의 문단과 부록 E 줄을 지운다.

### B-4. 서비스 설정의 AI 탭 이름이 내용과 다르다

**증상.** 탭 이름이 "AI 엔진 / 멘토링 기능" 이라 서비스 전체 설정처럼 보이지만,
내용은 지금 로그인한 본인의 AI 연결 카드 하나뿐이다.

**원인.** `app/settings/page.tsx:232-233` 의 라벨과 `:462-464` 의 내용이 맞지 않는다.

```tsx
{activeTab === 'ai' && (
    <PersonalAiConnection />
)}
```

**수정.** 탭 이름을 내용에 맞춘다.

```tsx
<p className="font-medium text-sm">내 AI 연결</p>
<p className="text-xs opacity-70">개인 키 · 로컬 · 원격</p>
```

**Steps**

- [ ] 탭 라벨 두 줄을 바꾼다.
- [ ] 매뉴얼 3.10 절의 탭 표와 부록 E 줄을 갱신한다.

**참고.** 전역 AI 엔진 설정은 API(`POST /api/settings` 의 `ai` 필드)와
`lib/service-settings.ts` 에는 있으나 화면이 읽지도 보내지도 않는다. 전역 설정 화면을
만들지 여부는 이번 범위 밖이며, 만들기로 하면 그때 탭을 다시 나눈다.

---

## Task C — 연결되지 않은 기능

만들어져 있는데 화면에 이어지지 않은 것들이다.

### C-1. WS-7 그래프의 클릭 선택 — 이미 계획서가 있다

**상태.** `docs/superpowers/plans/2026-09-08-timko-overlap-click-select.md` 가 이 문제를
정확히 다루고 있다. 체크박스 13 개가 **모두 미완이고 결과 보고서도 없다.** 계획만
커밋되고 실행되지 않았다.

**하지 말 것.** 이 계획서에서 다시 설계하지 않는다. 중복 계획은 둘 다 썩는다.

**Steps**

- [ ] 기존 계획서 `2026-09-08-timko-overlap-click-select.md` 를 그대로 실행한다.
- [ ] 완료 후 매뉴얼 7.7 절의 "눌러도 아무 일도 일어나지 않는다" 주의와 부록 E 줄을
      지운다.

### C-2. WS-16 자금 AI 초안이 만들어져 있는데 버튼이 꺼져 있다

**증상.** `components/project/FundingTable.tsx:176-178` 의 버튼이 항상 비활성이다.

```tsx
<button type="button" disabled className="btn-secondary text-sm ...">
    AI 초안 (사용 중지)
</button>
```

**중요한 사실.** 기능이 없어서 끈 것이 아니다. `lib/funding-ai-agent.ts` 의
`generateFundingAiDraft` 가 구현되어 있고 `tests/funding-ai-agent.test.ts` 가 빈 칸
채우기와 합계 갱신, 조달 금액 배분까지 검증한다. 다만 **화면에서 부르는 곳이 없다.**
현재 화면은 같은 파일의 `parseSourceYear` 만 쓴다.

**결정 3 이 필요하다.**

**권고안 — 연다.** 로직과 테스트가 이미 있으므로 화면 연결만 하면 된다. 규칙 기반
계산이라 외부 AI 호출이 없고 요금도 들지 않는다.

**Steps**

- [ ] 결정 3 을 확인한다.
- [ ] (연결안) `generateFundingAiDraft` 의 입력과 출력 모양을 읽고, 현재 화면 상태
      (`plans`, `sources`)를 그대로 넣고 받을 수 있는지 확인한다.
- [ ] (연결안) 버튼의 `disabled` 를 풀고 초안을 화면 상태에 반영한다. **초안 반영은
      저장이 아니다.** 반영 뒤 "초안을 채웠습니다. 확인 후 저장하세요." 안내를 띄우고
      사용자가 저장을 누르게 한다.
- [ ] (연결안) 이미 값이 있는 칸을 덮어쓰지 않는지 DOM 테스트로 고정한다.
- [ ] (제거안을 고른 경우) 버튼을 지운다. `generateFundingAiDraft` 와 그 테스트는
      **지우지 않고 보고만 한다**(`AGENTS.md` 의 죽은 코드 처리 규칙).
- [ ] 매뉴얼 7.15 절의 "항상 비활성" 문장과 부록 E 줄을 갱신한다.

### C-3. 가져오기 이력에 조회 화면이 없다

**증상.** 엑셀 반영에 성공하면 `migration_histories` 에 기록되지만
(`app/api/projects/[id]/import/route.ts`) 이를 보여 주는 화면과 조회 API 가 없다.
사용자에게 보이는 곳은 관리자가 회원을 지울 때의 확인 문구 한 줄뿐이다.

**결정 4 가 필요하다.**

**권고안 — 만들지 않는다.** 이 기록은 개인정보 파기 안내에 쓰이는 감사 기록이고,
무엇이 반영됐는지는 워크시트 내용으로 확인할 수 있다. 조회 화면을 만들면 파일명과
가져온 사람이 노출되므로 권한 설계가 따로 필요하다.

**Steps**

- [ ] 결정 4 를 확인한다.
- [ ] (권고안) 코드 변경 없음. 매뉴얼 9.2 절에 이미 "조회 화면이 없다" 고 적혀 있으므로
      그대로 둔다. 부록 E 에서는 이 줄을 "의도된 동작" 으로 옮긴다.
- [ ] (구현안을 고른 경우) 별도 계획서를 쓴다. 조회 권한, 표시 항목, 보존 기간을
      먼저 정해야 한다.

---

## Task D — 문구와 명칭의 일관성

같은 것을 화면마다 다르게 부르는 곳이다. 사용자 혼란과 문서 관리 비용을 만든다.

### D-1. Kano 기본 질문 문구가 두 벌이다

**증상.** 질문을 저장하지 않으면 경로마다 다른 문장이 나간다.

| 경로 | 기본 문구 |
| --- | --- |
| WS-6 화면, Word 설문지, 오프라인 HTML, Apps Script | `{주제}(이)라면 어떻게 생각하십니까?` |
| 온라인 응답 화면 | `만약 {요구사항} 기능이 있다면 어떻게 느끼시겠습니까?` |

**원인.** 정본은 `lib/kano-survey-document.ts:63-69` 의 `resolveKanoQuestionPair` 이고
주석에도 "규칙은 여기 한 곳에만 둔다" 고 적혀 있다. 그런데 응답 화면
(`app/survey/[token]/page.tsx:222-229`, `:260-267`)이 자기 폴백 문장을 따로 들고 있다.

**수정.** 서버가 최종 문장을 만들어 내려보낸다. 응답 화면에서 규칙을 없앤다.
`app/api/survey/[token]/route.ts:56-66` 의 map 을 고친다.

```ts
// 기본 문구 규칙을 화면이 따로 들고 있으면 인쇄물과 온라인 설문의 문장이 갈린다.
// 정본(resolveKanoQuestionPair)으로 최종 문장을 만들어 내려보낸다.
requirements: requirements.map((r: any) => {
    const { positive, negative } = resolveKanoQuestionPair(r);
    return {
        id: r.id,
        category: r.category,
        subcategory: r.subcategory,
        requirement: r.requirement,
        kanoPositiveQ: positive,
        kanoNegativeQ: negative,
        order: r.order,
    };
}),
```

응답 화면은 내려온 문장을 그대로 쓰고 폴백 분기를 지운다.

**Steps**

- [ ] 저장된 질문이 없을 때 응답 화면과 Word 설문지의 문장이 같은지 검증하는 테스트를
      먼저 추가한다.
- [ ] 라우트를 고치고 `app/survey/[token]/page.tsx` 의 폴백 분기 두 곳을 지운다.
- [ ] `tests/kano-survey-document.test.ts` 와 설문 라우트 테스트가 함께 통과하는지 본다.
- [ ] 매뉴얼 7.6 절의 "알아 둘 것" 문단과 부록 E 줄을 지운다.

**위험.** 낮지만 응답 화면의 강조 표시(기능 이름을 굵게 보여 주던 부분)가 사라진다.
정본 문장에는 강조가 없다. 이 변화를 받아들일지 확인한다.

### D-2. Kano 분류의 한글 이름이 네 벌이다

**증상.** 같은 코드를 화면마다 다르게 부른다.

| 코드 | 집계표 | 응답자별 보기 | `lib/kano-algorithm.ts` | KanoManager 내부 |
| --- | --- | --- | --- | --- |
| R | 역품질 | 역품질(R) | **역** | Reverse (역) |
| Q | 회의적 | **의심(Q)** | 회의적 | Questionable (의문) |

**원인.** 변환 함수가 네 군데에 흩어져 있다.

- `lib/kano-algorithm.ts:95` `translateKanoCategory` — **테스트에서만 쓰인다.**
- `components/project/KanoAggregationTable.tsx:33` — 같은 이름의 함수를 따로 정의해
  lib 의 것을 가린다. 실제 집계표가 쓰는 것은 이쪽이다.
- `lib/kano-response-display.ts:14` `getKanoCategoryLabel` — 응답자별 보기.
- `components/project/KanoManager.tsx:574` `getCategoryName` — **어디서도 호출되지
  않는 죽은 코드다.**

**수정.** 정본을 `lib/kano-algorithm.ts` 하나로 모은다.

- `translateKanoCategory` 를 정본으로 삼고 R 을 `역품질`, Q 를 `회의적` 로 맞춘다.
  집계표 표기를 기준으로 한 것이며 사용자가 가장 많이 보는 화면이다.
- `getKanoCategoryLabel` 은 정본에서 파생시킨다. 짧은 표기가 필요하면 별도 맵을 두지
  말고 `` `${translateKanoCategory(c)}(${c})` `` 로 만든다.
- `KanoAggregationTable` 의 중복 정의를 지우고 lib 에서 가져다 쓴다.
- `KanoManager.getCategoryName` 은 죽은 코드다. **`AGENTS.md` 규칙에 따라 임의로
  지우지 말고 이 계획서로 승인을 받아 지운다.** 이 줄이 승인이다.

**Steps**

- [ ] `tests/kano-algorithm.test.ts:183` 의 기대값을 `'역'` 에서 `'역품질'` 로 바꾼다.
      **이것은 의도한 계약 변경이므로 보고서에 명시한다.**
- [ ] `tests/kano-response-display.test.ts` 의 기대값을 파생 규칙에 맞춘다.
- [ ] 정본을 정리하고 세 곳의 중복을 없앤다.
- [ ] 화면에 나오는 이름이 한 벌인지 DOM 테스트로 고정한다.
- [ ] 매뉴얼 7.7 절의 "화면마다 한글 이름이 조금씩 다르다" 주의와 부록 E 줄을 지운다.
- [ ] 매뉴얼 부록 D 용어집의 분류 이름을 정본에 맞춘다.

**위험.** 중간이다. 사용자에게 보이는 이름이 바뀌므로 기존 화면을 아는 사람이 혼동할
수 있다. 다만 지금은 네 벌이라 이미 혼동 상태다.

### D-3. 기능분석 작성 도우미의 이름이 위치를 오해하게 한다

**증상.** "기능분석 작성 도우미" 는 WS-2 화면에 있지만 이름만 보면 WS-10
기능기술체계도의 기능처럼 읽힌다.

**수정.** 버튼과 팝업 제목에 워크시트 번호를 붙인다. 같은 화면의 "WS-2 FAST 작성 지원"
과 표기를 맞춘다.

- `components/project/SpecTable.tsx:1060-1064` 의 버튼 라벨을 `WS-2 기능분석 작성 도우미`
  로 바꾼다.
- `components/project/FunctionAnalysisAssistant.tsx:114` 의 팝업 제목도 같이 바꾼다.

**Steps**

- [ ] 두 곳의 라벨을 바꾼다.
- [ ] 매뉴얼 7.2 절의 인용과 부록 E 줄을 갱신한다.

**위험.** 없다.

---

## Task E — 두 벌로 갈린 화면

**결정 5 가 필요하다. 결정 전에는 코드를 건드리지 않는다.** 데이터가 걸려 있어 잘못
고르면 사용자가 입력한 내용이 보이지 않게 된다.

### E-1. WS-4 제품속성적합도가 두 개의 다른 화면이다

| 입구 | 화면 | 저장 위치 |
| --- | --- | --- |
| 주소 `attributes/fitness` | 속성별 슬라이더 3 개(중요도·현수준·목표)와 목표 갭 | `attributeFitnesses` |
| 개요 탭 | 시장×세분화 매트릭스, H/M/L/L\*, 세분시장 순위, 컨설턴트 진단 | `fitnessMatrix` |

**문제.** 한쪽에 적은 내용이 다른 쪽에 나타나지 않는다. 사용자가 어느 쪽에 적었는지에
따라 결과보고서에 들어가는 그림도 달라진다. 보고서는 **개요 탭의 매트릭스 화면을**
캡처한다.

**결정할 것.** 어느 쪽을 정본으로 삼을 것인가.

- **매트릭스를 정본으로 (권고).** 보고서가 이미 이 화면을 쓴다. 주소 쪽 화면은
  메뉴에서 매트릭스로 보내고, 기존 `attributeFitnesses` 데이터를 어떻게 할지 정한다.
- **슬라이더를 정본으로.** 보고서 캡처 대상을 바꿔야 하고 매트릭스의 컨설턴트 진단과
  세분시장 순위를 버리게 된다.
- **둘 다 유지.** 지금 상태다. 화면에 서로의 존재와 차이를 명시해야 한다.

**Steps**

- [ ] 결정 5 를 받는다.
- [ ] 결정에 따라 **별도 계획서를 쓴다.** 데이터 이관 여부, 기존 입력 보존, 보고서
      캡처 대상 변경이 모두 얽혀 있어 이 계획서에서 다루지 않는다.
- [ ] 결정 전까지 매뉴얼 7.4 절의 "두 화면이 다르다" 설명을 유지한다.

### E-2. WS-7 주소에 실제 화면이 없다

**증상.** 워크시트 메뉴의 `WS-7 Kano 분석 집계표` 링크가
`app/project/[id]/kano/analysis/page.tsx` 로 가는데, 그 화면에는 표가 없고 "Kano 분석
결과가 WS-7로 통합되었습니다" 안내와 이동 버튼만 있다. 실제 집계표와 그래프는 개요
화면의 탭에 있다.

**문제.** 메뉴를 누른 사용자가 한 번 더 눌러야 한다. 메뉴가 안내 페이지로 가는 구조는
WS-4 와 같은 종류의 문제다.

**결정할 것.**

- **메뉴가 개요 탭을 직접 열게 한다 (권고).** 개요 화면이 탭을 쿼리 파라미터로 받지
  않으므로(`app/project/[id]/page.tsx:74` 의 `useState('overview')`) 탭을 주소로 여는
  기능을 먼저 넣어야 한다. 이것은 WS-7 만이 아니라 모든 워크시트 링크에 도움이 된다.
- **안내 페이지를 유지한다.** 지금 상태이며 추가 클릭이 남는다.

**Steps**

- [ ] 결정 5 를 받는다.
- [ ] (권고안) 개요 화면이 탭을 주소로 받게 하는 작업을 별도 계획서로 분리한다.
      워크시트 메뉴 전체의 이동 방식이 바뀌므로 범위가 크다.
- [ ] 결정 전까지 매뉴얼 1.2 절과 7.7 절의 안내를 유지한다.

---

## 수정하지 않는 항목

부록 E 에 있지만 **고칠 것이 없다고 판단한 항목이다.** 문서로만 다룬다.

| 항목 | 판단 |
| --- | --- |
| WS-6 Google Forms 3 단계 카드 | 화면이 이미 "개발 중" 배지와 안내 문구를 보여 주고 카드를 흐리게 처리한다(`components/project/KanoManager.tsx:774-785`). 기능 플래그 한 줄로 열리게 설계돼 있으므로 그대로 둔다 |
| 가져오기 이력 | 결정 4 의 권고안대로 두면 코드 변경 없음 |

---

## 검증 게이트

각 Task 완료 기준은 `CLAUDE.md` 의 게이트를 그대로 따른다.

```sh
npx tsc --noEmit && npx vitest run && npx next lint
```

추가로 지킬 것.

- **Task 마다 RED 테스트를 먼저 만든다.** 고치기 전에 현재 동작이 실패로 잡히는지
  확인한다.
- **뮤테이션 회귀.** `stryker.crap.config.json` 의 `mutate` 목록(27 개 파일)을 확인한
  결과는 이렇다.

  | 이 계획이 건드리는 파일 | 목록 포함 | 조치 |
  | --- | --- | --- |
  | `lib/kano-survey-document.ts` | **포함** | D-1 은 이 파일을 **읽기만 한다.** 고치게 되면 stryker 재실행 필수 |
  | `lib/kano-algorithm.ts` | 미포함 | D-2 로 로직이 모이므로 **목록 추가를 검토한다** |
  | `lib/kano-response-display.ts` | 미포함 | 위와 같다 |
  | `lib/business-plan-file.ts` | 미포함 | 상수 추가뿐이다 |
  | `lib/funding-ai-agent.ts` | 미포함 | C-2 는 이 파일을 읽기만 한다 |

  D-1 을 하다가 `lib/kano-survey-document.ts` 를 고치게 되면 반드시
  `npx stryker run stryker.crap.config.json --mutate lib/kano-survey-document.ts` 를
  돌리고 점수를 보고서 VERIFIED BY 에 담는다. 게이트 3 종은 뮤테이션 점수 하락을 잡지
  못한다.
- 화면·API 실기동 검증은 하지 않는다. 필요하면 감리자에게 이월한다.

## 결과 보고

`CLAUDE.md` 의 보고서 관례를 따른다. Task 마다
`docs/superpowers/reports/2026-09-17-manual-ui-discrepancies/task-<식별자>.md` 에
남기고, 작업 커밋과 **별도의 둘째 커밋**으로 올린다.

보고서에 반드시 담을 것.

- 고친 항목이 매뉴얼의 어느 절과 부록 E 의 어느 줄을 지웠는지.
- 사용자에게 보이는 문구가 바뀐 경우 바뀌기 전과 후를 나란히.
- 테스트 기대값을 바꾼 경우(D-2 의 `역` → `역품질`) 그것이 의도한 계약 변경이라는 설명.

## 원본 대조표

부록 E 16 줄과 이 계획서의 Task 를 짝지은 것이다. 하나도 빠뜨리지 않았는지 확인할 때
쓴다.

| 부록 E 항목 | Task | 결정 필요 |
| --- | --- | --- |
| 팀원 초대 Coach | A-1 | |
| 팀원 목록 휴지통 | A-2 | 결정 1 |
| WS-15 저장 실패 무표시 | A-3 | |
| Google·SMTP 저장 경고 | B-1 | |
| 새 프로젝트 파일 형식 안내 | B-2 | |
| 관리자 시스템 정보 | B-3 | 결정 2 |
| 서비스 설정 AI 엔진 탭 | B-4 | |
| WS-7 그래프 클릭 | C-1 (기존 계획서) | |
| WS-16 AI 초안 | C-2 | 결정 3 |
| 가져오기 이력 | C-3 | 결정 4 |
| WS-6 기본 질문 문구 | D-1 | |
| Kano 분류 한글 이름 | D-2 | |
| 기능분석 도우미 이름 | D-3 | |
| WS-4 두 화면 | E-1 | 결정 5 |
| WS-7 주소 | E-2 | 결정 5 |
| WS-6 Google Forms 카드 | 수정 불요 | |
