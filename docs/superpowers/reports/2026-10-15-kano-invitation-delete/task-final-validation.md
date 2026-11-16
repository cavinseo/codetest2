# Kano 미응답 초대 개별 삭제의 최종 검증과 운영 배포.

## RESULT

사용자가 선택한 ‘응답 대기 중인 초대만 삭제하고, 접수 응답은 보호’ 범위를 구현하고 운영에 배포했다. 설문 관리의 초대 내역에서 편집 권한이 있는 소유 멘티와 배정 멘토가 개별 초대를 삭제할 수 있다. 삭제 전 대상 이메일·설문 링크 무효화·복구 불가를 확인한다. 완료 표시 또는 실제 연결 응답이 있으면 개별 삭제를 차단한다. 이미 발송한 메일을 회수하는 기능은 아니다.

운영 도메인 `https://codetest2-rouge.vercel.app`을 Vercel CLI로 다시 조회하여 새 배포 `dpl_DEzywTfoLHM3hZ3fScgYpq1SYPSs`, `READY`, `production`을 확인했다. 주 작업자가 로그인된 멘토의 ‘운영 기능 검증 2026-10-15’ 프로젝트를 새로 조회해 qa-a·qa-b·qa-c 세 행의 ‘초대 삭제’ 버튼 활성화와 기존 질문·초대 목록 보존을 확인했다.

## FILES CHANGED

이전 운영 소스 대비 제품 2파일과 테스트 3파일만 변경했다.

- `app/api/projects/[id]/kano/invitations/route.ts`의 GET 삭제 가능 여부와 엄격한 개별 DELETE.
- `components/project/KanoManager.tsx`의 초대별 확인·삭제 조작, 공통 삭제 잠금과 프로젝트별 목록 상태.
- 새 `tests/api-kano-invitation-delete.test.ts` 및 `tests/kano-invitation-delete.test.ts`.
- `tests/api-readonly-role-guards.test.ts`의 응답 수 fixture 한 줄.

원래 작업폴더의 기존 InviteModal·SummaryCards·Forms binding 및 GET `write:false`를 보존하여 기능 부분만 통합했다. 구현 담당의 보고서를 읽은 뒤 별도 읽기 전용 검토 담당이 실제 before/after의 추가·삭제 행을 독립 비교해 API 47행/UI 77행의 기능 delta가 일치함을 확인했다.

## COMMIT

새 커밋과 push는 하지 않았다. 기존의 미커밋 작업을 섞지 않도록 운영 기준의 격리 소스를 배포했고, 사용자 작업폴더에는 이번 기능만 통합했다.

## VERIFIED BY

주 작업자가 동결된 격리 소스에서 직접 실행했다.

```text
npm run lint
Exit code 0

npm run test
Test Files  241 passed (241)
Tests       3398 passed (3398)
Exit code 0

npm run build
Optimized build, type validation, page generation completed
Exit code 0
```

두 제품 파일을 이전 운영 구현으로 일시 교체한 역검증에서는 신규 47개 중 46실패/1통과였다. 최종 제품 파일은 원래 SHA256으로 복원했다. 구현 이전 실패 검증과 최종 통과 검증을 함께 확인했다. 세 독립 검토자가 권한·응답 연결·입력 계약·경쟁 조건·화면 상태·테스트를 검토했으며 확인된 결함은 없었다. 변경 파일은 기존 Stryker mutation 대상이 아니며 새 순수 모듈도 없다.

원래 작업폴더 통합 담당의 관련 9파일/205검사 통과에 더해, 주 작업자가 직접 실행한 신규 API·UI 및 조회 전용 권한 검사 3파일/57검사도 통과했다. Prisma와 인증은 모의했다.

```text
npm exec -- vitest run tests/api-kano-invitation-delete.test.ts tests/kano-invitation-delete.test.ts tests/api-readonly-role-guards.test.ts
Test Files  3 passed (3)
Tests       57 passed (57)
Exit code 0
```

주 작업자가 실제 KanoManager를 사용하는 로컬 메모리 서버의 화면을 검증했다. 멘티의 모의 확인 취소 시 DELETE 요청이 없고 초대 3개/응답 4개가 그대로였다. 멘토의 모의 확인 승인 시 미응답 초대 1개만 삭제되어 완료 초대·완료 표시 없는 파일 접수 초대가 남고, 두 응답자/응답 4개가 유지됐다. 두 보호된 행은 비활성화 이유를 표시했다. 메모리 서버와 임시 정상 탭은 검증 후 종료했다.

배포는 기존 운영과 동일한 프로젝트 `prj_KahsoHiz93eBM42v2Sh82gY5PU8l`에 수행했다. 이전 운영 배포가 검증 기준인 `dpl_3pkxjBfcXkivx3bFV8e8uLDZPyRa`임을 먼저 확인했다. 전체 소스 818개 중 기존 813개는 SHA256이 동일하고 변경 3개·새 테스트 2개뿐이다. Vercel dry-run의 실제 업로드 817개 경로·크기·SHA1을 모두 대조했다. Git ignore 두 파일은 업로드 제외, 표준 생성 `next-env.d.ts` 한 파일은 포함한다. `.env`·`.git`·`.next`·`node_modules`·원래 작업폴더의 다른 변경은 업로드하지 않았다.

```text
sourceCommit 8912af7d02e94642ae1e98db3c47beee18ba21ee
sourceDigest dbc3e0cc902f5a5537cd62d5ffc97d317cb0da49e923f07873a071d5a14fef6d
Vercel deploy exit code 0
deployment dpl_DEzywTfoLHM3hZ3fScgYpq1SYPSs
readyState READY
target production
alias https://codetest2-rouge.vercel.app
```

검증 증거는 `tmp/invitation-delete-release-manifest.json`, `tmp/invitation-delete-deploy-dry.json`, `tmp/invitation-delete-deploy.json`, `tmp/invitation-delete-production-inspect.json`, `tmp/invitation-delete-browser-after.json`과 각 실행 로그에 기록했다. 실제 운영 화면은 `tmp/invitation-delete-production-proof.png` 및 `tmp/invitation-delete-production-invitations.png`에 저장했다.

## DEVIATIONS

기본 샌드박스의 `.next` 생성과 로컬 소켓 접근 제한을 확인한 뒤, 주 작업자의 빌드·메모리 서버만 승인된 권한으로 재실행했다. 자동 승인 검토의 거절은 없었다. 테스트의 임시 파일 rename EPERM은 작업 전용 TEMP/TMP 지정으로 해결했다. 제품·패키지·설정 수정은 필요하지 않았다.

## RISKS

이 기능의 삭제·취소와 응답 보호는 모의 API/UI 검사 및 로컬 메모리 화면으로 검증했다. 운영에서는 실제 조회와 버튼 표시·활성화를 확인했다. 이번 기능의 실제 운영 DELETE, 운영 멘티 재로그인, 표준 확인창 직접 조작은 이번 배포 후에 실행하지 않았다. 따라서 운영 두 역할의 실제 DB 삭제까지 검증했다고 주장하지 않는다. 운영 테스트 초대 3개는 모두 보존했다.

현재 개별 DELETE는 쓰기 권한·프로젝트 범위·완료 표시·실제 응답 존재 여부를 검사하고 삭제 시점에도 같은 조건을 적용한다. 응답 제출이 먼저 완료되거나 FK 충돌이 나면 409로 보호한다. 기존 응답 삭제와 전체 초대 리셋의 별도 동작은 이번 요청으로 변경하지 않았다.

## QUESTIONS

없다.
