# 운영 배포 완료 기록.

2026-10-15 사용자가 요청한 미배포 워크시트 입력 수정과 Kano 응답자 선택·전체 삭제 기능을 기존 운영 프로젝트에 배포했다.

- 운영 주소는 https://codetest2-rouge.vercel.app 이다.
- 배포 ID는 `dpl_3pkxjBfcXkivx3bFV8e8uLDZPyRa`이며 `production`, `READY` 상태를 Vercel API로 확인했다.
- 프로젝트 ID는 `prj_KahsoHiz93eBM42v2Sh82gY5PU8l`이다.
- 운영 도메인과 `codetest2-cavinseos-projects.vercel.app`이 같은 새 배포에 연결됐다.
- 소스 기준 커밋은 `8912af7d02e94642ae1e98db3c47beee18ba21ee`이다.
- 소스 SHA256 목록의 digest는 `847c04c6a8ca36a63b5f5bb34f4de952136ef7e436d8d8d284dbd6060378dc07`이며 배포 metadata와 일치한다.
- 이전 운영 배포는 `dpl_EwwELrUxDsgDqJV8oyU3Cz4V1tPq`이다.

## 배포 범위.

이전 운영 manifest의 812개 파일을 Git blob과 이미 배포한 설문 수정 파일로 재현하고 모든 SHA256을 대조했다. 배포 준비 폴더는 `C:/Users/user/AppData/Local/Temp/codetest2-pending-release-20261015`이다. Workspace의 다른 미완료 변경을 전체 복사하지 않았다.

최종 manifest는 816개 소스 파일이며 이번 요청에 해당하는 17개 파일만 변경됐다. 나머지 799개 파일은 이전 운영본과 같은 바이트다. `package.json`, lockfile, Prisma schema, 인증·설정 및 기존 온라인 설문/초청 링크 수정 8개 파일도 운영본을 유지했다.

입력 수정에는 고객 요구사항의 편집 중 저장, 행 이동 시 편집 내용 유지, 필수 입력 검사, 마지막 행 삭제의 명시적 전체 삭제, 미저장 이탈 경고와 한글 조합 Enter 처리가 포함됐다. 다른 워크시트에서 발견했던 AttributeMentorWizard 1개 및 QFDMatrix 4개 조합 입력 위치를 함께 반영했다. 요구사항 API는 기존 개별 create/updateMany 저장 계약과 생략한 Kano 필드의 보존을 유지하면서 입력 스키마만 수정했다.

Kano 응답자 보기에는 행 선택, 전체 선택, 선택 삭제, 전체 삭제와 삭제 전 확인이 포함됐다. 멘티의 응답자 보기 접근을 TIMKO 분석 권한과 분리했다. 서버는 기존 프로젝트 쓰기 권한을 사용하며 배정된 멘토 EDITOR와 멘티 OWNER를 허용하고 VIEWER·COACH 등은 차단한다. 삭제는 현재 프로젝트와 선택된 원래 식별키에 한정되고 트랜잭션에서 응답 완료 상태를 초기화하며 초대 내역은 유지한다. 이전 전체 초대 리셋 경로도 별도 확인을 유지한다.

KanoManager는 기존 인라인 설문 관리/초청 UI와 프로젝트·설정 GET 경로를 유지하고 검증된 삭제 상태/guard/callback을 이식했다. 분석 JSX만 새 KanoAnalysisTab으로 옮겼다. 기존 미사용 helper 3개를 보존했고 이번 이동으로 불필요해진 helper만 제거했다. Google Forms binding, 별도 Invite/Summary UI, 회사·revision·보고서 변경은 배포하지 않았다.

`E:/Dropbox/codetest2/tmp/pending-release-manifest.json`에 전체 소스 해시를 기록했다. `tmp/pending-release-source.diff`와 `tmp/pending-release-source-snapshot/`에 재현 가능한 변경 증거 및 기준 커밋 이후 25개 override 파일을 보관했다.

## 독립 검증.

주 작업자가 통합 보고서를 받아 범위와 핵심 권한/필터/트랜잭션/프로젝트 전환 guard를 직접 대조했다. 테스트 삭제·skip·단언 약화·게이트 설정 변경은 없다.

