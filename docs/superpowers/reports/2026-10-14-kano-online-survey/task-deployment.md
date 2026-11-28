# Kano 이메일 설문 양식 운영 배포 결과

## RESULT

2026-10-14 사용자의 배포 지시에 따라 기존 운영 도메인에 Kano 온라인 설문의 HTML 양식과 초청 링크 수정을 배포했다. 공개 설문은 기존 오프라인 HTML 문서의 제목, 안내문, 저장된 소개글, 긍정·부정 질문과 다섯 응답 선택지를 사용한다. 화면의 이모티콘을 제거하고 모든 문항을 한 양식에 표시한다. 단건·일괄 초청 링크는 요청 origin으로 생성하여 localhost 환경설정에 영향을 받지 않는다.

## FILES CHANGED

- `app/survey/[token]/page.tsx`.
- `app/api/survey/[token]/route.ts`.
- `app/api/projects/[id]/kano/invite/route.ts`.
- `app/api/projects/[id]/kano/invite/bulk/route.ts`.
- `tests/api-kano-invite-links.test.ts`.
- `tests/kano-online-survey-form.test.ts`.
- `tests/api-survey-email-exposure.test.ts`.
- `tests/email-send.test.ts`.

## SOURCE

기존 운영 배포 `dpl_HHRiCPVsYTErjMeFbsQB7mKkCdr5`의 `meta.sourceCommit`을 Vercel API에서 직접 확인했다. 기준 소스는 `8912af7d02e94642ae1e98db3c47beee18ba21ee`이다. 이 커밋의 추적 파일을 `tmp/kano-online-release-20261014`에 추출하고 위 8개 파일만 변경했다. 일괄 초청 라우트에는 링크 생성 변경만 적용하여 작업 폴더의 다른 변경을 섞지 않았다. 모든 기준 파일을 Git blob과 바이트 단위로 대조했다.

별도 배포본의 812개 소스 파일에 대한 SHA-256 목록은 `tmp/kano-release-manifest.json`에 보관했다. 목록의 해시는 `9122bd2f50022a11a2cc9fe38d2a1558b27ed7d11adb4048217d0869d38d2a85`이며 빌드 후에도 소스 파일이 동일함을 확인했다. 기존 작업 폴더와 Git 브랜치는 변경하거나 초기화하지 않았다. 신규 커밋이나 Git push는 수행하지 않았다.

후속 작업의 타입 검사에 배포용 소스 사본이 섞이지 않도록 검증 폴더를 `C:/Users/user/AppData/Local/Temp/codetest2-kano-release-20261014`로 옮겼다. 기존 위치에는 파일이 남아 있지 않으며 배포 파일의 해시 목록은 위 경로에 그대로 보관한다.

## VERIFIED BY

주 작업자가 별도 배포 폴더에서 직접 수행했다.

- `npm ci --ignore-scripts --no-audit --no-fund` 성공했다.
- `npm run lint` 종료 코드 0이다.
- `npm run test`에서 `Test Files 236 passed (236)`, `Tests 3280 passed (3280)`이다.
- `npm run build` 종료 코드 0이며 타입 검사와 최적화 빌드가 통과했다.
- 초기 빌드는 샌드박스의 Prisma 다운로드 DNS 제한으로 실패했다. 네트워크 접근이 승인된 환경에서 같은 명령을 재실행하여 통과했다. DB 마이그레이션이나 DB 변경 명령은 실행하지 않았다.
- Vercel dry run에서 Next.js 프레임워크, 업로드 810개 파일, 개인 환경파일·로컬 DB 파일 0개를 확인했다.
- 신규 배포 `dpl_EwwELrUxDsgDqJV8oyU3Cz4V1tPq`가 `READY`, `production`이며 프로젝트 ID가 기존 프로젝트와 일치한다.
- 배포의 `meta.sourceBaseCommit`과 `meta.sourceDigest`가 위 기준 커밋 및 파일 목록 해시와 일치한다. CLI가 상위 작업 폴더의 Git 메타데이터를 자동 첨부하므로 실제 배포 소스는 이 두 명시적 메타데이터와 파일 목록으로 식별한다.
- `vercel inspect https://codetest2-rouge.vercel.app --json`에서 운영 도메인이 신규 배포 ID에 연결됐음을 확인했다.
- 쿠키 없이 기존 토큰의 공개 GET API를 호출해 HTTP 200, 15개 요구사항, 소개글 포함, 응답자 이메일 미노출을 확인했다.
- 운영 브라우저에서 제목 `고객니즈조사 설문지`, 흰색 양식, 긍정·부정 fieldset 30개, radio 150개, 독립 응답 그룹 30개, 화면 이모티콘 0개를 확인했다.
- 모든 문항이 미응답인 상태에서 제출 버튼을 눌렀을 때 브라우저 필수 응답 검증으로 첫 미응답 문항에 초점이 이동하고 설문 화면에 머물렀다. 실제 응답은 제출하지 않았다.
- 모바일 폭 400px에서 가로 넘침 없이 한 열 선택지가 표시되고, 데스크톱 1200px에서 다섯 열 선택지가 표시됐다. 임시 viewport 설정은 복구했다.

## DEPLOYMENT

- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- 배포 주소는 https://codetest2-j5euic0k3-cavinseos-projects.vercel.app 이다.
- 상태는 `READY`이다.
- 화면 증거는 `output/kano-online-survey-2026-10-14-production.jpg`이다.

## RISKS

기존에 발송된 localhost 메일 본문은 자동으로 바뀌지 않는다. 같은 토큰을 운영 도메인으로 열면 접근할 수 있으며 새 초청의 링크 생성은 단건·일괄 회귀 테스트로 검증했다. 실제 메일 발송이나 응답 저장을 운영 데이터로 시험하지 않았다.
