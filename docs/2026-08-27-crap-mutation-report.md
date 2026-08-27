# CRAP · 뮤테이션 점검 보고서 — kano-qfd-webapp

**일시:** 2026-08-27
**브랜치:** `claude/carp-inspection-46phhc`
**측정 환경:** GitHub Actions `.github/workflows/crap.yml` (Node 22, ubuntu-latest)
**측정 커밋:** `058cafa`
**대상:** `lib/**/*.ts` 78개 파일 (CRAP), `stryker.crap.config.json` 지정 15개 파일 (뮤테이션)

> 실행 경위: 로컬 컨테이너에서 npm 레지스트리가 조직 egress 정책으로 차단돼
> (`x-deny-reason: host_not_allowed`) 의존성 설치가 불가능했다. 미러(yarn·jsdelivr·
> unpkg·jsr)도 모두 차단이라 측정을 CI 로 옮겼다. 아래 수치는 전부 CI 에서 실제로
> 돌려 얻은 값이며, 추정치는 없다.

## 요약

| 항목 | 결과 |
| --- | --- |
| CRAP 측정 함수 | 645 |
| 커버리지 100% 함수 | 494 (77%) |
| **CRAP > 30 (위험)** | **12** |
| 15 < CRAP ≤ 30 (주의) | 17 |
| 최대 CRAP | 306.0 (`lib/google-forms.ts:209`) |
| 뮤테이션 점수 | **95.18%** (죽임 671 / 생존 34) |
| 뮤테이션 100% 파일 | 15개 중 10개 |

**소견.** 뮤테이션 대상으로 지정된 15개 모듈은 건강하다 — 10개가 100%, 전체 95.18%
로 2026-08-20 종합검진이 세운 기준선 90% 를 넘는다. 문제는 **측정 대상 밖**이다.
CRAP 위험 12건 중 **12건 전부가 커버리지 0%** 이고, 그중 9건이 `workbook-importer.ts`
와 `google-forms.ts` 두 파일에 몰려 있다. 두 파일 모두 뮤테이션 대상이 아니며,
`google-forms.ts` 는 전용 테스트조차 없다.

즉 이 저장소의 테스트 품질은 "고른 수준"이 아니라 **측정하기로 정한 곳만 매우 높고,
정하지 않은 곳은 0** 인 이분 구조다. 종합검진이 C-2 로 지목했던 form-responses 버그
("테스트 437개가 전부 green 인데 이 버그가 사는 이유")가 살던 자리가 바로 이 0% 구역
이고, 그 구역은 지금도 0% 다.

---

## 1. CRAP 지수

`CRAP(f) = 복잡도² × (1 − 커버리지)³ + 복잡도`

- 복잡도: ESLint `complexity` 규칙(McCabe 순환복잡도), 중첩 함수는 별도 집계
- 커버리지: v8 문장 커버리지에서 **중첩 함수 구간을 뺀** 값
  (테스트 안 된 콜백 하나가 바깥 함수 점수를 끌어내려 원인 함수를 가리는 것을 막는다)
- 임계값 30 은 원 논문 기준이다. 복잡도 5 짜리 함수가 커버리지 0% 일 때 처음 넘는다.

### 위험 — CRAP > 30

| CRAP | 복잡도 | 커버리지 | 문장 | 함수 | 위치 |
| ---: | ---: | ---: | ---: | --- | --- |
| 306.0 | 17 | 0% | 0/10 | Arrow function | `lib/google-forms.ts:209` |
| 132.0 | 11 | 0% | 0/13 | `parseQfdTechnicals` | `lib/workbook-importer.ts:344` |
| 132.0 | 11 | 0% | 0/19 | `parseTechRoadmap` | `lib/workbook-importer.ts:434` |
| 110.0 | 10 | 0% | 0/15 | `parseAssets` | `lib/workbook-importer.ts:455` |
| 110.0 | 10 | 0% | 0/13 | `parseFundingPlans` | `lib/workbook-importer.ts:470` |
| 90.0 | 9 | 0% | 0/19 | `createKanoForm` | `lib/google-forms.ts:42` |
| 90.0 | 9 | 0% | 0/14 | `getFormResponses` | `lib/google-forms.ts:164` |
| 72.0 | 8 | 0% | 0/11 | `parseFundingSources` | `lib/workbook-importer.ts:491` |
| 56.0 | 7 | 0% | 0/1 | `buildAttributeDraftPrompts` | `lib/ai/prompts.ts:59` |
| 56.0 | 7 | 0% | 0/8 | `translateKanoCategory` | `lib/kano-algorithm.ts:95` |
| 42.0 | 6 | 0% | 0/14 | `sendSurveyInvitation` | `lib/email.ts:68` |
| 42.0 | 6 | 0% | 0/8 | `getCellValue` | `lib/excel-parser.ts:109` |

