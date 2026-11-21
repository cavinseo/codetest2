# Kano 초대 삭제의 원래 작업폴더 통합 결과.

## RESULT

검증된 개별 초대 삭제 변경만 원래 `E:/Dropbox/codetest2`에 통합했다. 제품 소스 2개와 테스트 3개만 변경했고, 기존 미배포 변경을 보존했다. 원래 작업폴더에서 신규 47개를 포함한 관련 9파일·205개 검사가 모두 통과했다. 격리 작업트리의 동결된 5개 소스/테스트 SHA는 변경 전후 동일하다.

## FILES CHANGED

- `app/api/projects/[id]/kano/invitations/route.ts`에 zod 입력 검사·GET 응답 수/삭제 권한·개별 DELETE만 추가했다. 원래 GET의 `{ write: false }`를 유지했다.
- `components/project/KanoManager.tsx`에 초대 상태의 프로젝트/조회 성공 추적·개별 삭제 handler·공통 잠금·행 삭제 버튼만 이식했다. 기존 InviteModal·SummaryCards·Google Forms binding·overview/google-status 호출을 유지했다.
- `tests/api-kano-invitation-delete.test.ts`와 `tests/kano-invitation-delete.test.ts`를 새로 복사했다. 복사 직전에 두 대상 경로가 없음을 확인했고, 복사 후 SHA가 검증된 원본과 각각 일치한다.
- `tests/api-readonly-role-guards.test.ts`의 초대 fixture에 `_count: { responses: 0 }` 한 줄만 추가했다. 원래 자금계획 테스트 변경과 모든 기존 단언을 유지했다.

본 보고서 외에 다른 제품·테스트·설정·스키마·패키지는 수정하지 않았다. 개발 서버·실DB·커밋·push·reset·clean·배포 작업은 실행하지 않았다.

## VERIFIED BY

통합 전 원래 두 제품 파일 SHA를 루트의 `tmp/invitation-delete-workspace-before/`와 비교했다. 아래 값이 각각 일치하여 백업 이후 외부 변경이 없음을 확인하고 편집했다.

| 파일. | 통합 전 SHA256. | 통합 후 SHA256. |
| --- | --- | --- |
| invitations/route.ts. | `2D2F97341C7D3592E351E20A1D141FE67C2508F1FB39EC24FA69F00FCF2ED67E` | `E361B4A45ECBE0CD5D9D6E7675F2B0FA25CA1CCE6373630ED408CF850E2793E6` |
| KanoManager.tsx. | `99B04D208D1468AA8CB39FB6246A405EE75E67CB9407CEDD84D2490EDEFC5FC1` | `D749FB6655D7F7493F2D5464D60777B9D59D15060BACB3AA16741FACD365B318` |

기존 코드 보존은 원래 백업→통합본과 이전 운영 기준→격리 검증본의 `git --no-pager diff --no-index --unified=0`에서 실제 추가/삭제 행만 추출하여 순서까지 비교했다. API·UI 모두 변경 행 배열이 완전히 동일했다. 기존 미배포 변경을 이번 기능으로 교체하거나 제거한 행은 없다. 명령 원문 마지막 줄은 다음과 같다.

```text
API feature delta match: 47 changed lines
UI feature delta match: 77 changed lines
```

격리 검증본과 통합 API의 직접 diff는 GET의 원래 `{ write: false }` 한 줄만 다르다. 원래 UI의 다음 기존 요소를 직접 확인했다.

```text
app/api/projects/[id]/kano/invitations/route.ts:19:        const accessResult = await requireProjectAccess(request, projectId, { write: false });
components/project/KanoManager.tsx:10:import KanoSummaryCards from './KanoSummaryCards';
components/project/KanoManager.tsx:13:import KanoInviteModal, { type BulkInviteResult, type BulkInviteSummary } from './KanoInviteModal';
components/project/KanoManager.tsx:100:    const [createdFormBinding, setCreatedFormBinding] = useState('');
components/project/KanoManager.tsx:141:            const projRes = await fetch(`/api/projects/${projectId}/overview`);
components/project/KanoManager.tsx:182:                const googleStatusRes = await fetch(`/api/projects/${projectId}/kano/google-status`);
components/project/KanoManager.tsx:364:                body: JSON.stringify({ formId: createdFormId, formBinding: createdFormBinding }),
components/project/KanoManager.tsx:669:                    <KanoSummaryCards requirementCount={requirements.length} invitationCount={invitations.length} respondedCount={respondedCount} />
components/project/KanoManager.tsx:1315:                <KanoInviteModal
```

제품 2파일을 원래 백업과 `git diff --no-index --check`로 검사했으며 공백 오류 출력은 없었다. no-index의 exit 1은 차이가 존재하는 결과이며 LF→CRLF 설정 경고만 있었다.

관련 검사는 원래 작업폴더에서 다음 명령으로 실행했다. Prisma 및 Auth는 모의하며, 명령의 TEMP/TMP는 앞선 EPERM을 피했던 작업용 임시 폴더를 사용한다.

```powershell
$env:TEMP = 'E:/Dropbox/codetest2/tmp/invitation-delete-vitest-temp'
$env:TMP = 'E:/Dropbox/codetest2/tmp/invitation-delete-vitest-temp'
npm exec -- vitest run tests/api-kano-invitation-delete.test.ts tests/kano-invitation-delete.test.ts tests/kano-respondent-delete.test.ts tests/api-kano-response-delete.test.ts tests/api-kano-analysis-access.test.ts tests/kano-analysis-access.test.ts tests/kano-analysis-visibility.test.ts tests/api-kano-invite-links.test.ts tests/api-readonly-role-guards.test.ts
```

Exit code는 0이며 출력 마지막 줄은 다음과 같다.

```text
 Test Files  9 passed (9)
      Tests  205 passed (205)
   Start at  03:17:54
   Duration  17.58s (transform 3.19s, setup 0ms, import 15.34s, tests 2.19s, environment 29.42s)
```

격리 작업트리의 동결 확인 SHA는 통합 전후 다음과 같이 동일하다. 신규 테스트 2개는 원래 작업폴더의 복사본도 이 SHA와 같다.

| 격리 파일. | 전후 동일 SHA256. |
| --- | --- |
| invitations/route.ts. | `59DDE8499605949B4ED0DCED54A6853C8CCD184A657DBD02BEC38C6E7192F81B` |
| KanoManager.tsx. | `5DB264018F7632321E456715C250E7805B81A233075FBB6B2D1A5246375F60FB` |
| api-kano-invitation-delete.test.ts. | `1AD5908F01CA55C289F79CDEABCCBEA2DAB6C5A23867010BE51C3AD3E0D2F866` |
| kano-invitation-delete.test.ts. | `417E364F320D713BB39BA217098DB9656886B3BB5D18E4E89C11DB2DAE0EB407` |
| api-readonly-role-guards.test.ts. | `7D61A14DE1B7DDB52BC86AD83BA67E0BE50F3A367AC3DB877BFD891C03D7F69A` |

## DEVIATIONS

없다. 계획한 2제품 파일·3테스트 파일만 통합했고 허용되지 않은 소스나 설정 수정은 필요하지 않았다.

## RISKS

원래 작업폴더의 전체 lint/test/build는 이번 통합 담당이 실행하지 않았다. 관련 검사는 통과했으며, 동결된 격리 소스의 전체 게이트는 주 작업자가 이미 통과시킨 것으로 인계받았다. 실제 운영 UI·원격 DB 실행 및 배포는 이 통합 작업에 포함하지 않았다.
