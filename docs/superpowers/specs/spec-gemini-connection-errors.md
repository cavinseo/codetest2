---
title: 'Gemini 개인 AI 연결 오류 안내 개선'
type: 'bugfix'
created: '2026-09-16'
status: 'done'
baseline_commit: '54574c5cf6072617da2e021a2a8ea1109f310dce'
context: ['AGENTS.md', 'CLAUDE.md', 'docs/superpowers/plans/2026-08-25-member-ai-modes.md']
---

<frozen-after-approval reason="사용자가 요청한 Gemini 연결 오류 처리">

## Intent

**Problem:** Gemini를 선택하고 올바른 기본 모델 `gemini-2.0-flash`를 사용해도 연결 확인 화면은 `벤더 응답 오류 (HTTP 400)`만 표시한다. 사용자는 저장된 키가 유효하지 않은지, Gemini API 사용 제한인지, 모델 문제인지 판단할 수 없고, Gemini 선택 상태에서도 OpenAI 형식의 `sk-...` 키 안내를 본다.

**Approach:** 연결 확인 시 Gemini의 알려진 오류 식별자만 내부적으로 판별해 사전에 정한 한국어 안내로 바꾼다. 벤더 원문, 응답 JSON, API 키는 표시하거나 기록하지 않는다. API 키 입력 안내는 선택한 벤더에 맞춘다.

## Boundaries & Constraints

**Always:** 저장된 키·연결 API의 요청과 응답 계약, 모델 선택, 기존 401·403·404·429·네트워크 처리와 규칙 기반 폴백을 보존한다. 사용자에게는 고정된 안전 문구만 보이고, 키·벤더 원문·응답 본문은 로그·응답·화면에 남기지 않는다.

**Ask First:** 스키마·암호화 방식·벤더 요청 본문·저장 API 계약을 바꾸거나 실제 API 키·운영 DB·실제 벤더를 사용한 검증이 필요하면 범위를 다시 확인한다.

**Never:** 원격 Supabase나 `.env`를 사용하거나 dev 서버를 실행하지 않는다. HTTP 400 원문을 그대로 사용자에게 전달하거나 외부 주소·키 값을 화면에 노출하지 않는다.

## I/O & Edge-Case Matrix

| 상황 | 입력·상태 | 기대 동작 | 오류 처리 |
| --- | --- | --- | --- |
| Gemini 키 무효 | Gemini 400 응답에 `API_KEY_INVALID` | 새 Gemini 키 저장 안내를 표시한다. | 원문·키는 숨긴다. |
| Gemini 키 제한 | Gemini 400 응답에 `API_KEY_SERVICE_BLOCKED` | Gemini API 전용 제한 또는 새 키 안내를 표시한다. | 원문·키는 숨긴다. |
| Gemini 이용 조건 | Gemini 400 응답에 `FAILED_PRECONDITION` | 이용 가능 지역·결제 설정 확인 안내를 표시한다. | 원문·키는 숨긴다. |
| 알 수 없는 Gemini 400 | 알려지지 않은 안전 식별자 | 키와 모델 확인 안내를 표시한다. | 원문·키는 숨긴다. |
| 다른 벤더/기존 상태 | 401·403·404·429·네트워크 | 기존의 의미 있는 상태 안내가 유지된다. | 새 분류가 다른 벤더 계약을 바꾸지 않는다. |
| Gemini 선택 화면 | API 연결, vendor=`gemini` | API 키 힌트가 `AIza...`로 표시된다. | 키 값 자체는 비어 있고 다시 표시되지 않는다. |
| 연결 확인 API | 안전한 확인 결과 | 응답은 `ok`, `message` 두 필드만 포함한다. | 향후 벤더 원문 필드가 추가돼도 외부로 전달하지 않는다. |

</frozen-after-approval>

## Code Map

- `lib/ai/personal.ts` -- 개인 API 연결 확인 요청과 응답 상태별 안전 메시지를 만든다.
- `app/api/me/ai-connection/verify/route.ts` -- 연결 확인 결과를 API 응답으로 축소한다.
- `components/member/PersonalAiConnection.tsx` -- 벤더·모델·키 입력과 연결 확인 결과를 표시한다.
- `tests/ai-personal-provider.test.ts` -- 실제 HTTP 응답을 모의해 개인 연결 확인 계약을 검증한다.
- `tests/personal-ai-connection.test.ts` -- 벤더 전환 시 키 입력 안내와 연결 확인 메시지를 DOM에서 검증한다.
- `tests/api-me-ai-connection.test.ts` -- 안전한 연결 확인 응답 형식을 잠근다.

## Tasks & Acceptance