### 주의 — 15 < CRAP ≤ 30

| CRAP | 복잡도 | 커버리지 | 문장 | 함수 | 위치 |
| ---: | ---: | ---: | ---: | --- | --- |
| 29.5 | 16 | 63% | 10/16 | `buildSpecPickerRows` | `lib/product-attributes-utils.ts:88` |
| 25.7 | 25 | 90% | 26/29 | `parseSpec` | `lib/workbook-importer.ts:263` |
| 23.8 | 12 | 57% | 13/23 | `appendRecords` | `lib/workbook-importer.ts:510` |
| 22.0 | 22 | 100% | 3/3 | `normalizeContext` | `lib/spec-ai-agent.ts:138` |
| 21.5 | 20 | 84% | 27/32 | `parseImprovements` | `lib/workbook-importer.ts:363` |
| 21.5 | 7 | 33% | 2/6 | `createProvider` | `lib/ai/providers.ts:15` |
| 20.0 | 4 | 0% | 0/2 | `describeAiEngine` | `lib/ai/engine-label.ts:14` |
| 20.0 | 4 | 0% | 0/7 | Arrow function | `lib/business-plan-file.ts:124` |
| 20.0 | 4 | 0% | 0/3 | `parseImportTemplateSheet` | `lib/import-template-workbook.ts:28` |
| 19.8 | 17 | 79% | 26/33 | `verifyPersonalConnection` | `lib/ai/personal.ts:76` |
| 18.3 | 6 | 30% | 3/10 | `getRequestedSheetAliases` | `lib/workbook-importer.ts:187` |
| 18.2 | 18 | 91% | 21/23 | `parseSales` | `lib/workbook-importer.ts:236` |
| 17.3 | 12 | 67% | 8/12 | `buildTechTreeSpecOptions` | `lib/tech-tree-utils.ts:31` |
| 17.2 | 13 | 71% | 17/24 | `complete` | `lib/ai/openai-compatible.ts:160` |
| 17.1 | 17 | 94% | 15/16 | `parseBusinessPlanFile` | `lib/business-plan-file.ts:144` |
| 17.0 | 17 | 100% | 3/3 | `upsertPersonalConnection` | `lib/ai/personal-store.ts:57` |
| 15.8 | 15 | 85% | 17/20 | `verifySessionCookie` | `lib/auth.ts:59` |

### 해석 — 점수를 그대로 우선순위로 쓰면 안 되는 항목

CRAP 은 McCabe 를 쓰므로 `??`·`||`·`case` 를 전부 분기로 센다. 아래 셋은 점수가
**구조적으로 부풀려진** 경우라 조치 우선순위를 낮춰야 한다.

- `buildAttributeDraftPrompts` (CRAP 56) — 분기가 없다. `??` 6개가 이어진 템플릿
  문자열 조립 함수 하나뿐이다(문장 1개).
- `translateKanoCategory` (CRAP 56) — `switch` 7분기짜리 순수 문자열 매핑이다.
- `normalizeContext` (CRAP 22), `upsertPersonalConnection` (CRAP 17) — **커버리지가
  100% 인데도 목록에 있다.** CRAP 의 하한이 복잡도 그 자체이기 때문이다. 테스트
  공백이 아니라 복잡도 자체가 신호이므로, 테스트 추가가 아니라 분해 대상이다.

