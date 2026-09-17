# 초대 기한 기능 운영 배포 결과.

## RESULT.

사용자의 푸시·배포 요청에 따라 운영 DB 변경, 작업 브랜치 및 main 푸시, Vercel 운영 배포를 완료했다. 2026-09-17 10:27:19 KST에 Production 배포의 `success`와 `Deployment has completed`를 확인했다.

- 운영 주소. [KS-QFD](https://codetest2-rouge.vercel.app).
- 고정 배포 주소. [배포된 버전](https://codetest2-ff0bcmz52-cavinseos-projects.vercel.app).
- Vercel 배포. [GZshYCEGma56Viwz6WFw6rnkmALc](https://vercel.com/cavinseos-projects/codetest2/GZshYCEGma56Viwz6WFw6rnkmALc).
- GitHub Production deployment ID. `6493665159`.

## COMMIT.

배포 소스는 `83bb50c2dba5c45934c3b06102ba1ff21e5c25c5`이며, 기능 구현은 `6c6b858`이다. 원격 최신 main 및 작업 브랜치 `4b302b0`를 읽고 두 커밋만 추가됨을 확인했다.

`git push --atomic origin HEAD:refs/heads/codex/login-role-validation HEAD:refs/heads/main`으로 두 브랜치를 함께 fast-forward 했다. 원격 두 브랜치가 배포 소스 SHA와 일치함을 별도로 확인했다. 이 결과 보고서는 기능 소스 이후 문서 전용 커밋으로 작업 브랜치에 푸시한다.

## DATABASE.

실제 설정의 프로젝트 식별자가 기존 운영 Supabase 프로젝트 `zusyveyqlmewauonesgm`과 일치함을 비밀값 출력 없이 확인했다.

`npx prisma migrate status`에서 미적용 마이그레이션이 `20260917000000_invite_access_expiry` 한 건임을 확인했다. `npx prisma migrate deploy`는 `All migrations have been successfully applied.`를 반환했고, 후속 status는 20개 이력 및 `Database schema is up to date!`를 반환했다.

DB 메타데이터 조회로 `invite_codes.accessExpiresAt`의 형식이 `timestamp without time zone`, nullable이 `YES`임을 확인했다. 해당 Prisma 이력은 completed=true, rolled_back=false다. 마이그레이션은 nullable 열 하나를 추가했으며 기존 초대·계정의 기한을 수정하지 않았다.

Supabase Security Advisor 응답에는 ERROR/WARN이 없고 INFO `rls_enabled_no_policy` 안내만 있었다. 이 배포는 기존 접근 권한과 정책을 변경하지 않았다. [Supabase 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)를 참고한다.

## VERIFIED BY.

- [GitHub CI 35170463831](https://github.com/cavinseo/codetest2/actions/runs/35170463831). `completed / success`. 의존성 설치, Prisma 생성, Lint, Type check, Test, Build가 모두 success다.
- 프리뷰 deployment `6493652496`와 Production deployment `6493665159`가 같은 배포 소스를 사용했다. Production 상태 API에서 `success`, 운영 배포 URL 및 완료 시각을 직접 확인했다.
- `node temp_files/verify-invite-expiry-deployment.cjs`. 종료 코드 0. 운영 관리자 HTML이 참조하는 실제 공개 번들을 읽어 새 기능 문자열을 확인했다.

```text
adminStatus: 200
inviteLoginStatus: 200
verifiedMarkers: invites-expires-at, invites-expiry-input-, invites-expiry-save-, 이용 기한 (필수)
unauthenticatedInviteStatuses: GET 401, PATCH 401
```

- 실제 운영 브라우저에서 관리자 로그인 화면과 멘티 초대 코드 로그인 화면의 정상 표시를 확인했다.
- 로컬 구현 검증의 전체 2,405개 테스트, 타입 검사·린트·빌드 및 가상 API에 연결한 실제 화면 검증은 [구현 보고서](task-implementation.md)에 기록되어 있다.

## DEVIATIONS / RISKS.

이번 요청은 운영 DB 적용과 푸시·배포를 명시적으로 승인하므로 선행 로컬 구현의 미배포 상태를 이어서 완료했다. 새로운 기능 코드 변경이나 의존성 변경은 하지 않았다.

운영 관리자 로그인 세션이 없어 로그인 후 초대관리 조작은 운영에서 재실행하지 못했다. 공개 번들 확인을 로그인 후 실제 저장 검증으로 간주하지 않는다. 검수용 초대 발행, 기한 변경, 메일 발송 등 운영 데이터 쓰기는 수행하지 않았다.

추가 [CRAP / Mutation 실행 35170463793](https://github.com/cavinseo/codetest2/actions/runs/35170463793)은 확인 시 진행 중이었다. 이 추가 검사까지 통과했다고 판정하지 않는다. 필수 CI 및 Production 배포는 모두 성공했다.

## QUESTIONS.

없음.
