# Task 6 결과 보고서

## RESULT

PASS. 기존 Google Forms 연동 카드와 응답 파일 업로드 카드를 단일 「응답 수집」 카드로 합치고, 파일·오프라인·Google Forms 탭을 추가했다. 기존 엑셀 업로드 동작은 보존했으며 오프라인 HTML 여러 장 업로드와 파일별 결과 표시를 연결했다. Google Forms 기능 플래그가 꺼진 현재 상태에서는 모든 연동 동작을 비활성화하고, 플래그를 켜면 기존 설정·생성·가져오기·Apps Script 흐름이 복원되도록 유지했다.

## FILES CHANGED

- `components/project/KanoManager.tsx`에 응답 수집 방식 상태, 오프라인 파일·결과 상태와 업로드 핸들러, 세 탭 UI를 추가했다.
- `components/project/KanoManager.tsx`의 기존 두 카드를 단일 카드로 재배치하고 Google Forms 비활성 표시와 활성 복원 분기를 적용했다.
- `docs/superpowers/plans/2026-09-05-kano-response-upload-ux.md`의 Task 6 Step 1~5를 완료 처리했다.
- `docs/superpowers/reports/2026-09-05-kano-response-upload-ux/task-6.md`에 검증 결과와 잔여 위험을 기록했다.

## COMMIT

- 작업 커밋은 `368c28b feat: Kano 응답 수집 경로를 재배치한다`이다.
- 보고서 커밋은 이 문서만 추가하는 두 번째 커밋 `docs: Task 6 결과 보고서`이며, 커밋 자체의 최종 해시는 본문에 선기록할 수 없어 채팅 완료 보고에 적는다.

## VERIFIED BY

### 기준 동기화

- 작업 전에 `git pull`로 감리 커밋 `7296278`까지 fast-forward했다.

```text
From https://github.com/cavinseo/codetest2
   46c833a..7296278  claude/ws-6-response-upload-ui-gcng04 -> origin/claude/ws-6-response-upload-ui-gcng04
Updating 46c833a..7296278
Fast-forward
 docs/superpowers/plans/2026-09-05-kano-response-upload-ux.md | 4 ++++
```

### 게이트

- `npx tsc --noEmit`은 출력 없이 종료 코드 0으로 통과했다.

```text
(stdout/stderr 출력 없음, exit code 0)
```

- `npx vitest run`의 마지막 결과는 다음과 같다.

```text
Test Files  105 passed (105)
Tests  1206 passed (1206)
Duration  4.35s (transform 6.69s, setup 0ms, import 21.78s, tests 5.23s, environment 12ms)
```

- `npx next lint`의 마지막 출력 줄은 다음과 같다.

```text
✔ No ESLint warnings or errors
```

- `git diff --check`는 줄 끝 변환 경고 외 오류 없이 종료 코드 0으로 통과했다.

### grep 계약

- PowerShell에는 `grep` 명령이 등록되어 있지 않아, 같은 Git 배포본의 `grep.exe`에 사용자 지정 패턴과 인수를 그대로 전달했다.