반대로 **점수보다 위험한** 것은 `google-forms.ts` 와 `workbook-importer.ts` 의 parse
계열이다. 둘 다 외부에서 들어온 구조(Google Forms API 응답, 업로드된 엑셀 시트)를
인덱스와 헤더 위치로 훑어 파싱하는 코드라, 입력이 예상과 어긋날 때 조용히 틀린
데이터를 만들어 낸다. 그리고 커버리지가 0% 다.

### 측정 제외

| 파일 | 함수 수 | 사유 |
| --- | ---: | --- |
| `lib/kano-upload-parser.ts` | 1 | 117행 함수를 커버리지 fnMap 에서 못 찾음 |
| `lib/worksheet-completeness.ts` | 1 | 261행 함수를 커버리지 fnMap 에서 못 찾음 |

645개 중 2개(0.3%)다. ESLint 가 보고한 함수 시작 위치와 istanbul fnMap 의 선언
위치가 두 줄 이상 어긋난 경우로, 산출 스크립트가 임의 매칭 대신 제외를 택한 결과다.

---

## 2. 뮤테이션 테스트

`npm run test:mutation` — 대상은 `stryker.crap.config.json` 의 순수 lib 모듈 15개다.

| 지표 | 값 |
| --- | --- |
| 대상 파일 | 15 |
| 죽인 뮤턴트 | 671 |
| 살아남은 뮤턴트 | 34 |
| **전체 뮤테이션 점수** | **95.18%** |

| 점수 | 죽임 | 생존 | 파일 |
| ---: | ---: | ---: | --- |
| 68.8% | 22 | 10 | `lib/ai/personal-vendors.ts` |
| 80.9% | 38 | 9 | `lib/oauth-nonce.ts` |
| 88.9% | 56 | 7 | `lib/import-cascade-guard.ts` |
| 90.3% | 65 | 7 | `lib/invite-code.ts` |
| 92.3% | 12 | 1 | `lib/import-json-schema.ts` |
| 100.0% | 23 | 0 | `lib/affiliation.ts` |
| 100.0% | 54 | 0 | `lib/ai/url-guard.ts` |
| 100.0% | 20 | 0 | `lib/delete-confirmation.ts` |
| 100.0% | 46 | 0 | `lib/login-state.ts` |
| 100.0% | 51 | 0 | `lib/member-profile-payload.ts` |
| 100.0% | 85 | 0 | `lib/member-profile.ts` |
| 100.0% | 129 | 0 | `lib/member-roles.ts` |
| 100.0% | 42 | 0 | `lib/program.ts` |
| 100.0% | 24 | 0 | `lib/safe-return-url.ts` |
| 100.0% | 4 | 0 | `lib/temp-password-email.ts` |

### 생존 뮤턴트 34건의 성격

파일·줄·뮤테이터만으로는 한 줄에 하위식이 여럿일 때 판정이 안 되므로, 스트라이커
리포트의 원본 소스에서 뮤턴트 구간을 그대로 떠서 대조했다. 그 결과 34건은 성격이
셋으로 갈린다.

#### (A) 실질 결함 — 1건

**`lib/import-cascade-guard.ts:34` · `impact.benchmarks > 0` → `false` 가 살아남았다.**

```ts
export function hasCascadeImpact(impact: CascadeImpact): boolean {
    return impact.kanoResponses > 0 || impact.benchmarks > 0 || impact.qfdMatrices > 0;
}
```

`tests/import-cascade-guard.test.ts:42` 은 `kanoResponses: 1` 과 `qfdMatrices: 5` 만
확인하고 **벤치마크만 있는 경우를 확인하지 않는다**. 그래서 이 조건이 망가져도
테스트는 전부 green 이다.

망가졌을 때의 결과가 가볍지 않다. `hasCascadeImpact` 는 고객요구사항을 replace 로
덮어쓸 때 함께 지워질 데이터를 사용자에게 경고할지 정하는 판단이다. 이 항이 죽으면
**벤치마크만 있는 프로젝트는 "삭제될 데이터 없음"으로 판정돼 확인 절차 없이 덮어써진다.**
종합검진 H-3·H-4 가 세운 방어가 정확히 이 지점에서 무증상으로 뚫린다.