- 입력 관련 3개 소스를 기존 운영 코드로 잠시 되돌렸을 때 `17 failed | 62 passed (79)`가 발생했다. finally에서 수정본을 바이트 단위로 복원했다. 기록은 `tmp/pending-release-input-reverse.log`이다.
- 최종 `npm run lint`는 종료 0이다. 기록은 `tmp/pending-release-lint.log`이다.
- 최종 `npm run test`는 `239 passed` 파일, `3351 passed` 검사, 종료 0이다. 기록은 `tmp/pending-release-test.log`이다.
- 최종 `npm run build`는 Prisma generate, Next 최적화 빌드, 타입 검사와 페이지 생성을 통과하고 종료 0이다. 기록은 `tmp/pending-release-build.log`이다.
- 첫 전체 검사에서 새 설치 폴더의 미생성 Prisma client로 13개 suite import가 실패했다. 전체 스택을 확인한 뒤 build의 generate 단계로 클라이언트를 생성하고 전체 검사를 재실행했다. 제품 코드는 변경하지 않았다. 최초 기록은 `tmp/pending-release-test-before-generate.log`이다.
- 기존 응답 삭제 API/helper 역검증의 `19 failed | 10 passed` 및 이름 응답 검증 역검증의 `2 failed | 27 passed` 근거는 2026-10-14 삭제 검증 기록에 있다. 이번 release API/helper는 검증된 수정본 바이트를 그대로 반영했다.

빌드 후 Next가 `next-env.d.ts`를 자동 생성했다. source 범위 검사에서 새 파일로 검출했고 기본 생성 내용 268바이트임을 대조했다. 소스 digest는 이 생성 파일을 제외하고 동결 전후 동일하다. Vercel dry run에서 업로드 815개 파일은 manifest의 `.gitignore` 2개 제외와 기본 생성 타입 파일 1개 추가에 해당한다. 비공개 환경파일·DB·node_modules·.next는 업로드하지 않았다. 이 생성 타입 파일은 source override와 별도로 기록한 빌드 산출물이다.

## 실제 브라우저와 운영 확인.

배포 소스의 실제 RequirementsTable/KanoManager를 모의 API와 메모리 데이터로 빌드해 인앱 브라우저에서 직접 조작했다. `tmp/preview-pending-release.cjs`는 제품 API/DB 대신 로컬 메모리만 사용한다.

- 멘티 응답자 보기에서 이름 응답자 ‘홍길동’을 선택하고 확인을 취소하면 3행과 선택이 유지됐다.
- 확인한 선택 삭제는 ‘홍길동’만 제거했고 남은 2행과 선택 0명으로 갱신됐다.
- 멘토 분석 화면의 응답자 보기에서도 같은 삭제 도구가 표시됐다. 전체 선택과 전체 삭제 후 응답/집계가 빈 상태로 갱신됐다.
- 고객 요구사항의 행 편집을 끝내지 않은 상태에서 상단 저장을 눌렀을 때 입력 값이 저장됐고 새로고침 후에도 유지됐다.
- 로컬 요청 기록에는 정확히 선택 DELETE 1건, 본문 없는 전체 DELETE 1건, 요구사항 POST 1건이 있다. 취소 때 DELETE는 없다. 기록은 `tmp/pending-release-browser-memory-result.json`이다.
- 확인 함수 shim은 임시 검증 페이지에만 있으며 확인 문구를 기록하고 모의 확인/취소를 반환한다. 제품의 표준 `window.confirm`은 그대로다. native 확인 호출·취소·확인 및 오류/프로젝트 전환은 컴포넌트 검사에서 검증했다.

Vercel API에서 배포 ID·project ID·source digest·READY를 확인하고 운영 도메인 조회가 같은 새 ID인지 별도로 확인했다. 배포 summary는 `tmp/pending-release-production-summary.json`이다.

배포 후 운영 Kano 경로의 실제 JS 29개 파일을 읽어 선택 삭제·전체 삭제·respondentEmails·미저장 요구사항 경고·isComposing 코드가 포함됐는지 확인했다. 익명 응답 목록 GET은 401이며 실제 브라우저에서도 ‘로그인이 필요합니다.’가 표시됐다. 기록은 `tmp/pending-release-live-assets-summary.json`이다.

기존 초청 링크 `https://codetest2-rouge.vercel.app/survey/a79b03b6-5075-45f0-9e98-4172b9b63047`의 운영 API는 200, 요구사항 15개이고 이메일 필드는 없다. 브라우저를 새로고침한 후 고객니즈조사 설문지, 30개 fieldset, 150개 필수 radio, 이모티콘 없음, 404 없음 상태를 확인했다. 저장된 소개문과 흰색 HTML 양식도 유지됐다. 설문을 제출하지 않았다.

화면 증거는 `output/pending-release-delete-2026-10-15.png`, `output/pending-release-input-2026-10-15.png`, `output/pending-release-live-survey-2026-10-15.png`이다.

## 검증 한계와 보존 사항.

현재 인앱 브라우저에는 운영 로그인 세션이 없으므로 실제 멘토/멘티 계정의 운영 DB 저장·삭제와 native 확인창 수동 조작은 하지 않았다. 역할 및 삭제 동작은 실제 소스의 모의 DB/DOM 검사와 브라우저 메모리 화면으로 확인했고, 운영에서는 배포 소스·접근 게이트·공개 설문을 확인했다. 실제 접수 데이터 삭제, 테스트 설문 제출, 이메일 발송, 스키마 변경, 마이그레이션, Git commit/push는 수행하지 않았다. 기존 사용자 변경 사항을 보존했다.
