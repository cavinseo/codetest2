# Gemini 개인 AI 연결 오류 안내 개선 결과 보고서

## RESULT

Gemini 연결 확인의 HTTP 400 응답에서 허용한 기계 식별자만 고정 한국어 안내로 분류했다. 벤더 원문, 응답 JSON, API 키는 로그·API 응답·화면으로 전달하지 않는다. Gemini 키 안내는 `AIza...`로, OpenAI와 Anthropic 안내도 각각의 키 형식으로 표시한다. 연결 확인 API는 `ok`와 `message`만 응답한다.

독립 검토에서 `error.status`만 가진 `FAILED_PRECONDITION` 형식이 누락된 것을 발견해, 원래의 `details[].reason` 형식과 함께 지원하도록 보완했다.

## FILES CHANGED

- `lib/ai/personal.ts`에서 Gemini 400의 안전한 오류 식별자 분류를 추가했다.
- `app/api/me/ai-connection/verify/route.ts`에서 응답을 `ok`, `message`로 축소했다.
- `components/member/PersonalAiConnection.tsx`에서 벤더별 키 placeholder를 적용했다.
- `tests/ai-personal-provider.test.ts`, `tests/api-me-ai-connection.test.ts`, `tests/personal-ai-connection.test.ts`에서 오류 분류·비노출·화면 회귀를 검증했다.
- `docs/superpowers/specs/spec-gemini-connection-errors.md`에 승인된 범위, 검토 순서, 검증 기준을 기록했다.

## COMMIT

- `5b86f56 fix: Gemini 연결 오류 안내를 구분한다`.

## VERIFIED BY

- `npx vitest run tests/ai-personal-provider.test.ts tests/api-me-ai-connection.test.ts tests/personal-ai-connection.test.ts --pool=threads` → `Tests 34 passed (34)`.
- `npm test` → `Test Files 165 passed (165)`, `Tests 2284 passed (2284)`.
- `npx tsc --noEmit --incremental false` → exit 0.
- 변경 파일 대상 `npx eslint` → exit 0.
- `npm run build` → Next.js 운영 빌드 exit 0.
- `git diff --check` → exit 0.
- 독립 검토 3건에서 최상위 `FAILED_PRECONDITION` 응답 누락 1건을 확인하고 수정했다.

## DEVIATIONS

- 전체 `npm run lint`는 exit 1이다. 변경과 무관한 `.stryker-tmp` 경고와 `temp_files/qfd-ui/.vite-cache/deps/react-dom_client.js`의 React Hook 오류 14건이 원인이다. 변경 파일 대상 lint는 통과했다.

## RISKS

- 원격 데이터베이스, 실제 Gemini API 키, 실제 벤더 호출 및 dev 서버는 프로젝트 안전 규칙에 따라 사용하지 않았다. 실제 키의 계정 상태는 운영자가 새 안내에 따라 연결 확인으로 검증해야 한다.

## QUESTIONS

- 없음.