조치는 한 줄이다.

```ts
expect(hasCascadeImpact({ kanoResponses: 0, benchmarks: 3, qfdMatrices: 0 })).toBe(true);
```

#### (B) 단언되지 않은 표시 문자열 — 17건

`MEMBER_AI_MODE_LABELS`/`MEMBER_AI_MODE_DESCRIPTIONS`(`personal-vendors.ts:41-52`),
`INVITE_CODE_MESSAGES`(`invite-code.ts:63-67`), 캐스케이드 경고 구분자
(`import-cascade-guard.ts:65` 의 `', '`), `EMPTY_CASCADE_IMPACT` 객체
(`import-cascade-guard.ts:27`) 가 전부 `""` 또는 `{}` 로 바뀌어도 통과한다.

사용자에게 그대로 노출되는 문구지만 어떤 테스트도 내용을 단언하지 않는다. 로직
결함은 아니다. 다만 `personal-vendors.ts` 의 생존 10건이 **전부** 이 부류라
점수가 68.8% 로 내려앉았고, 이 상태로는 CLAUDE.md 가 신규 순수 모듈에 요구하는
**뮤테이션 100% 기준을 이 파일에서 달성할 방법이 없다**. 정책 결정이 필요하다.

- 문구를 단언하는 테스트를 넣는다(문구 변경 때마다 테스트도 고쳐야 한다), 또는
- 표시 문자열 상수 맵을 뮤테이션 대상에서 제외한다(`stryker` 의 `// Stryker disable`
  주석 또는 상수 파일 분리).

#### (C) 등가 뮤턴트 및 도달 불가 — 15건

| 위치 | 원본 → 치환 | 판정 |
| --- | --- | --- |
| `oauth-nonce.ts:40` | `'utf8'` → `""` | 등가. Node 는 falsy 인코딩을 utf8 로 처리한다 |
| `oauth-nonce.ts:54` | `actualBuffer.length !== expectedBuffer.length` → `false` | 사실상 등가. 길이가 다르면 `timingSafeEqual` 이 던지고 catch 가 같은 `null` 을 낸다 |
| `oauth-nonce.ts:65` | `{ return null; }` → `{}` | **NoCoverage.** catch 경로에 도달하는 테스트가 하나도 없다 |
| `oauth-nonce.ts:48` | `!payload \|\| !signature` → `false` / `&&` | `.` 없는 값을 넣는 테스트가 없다 |
| `oauth-nonce.ts:61` | `!parsed?.userId` → `false`, `parsed?.userId` → `parsed.userId` | userId 가 빠진 **정상 서명** payload 를 넣는 테스트가 없다 |
| `oauth-nonce.ts:62` | `typeof parsed.exp !== 'number'` → `false` | exp 가 숫자가 아닌 정상 서명 payload 를 넣는 테스트가 없다 |
| `oauth-nonce.ts:62` | `parsed.exp <= nowInSeconds()` → `<` | 경계값(`exp === now`) 테스트가 없다 |
| `invite-code.ts:34` | `value.trim()` → `value` | 등가. 뒤의 `.replace(/[^A-Z0-9]/g, '')` 가 공백을 이미 제거해 `trim()` 이 무의미하다 |
| `invite-code.ts:97` | `.toISOString().slice(0, 10)` → `.toISOString()` | 초대 메일의 만료일 표기가 `YYYY-MM-DD` 인지 단언하지 않는다 (표시 문제) |
| `import-cascade-guard.ts:50-51` | `{ where: { projectId } }` → `{}` (4건) | mock 이 인자를 무시해 흡수했다 (아래 참조) |