```text
grep -n "collectMode\|오프라인 HTML 받기\|양식 확인\|multiple\|accept=\".html,.htm\"\|formData.append('files'\|GOOGLE_FORMS_INTEGRATION_ENABLED\|GOOGLE_FORMS_DISABLED_MESSAGE\|handleCreateGoogleForm\|handleImportResponses\|장 선택됨" components/project/KanoManager.tsx
13:    GOOGLE_FORMS_DISABLED_MESSAGE,
14:    GOOGLE_FORMS_INTEGRATION_ENABLED,
120:    const [collectMode, setCollectMode] = useState<'file' | 'offline' | 'googleForms'>('file');
302:    const handleCreateGoogleForm = async () => {
328:    const handleImportResponses = async () => {
429:                formData.append('files', file);
744:                                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${collectMode === 'file'
754:                                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${collectMode === 'offline'
764:                                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${collectMode === 'googleForms'
776:                            {collectMode === 'googleForms' && (
782:                                    {!GOOGLE_FORMS_INTEGRATION_ENABLED && (
784:                                            {GOOGLE_FORMS_DISABLED_MESSAGE}
788:                                    <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${GOOGLE_FORMS_INTEGRATION_ENABLED ? '' : 'opacity-60 grayscale'}`}>
794:                                                    {GOOGLE_FORMS_INTEGRATION_ENABLED ? '준비됨' : '개발 중'}
800:                                                disabled={!GOOGLE_FORMS_INTEGRATION_ENABLED}
803:                                                양식 확인
808:                                        <div className={`p-4 rounded-xl flex flex-col border ${GOOGLE_FORMS_INTEGRATION_ENABLED && googleConfigured
813:                                                <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${GOOGLE_FORMS_INTEGRATION_ENABLED && googleConfigured
817:                                                {GOOGLE_FORMS_INTEGRATION_ENABLED && googleConfigured ? (
819:                                                ) : GOOGLE_FORMS_INTEGRATION_ENABLED ? (
832:                                            {!GOOGLE_FORMS_INTEGRATION_ENABLED ? (
842:                                                    onClick={handleCreateGoogleForm}
860:                                        <div className={`p-4 rounded-xl flex flex-col border ${GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormId
865:                                                <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormId
869:                                                <span className={`text-[11px] ${GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormId ? 'text-emerald-400' : 'text-gray-500'}`}>
870:                                                    {GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormId ? '수집 가능' : '2단계 후 진행'}
873:                                            <h3 className={`text-sm font-semibold mb-3 ${GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormId ? 'text-white' : 'text-gray-500'}`}>응답 가져오기</h3>
875:                                                onClick={handleImportResponses}
876:                                                disabled={!GOOGLE_FORMS_INTEGRATION_ENABLED || isImporting || !createdFormId}
879:                                                {GOOGLE_FORMS_INTEGRATION_ENABLED && isImporting && <span className="w-3 h-3 border-2 border-emerald-300 border-t-transparent rounded-full animate-spin" />}
880:                                                {GOOGLE_FORMS_INTEGRATION_ENABLED && isImporting ? '가져오는 중...' : GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormId ? '응답 가져오기' : '대기 중'}
887:                                        {GOOGLE_FORMS_INTEGRATION_ENABLED ? (
912:                                    {GOOGLE_FORMS_INTEGRATION_ENABLED && createdFormUrl && (
943:                            {collectMode === 'file' && (
987:                            {collectMode === 'offline' && (
997:                                            양식 확인
1003:                                            오프라인 HTML 받기
1011:                                            multiple
1012:                                            accept=".html,.htm"
1017:                                            <span className="text-xs font-semibold text-emerald-300 lg:flex-shrink-0">{offlineFiles.length}장 선택됨</span>
```

- 11개 패턴이 모두 한 번 이상 확인되었다.

### 탭 문구 계약

```text
749:                                    응답 파일로 업로드
759:                                    오프라인 응답파일 업로드
770:                                        Google Forms 연동
780:                                        <p className="text-sm text-gray-500 mt-1">개발 중입니다. 준비되면 이 자리에서 바로 쓸 수 있습니다</p>
946:                                    <p className="text-sm text-gray-500 mt-1 mb-4">여러 명의 답변을 파일 하나에 정리해 한 번에 등록합니다</p>
990:                                    <p className="text-sm text-gray-500 mt-1 mb-4">각자 작성한 HTML 응답지를 낱장으로, 여러 장을 한 번에 등록합니다</p>
```

- 엑셀과 오프라인 업로드의 `window.prompt` 전문은 각각 368행과 416행에서 동일하게 확인했다.

### 변경 범위

```text
git diff --stat 7296278 HEAD -- . ':!docs'
 components/project/KanoManager.tsx | 363 +++++++++++++++++++++++++++----------
 1 file changed, 271 insertions(+), 92 deletions(-)
```

- 소스 변경은 `components/project/KanoManager.tsx` 한 파일뿐이다. diff의 JSX 변경은 기존 두 응답 수집 카드가 끝나는 지점까지만 있고, 「설문 질문 구성」 이후와 `showPreview` 모달에는 변경이 없다.

### 독립 검토

- Blind Hunter, Edge Case Hunter, Acceptance Auditor 세 관점으로 변경분을 검토했다.
- Acceptance Auditor가 파일 미선택 시 버튼 자체가 비활성이라 오류 toast에 도달하지 않는 계약 위반을 발견했다. 버튼을 업로드 중에만 비활성화하도록 수정하고 게이트 3종을 다시 통과했다.
- 탭 전환 시 결과 초기화, 부분 성공 `replace`, Google 플래그 true 복원 등은 확정 계약이므로 검토 제안에 따라 동작을 바꾸지 않았다.

## DEVIATIONS

- 기능 계약의 변경은 없다.
- 컴포넌트 테스트 인프라와 신규 의존성을 추가하지 말라는 지시에 따라 UI 자동 테스트를 만들지 않았다.
- Windows PowerShell에서 `grep` 실행 파일이 PATH에 없어, Git에 포함된 동일한 GNU grep 실행 파일로 정확한 패턴 검사를 수행했다.

## RISKS

실화면 검증은 하지 않았다(감리자 대기)

- 탭 전환, 여러 장 선택, 실제 내려받기와 업로드 결과 목록, Google 탭의 클릭 차단은 감리자·사용자의 로컬 브라우저 확인이 필요하다.
- Vitest는 향후 native config loader 호환 경고를 냈고, `next lint`는 Next.js 16에서 제거 예정이라는 경고를 냈다. 현재 게이트에는 영향이 없다.
- 원격 실DB, DB 쓰기, 개발 서버와 실제 네트워크 라우트는 실행하지 않았다.

## QUESTIONS

- 없다.
