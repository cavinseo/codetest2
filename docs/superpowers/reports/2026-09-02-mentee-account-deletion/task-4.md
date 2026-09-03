# Task 4 결과 보고서

## RESULT

관리자가 삭제 직전에 읽을 운영 지침을 만들었다. 설계 문서는 왜 그렇게 정했는지를 담고 있어 화면 앞에서 읽기에는 길다. 언제 승인 취소로 끝내고 언제 지우는지, 다섯 단계 절차, 무엇이 사라지고 무엇이 남는지, 파기 완료를 어떻게 답하는지만 뽑았다.

**이 Task 는 아직 닫히지 않았다.** Supabase 자동 백업 보존 주기가 "확인 필요" 로 남아 있다.

## FILES CHANGED

- `docs/2026-09-02-mentee-account-deletion-guide.md` 를 새로 만들었다.
- `docs/superpowers/plans/2026-09-02-mentee-account-deletion.md` 의 Task 4 Step 1~2 를 완료로 갱신했다.

## COMMIT

- 작업 커밋: `fd9d957 docs: 멘티 계정 삭제 운영 지침을 추가한다`.

## VERIFIED BY

문서만 바뀌었다.

- `npm run check:encoding`
  - 출력 마지막 줄 원문: `한글 인코딩 검사 통과.`
- 게이트 3종은 이 Task 를 담은 트리에서 사용자가 실행해 통과했다(Task 3 보고서의 VERIFIED BY 와 같은 실행이다. `00fb9ec` 는 `fd9d957` 뒤에 있다).
  - vitest 결과 원문: ` Test Files  95 passed (95)` 및 `      Tests  1099 passed (1099)`.
  - 출력 마지막 줄 원문: `✔ No ESLint warnings or errors`.

## DEVIATIONS

계획서 Step 1 은 백업 보존 주기를 "아직 없으면 확인 필요로 두고 Task 를 닫지 않는다" 고 했다. 그대로 따랐다. 값을 받으면 그 자리를 채우고 이 보고서의 RESULT 를 갱신해야 한다.

## RISKS

**보존 주기를 모르면 본인 요청 삭제에 정확히 답할 수 없다.** 운영 DB 에서 파기한 시점과 백업본이 소멸하는 시점이 다르므로 둘 다 말해야 하는데, 지금은 뒤쪽을 말할 수 없다. 지침의 해당 절이 "확인 필요" 인 채로 쓰이면 운영자가 임의로 답하게 될 여지가 있다.

지침이 코드를 강제하지는 않는다. 승인 취소로 끝낼 일을 삭제로 처리해도 화면은 막지 않는다. 확인창의 안내 문구와 사유 선택이 한 번 더 묻는 것이 전부다.

## QUESTIONS

**Supabase 자동 백업 보존 주기가 며칠인가.** 대시보드의 Database → Backups 에서 확인할 수 있다. 이 값을 받으면 지침 문서의 "확인 필요" 를 채우고 Task 4 를 닫는다.