**만료 검증은 살아 있다.** `oauth-nonce.ts:62` 의 생존 뮤턴트는 `typeof` 검사와
경계값을 겨눈 것이지 만료 거부 자체가 아니다. `tests/oauth-nonce.test.ts:34` 의
"exp 가 지난 nonce 를 거부한다" 는 정상 동작하며, 만료 비교를 없애는 뮤턴트는
죽었다. 다만 nonce payload 의 **형태 계약**(userId 존재, exp 타입)을 지키는 가드는
전부 단언되지 않은 상태라, 향후 payload 구조를 손대는 리팩터링에서 무증상으로
무력화될 수 있다. HMAC 위조가 불가능하므로 현재 악용 가능한 취약점은 아니다.

**mock 흡수가 대상 파일 안에서도 일어난다.** `stryker.crap.config.json` 의 주석은
"라우트 핸들러는 mock 이 뮤턴트를 흡수해 점수가 실제보다 좋게 나오므로 넣지 않는다"
고 밝히고 있다. 그런데 `import-cascade-guard.ts:50-51` 의 `{ where: { projectId } }`
→ `{}` 4건이 정확히 그 현상이다. 테스트의 `CascadeCounter` 스텁이 인자를 보지 않아
projectId 를 통째로 지워도 통과한다. 즉 이 파일의 88.9% 는 실제보다 **후하게** 나온
값이며, 대상 선정 기준을 "Prisma 를 mock 하지 않는 파일"이 아니라 "주입된 협력자를
단언하는 테스트가 있는 파일"로 다시 볼 필요가 있다.

#### 확인 필요 — 1건

`lib/import-json-schema.ts:21` 의 `rows` 헬퍼
(`<T>(schema: T) => z.array(schema).max(MAX_IMPORT_ROWS)`)가 `() => undefined` 로
바뀌었는데 살아남았다. 그런데 `tests/api-import-json-guards.test.ts:138` 에는
`MAX_IMPORT_ROWS + 1` 행을 보내 400 과 상한값 문구를 확인하는 테스트가 있고,
`rows` 는 스키마 7곳에서 쓰이므로 `undefined.optional()` 로 모듈 로드가 깨져야
정상이다. 예상과 어긋나므로 **테스트 공백으로 단정하지 않는다.** 스트라이커의
제네릭 화살표 함수 처리 또는 해당 뮤턴트의 테스트 필터를 직접 확인해야 한다.

---

## 3. 측정 체계 자체의 결함

### 3-1. 뮤테이션 테스트는 이 저장소 CI 에서 기동할 수 없었다

첫 측정이 다음으로 즉시 실패했다.

```
Error: Node.js version v20.20.2 detected. StrykerJS requires version to match >=22.0.0.
```

`.github/workflows/ci.yml` 은 `node-version: 20` 이고, `package.json` 에는 `engines`
필드가 없다. 즉 **`npm run test:mutation` 은 프로젝트가 명시한 CI 환경에서 한 번도
실행될 수 없는 상태**였고, CLAUDE.md 가 신규 순수 모듈에 요구하는 mutation 게이트도
그 환경에서는 성립하지 않는다. 이번 측정은 새 워크플로를 Node 22 로 올려 통과시켰다.

- **조치 필요(범위 밖이라 이번 변경에 포함하지 않음):** `ci.yml` 의 Node 버전 정렬,
  `package.json` 에 `"engines": { "node": ">=22" }` 명시.

### 3-2. 뮤테이션 대상이 순수 모듈의 21% 뿐이다

Prisma·Next 에 의존하지 않는 순수 모듈은 71개인데 대상은 15개다. 대상 밖이면서
**전용 테스트까지 이미 갖춘** 보안·검증 모듈이 남아 있다.

| 파일 | 줄 | 전용 테스트 |
| --- | ---: | --- |
| `lib/settings-crypto.ts` | 71 | `tests/settings-crypto.test.ts` |
| `lib/upload-guard.ts` | 62 | `tests/upload-guard.test.ts` |
| `lib/rate-limit.ts` | 81 | `tests/rate-limit.test.ts` |
| `lib/password-policy.ts` | 30 | `tests/password-policy.test.ts` |
| `lib/qfd-benchmark-guards.ts` | 20 | `tests/qfd-benchmark-guards.test.ts` |
| `lib/bulk-save-schemas.ts` | 165 | `tests/bulk-save-schemas.test.ts` |

