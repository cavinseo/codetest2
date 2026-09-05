# 오프라인 응답지 실브라우저 저장본

Task 2 감리(2026-09-05) 때 `buildKanoOfflineFormHtml({ projectId: 'proj_1', projectName: '스마트팜 <테스트>', requirements: 2개 })`
로 만든 설문지를 **Chromium 141(Playwright)** 로 `file://` 에서 열어 라디오를 고르고 「응답 저장」 을 눌러
실제로 내려받은 파일이다. 가짜 DOM 이 아니라 브라우저가 직렬화한 산출물이므로, 파서·라우트 테스트의
입력으로 쓰면 "브라우저가 만든 파일을 서버가 읽는다"는 왕복이 그대로 검증된다. 손으로 고치지 마라 —
바꿔야 하면 같은 절차로 다시 만든다.

| 파일 | 이메일 | index 0 (긍정/부정) | index 1 (긍정/부정) | 비고 |
| --- | --- | --- | --- | --- |
| `saved-complete.html` | `tester@example.com` | 1 / 5 | 2 / 3 | 전부 답함 |
| `saved-partial-no-email.html` | (비움) | 4 / 2 | 1 / `null` | 미응답 1문항, confirm 승인 후 저장 |
| `saved-resaved.html` | `tester@example.com` | 1 / 5 | 2 / 5 | `saved-complete` 를 다시 열어 답 하나 바꿔 재저장 |

`requirementCount` 는 2, `projectId` 는 `proj_1` 이다.