**Execution:**
- [x] `tests/ai-personal-provider.test.ts` -- Gemini 400의 키 무효·키 제한·일반 오류와 원문 비노출 RED 테스트를 추가한다.
- [x] `lib/ai/personal.ts` -- Gemini의 알려진 오류 식별자만 읽어 고정 안내로 분류하고, 기존 상태 처리를 보존한다.
- [x] `app/api/me/ai-connection/verify/route.ts`와 `tests/api-me-ai-connection.test.ts` -- 확인 결과를 `ok`, `message`로만 응답해 향후 벤더 원문 누출을 막는다.
- [x] `tests/personal-ai-connection.test.ts` -- Gemini와 OpenAI의 키 안내가 각각 맞는지, API 응답의 안전 메시지가 화면에 보이는지 DOM으로 검증한다.
- [x] `components/member/PersonalAiConnection.tsx` -- 선택한 벤더에 맞는 API 키 placeholder를 표시한다.
- [x] 관련 단위·DOM·전체 검사와 운영 빌드를 실행하고 검토 결과를 기록한다.

**Acceptance Criteria:**
- Given Gemini가 `API_KEY_INVALID`를 반환하면, when 사용자가 연결을 확인하면, then 새 Gemini API 키를 저장하라는 고정 안내를 보며 원문과 키는 보지 않는다.
- Given Gemini가 `API_KEY_SERVICE_BLOCKED`를 반환하면, when 사용자가 연결을 확인하면, then Gemini API 키 제한을 확인하라는 고정 안내를 본다.
- Given Gemini가 선택되면, when API 키 입력란을 보면, then `AIza...` 안내를 본다.
- Given OpenAI 또는 Claude가 선택되면, when 연결을 확인하면, then Gemini 전용 안내가 섞이지 않는다.

## Spec Change Log

- 2026-09-16: 사용자의 "처리해" 요청으로 승인되어 구현을 시작했다.
- 2026-09-16: 독립 검토에서 최상위 `error.status`의 `FAILED_PRECONDITION` 형식을 추가로 확인해, 같은 고정 안내와 회귀 테스트를 보완했다.

## Design Notes

오류 본문은 재표시하지 않고, 구조화된 식별자와 제한된 영문 신호만 비교한다. 이 비교 결과는 고정 문구 선택에만 사용한다. 따라서 벤더가 오류 본문에 비밀값이나 임의 텍스트를 넣어도 UI와 로그로 전달되지 않는다.

## Verification

**Commands:**
- `npx vitest run tests/ai-personal-provider.test.ts tests/personal-ai-connection.test.ts` -- 새 분류와 화면 안내 통과.
- `npm test` -- 전체 단위·DOM 회귀 통과.
- `npx tsc --noEmit --incremental false` -- 타입 오류 없음.
- `npm run lint` -- lint 오류 없음.
- `npm run build` -- Prisma 생성과 Next.js 운영 빌드 성공.

**Manual checks:**
- 격리된 화면에서 Gemini 선택 시 키 힌트와 안전 오류 문구가 보이고, API 키 값·벤더 원문이 보이지 않는지 확인한다.

## Suggested Review Order

**오류 분류와 비노출 경계**

- 알려진 식별자만 고정 안내로 바꿔 원문 노출을 막는다.
  [`personal.ts:82`](../../../lib/ai/personal.ts#L82)

- Gemini API 400에만 안전한 분류 경로를 적용한다.
  [`personal.ts:175`](../../../lib/ai/personal.ts#L175)

- 연결 확인 API 응답을 두 안전한 필드로 축소한다.
  [`route.ts:29`](../../../app/api/me/ai-connection/verify/route.ts#L29)

**벤더별 입력 안내**

- 선택한 벤더와 일치하는 키 형식만 안내한다.
  [`PersonalAiConnection.tsx:57`](../../../components/member/PersonalAiConnection.tsx#L57)

- 키 입력란이 현재 벤더의 안내를 즉시 사용한다.
  [`PersonalAiConnection.tsx:326`](../../../components/member/PersonalAiConnection.tsx#L326)

**회귀 검증**

- 알려진·미지 Gemini 오류와 원문 비노출을 잠근다.
  [`ai-personal-provider.test.ts:150`](../../../tests/ai-personal-provider.test.ts#L150)

- 라우트가 추가 벤더 필드를 전달하지 않음을 검증한다.
  [`api-me-ai-connection.test.ts:388`](../../../tests/api-me-ai-connection.test.ts#L388)

- 화면의 키 형식과 안전한 메시지 표시를 검증한다.
  [`personal-ai-connection.test.ts:58`](../../../tests/personal-ai-connection.test.ts#L58)