테스트가 이미 있으므로 `mutate` 목록에 넣는 것만으로 추가 비용 없이 검증 강도를
확인할 수 있다. 설정 암호화·업로드 가드·레이트리밋은 종합검진이 "코어 인프라 상급
품질"로 평가한 바로 그 모듈들이라, 실제로 그런지 뮤테이션으로 확인할 값어치가 있다.

### 3-3. `stryker.crap.config.json` 의 이름과 내용이 어긋난다

파일명은 `crap` 인데 내용은 뮤테이션 설정뿐이고, CRAP 지수를 산출하는 장치는 이번에
처음 만들어졌다. 앞으로 두 지표를 함께 다룰 것이라면 이름과 실제를 맞추거나 CRAP
산출을 상시 게이트로 편입할지 정해야 한다.

---

## 4. 권고 (우선순위)

| # | 항목 | 근거 | 비용 |
| --- | --- | --- | --- |
| 1 | `hasCascadeImpact` 벤치마크 분기 단언 추가 | §2(A). 무증상 데이터 손실 경로 | 1줄 |
| 2 | `ci.yml` Node 22 정렬 + `engines` 명시 | §3-1. 뮤테이션 게이트가 성립하지 않는다 | 2줄 |
| 3 | `lib/google-forms.ts` 테스트 신설 | CRAP 위험 3건(306·90·90), 전용 테스트 없음, C-2 가 살던 자리 | 중 |
| 4 | `workbook-importer.ts` parse 계열 테스트 | CRAP 위험 6건, 모두 0% | 중 |
| 5 | 뮤테이션 대상에 §3-2 의 6개 모듈 추가 | 테스트가 이미 있어 추가 비용 없음 | 소 |
| 6 | 표시 문자열 상수 정책 결정 | §2(B). 현 상태로는 100% 기준 달성 불가 | 판단 |
| 7 | `import-json-schema.ts:21` 생존 원인 확인 | §2 확인 필요 | 소 |
| 8 | `oauth-nonce` payload 형태 가드 테스트 | §2(C). 지금은 취약점 아님, 리팩터링 안전망 | 소 |

`normalizeContext`(복잡도 22)·`parseSpec`(25)·`upsertPersonalConnection`(17) 은
커버리지가 이미 높으므로 테스트가 아니라 **분해**가 답이다. 다만 이번 점검의 범위를
넘으므로 별도 판단으로 남긴다.

---

## 부록 — 재현 방법

```sh
# CI 에서 (권장 — 로컬 npm 레지스트리가 막힌 환경 대응)
#   claude/** 브랜치에 push 하면 .github/workflows/crap.yml 이 자동 실행된다.

# 로컬에서 (npm 접근이 가능한 환경)
npm ci
npm install --no-save "@vitest/coverage-v8@$(node -p "require('./node_modules/vitest/package.json').version")"
npx prisma generate

npx eslint lib --rule '{"complexity":["warn",{"max":0}]}' -f json -o eslint-complexity.json
npx vitest run --pool=threads --coverage.enabled --coverage.provider=v8 \
    --coverage.reporter=json --coverage.include='lib/**/*.ts' --coverage.reportsDirectory=coverage
npm run test:mutation          # Node >= 22 필요

CRAP_MUTATION=./stryker-crap-report.json node scripts/crap-report.mjs
```

산출물은 `crap-report.md`(사람이 읽는 표)와 `crap-report.json`(원본 수치)이다.

## 부록 — 이번 변경의 게이트 검증

`ci.yml` 은 `main` 과 PR 에서만 도는 탓에 기능 브랜치의 변경이 저장소 게이트를 깨는지
확인할 경로가 없다. 이번에 추가한 `scripts/crap-report.mjs` 를 검증하려고 게이트를
워크플로에 임시로 붙여 실행한 뒤 제거했다.

```
npm run lint && npx tsc --noEmit    → success (run 33070146280)
```

`npx vitest run` 은 위 측정 과정에서 커버리지 수집과 함께 통과했다.

