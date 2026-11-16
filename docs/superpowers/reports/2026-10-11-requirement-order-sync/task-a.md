# 고객요구사항·Kano·후속 워크시트 순서 연동 완료 보고.

## RESULT.

완료했다. 고객요구사항의 2차 그룹 → 1차 그룹 → 요구사항 순서를 공통 기준으로 적용했다.

- 요구사항 저장은 기존 ID를 유지하고 생략된 Kano 교정 문항·가중치를 덮어쓰지 않는다. 명시적인 null 초기화는 유지한다.
- 저장된 Kano 응답·QFD 관계·경쟁사 값은 기존 항목 ID에 남는다. 설문·집계·QFD 표시 순서만 변경한다.
- WS-10·11·13의 유일한 문구 연결은 요구사항 수정과 함께 문구 및 순서를 갱신한다. 입력한 기술·비율·목표·분기·담당자 등은 같은 행에 남는다.
- WS-12는 연결된 WS-10 핵심·세부스펙 묶음으로 정렬하여 목표값을 보존한다. 일부 세부스펙만 연결되어도 핵심 묶음이 분리되지 않는다.
- QFD TOP5 선정과 점수는 유지하며 선정 후 표시만 고객요구사항 순서를 따른다. WS-13에서 WS-11 일부 목록이 기존 순서를 다시 바꾸는 문제도 수정했다.
- 온라인 설문, Word 설문지, 오프라인 HTML, Google Forms 스크립트, 응답 엑셀 양식, 워크시트 화면·새 보고서·백업·엑셀 출력에 같은 순서를 적용한다.
- 새 응답 파일에 항목 ID를 보관한다. 재정렬 전에 받은 응답은 파일의 ID 또는 유일한 기존 질문 문구로 원래 항목에 저장한다.

## FILES CHANGED.

작업 커밋은 52개 파일이다. 상세 목록은 다음과 같다.

- `app/api/projects/[id]/export/route.ts`.
- `app/api/projects/[id]/improvements/route.ts`.
- `app/api/projects/[id]/kano/analysis/route.ts`.
- `app/api/projects/[id]/kano/form-script/route.ts`.
- `app/api/projects/[id]/kano/offline-form/route.ts`.
- `app/api/projects/[id]/kano/survey-document/route.ts`.
- `app/api/projects/[id]/kano/upload-excel/route.ts`.
- `app/api/projects/[id]/kano/upload-offline/route.ts`.
- `app/api/projects/[id]/kano/upload-template/route.ts`.
- `app/api/projects/[id]/qfd/analysis/route.ts`.
- `app/api/projects/[id]/requirements/route.ts`.
- `app/api/projects/[id]/target-spec/route.ts`.
- `app/api/projects/[id]/tech-roadmap/route.ts`.
- `app/api/projects/[id]/tech-tree/route.ts`.
- `app/api/survey/[token]/route.ts`.
- `components/project/ImprovementsTable.tsx`.
- `components/project/QFDMatrix.tsx`.
- `components/project/TechRoadmapTable.tsx`.
- `components/project/TechTreeTable.tsx`.
- `docs/superpowers/plans/2026-10-11-requirement-order-sync.md`.
- `lib/bulk-worksheet-route.ts`.
- `lib/final-report-requirement-order.ts`.
- `lib/final-report-template.ts`.
- `lib/final-report-worksheet-tables.ts`.
- `lib/kano-google-form-script.ts`.
- `lib/kano-requirement-snapshot.ts`.
- `lib/kano-response-store.ts`.
- `lib/kano-upload-parser.ts`.
- `lib/kano-upload-template.ts`.
- `lib/requirement-order-store.ts`.
- `lib/requirement-order.ts`.
- `lib/worksheet-excel-writers.ts`.
- `lib/worksheet-excel.ts`.
- `tests/api-kano-google-forms-disabled.test.ts`.
- `tests/api-kano-offline-form.test.ts`.
- `tests/api-kano-upload-excel.test.ts`.
- `tests/api-kano-upload-offline.test.ts`.
- `tests/api-report-fitness-export.test.ts`.
- `tests/api-requirements-order-sync.test.ts`.
- `tests/api-tech-tree-target-sync.test.ts`.
- `tests/api-worksheet-cascade.test.ts`.
- `tests/api-worksheet-excel.test.ts`.
- `tests/api-worksheet-link-regressions.test.ts`.
- `tests/kano-requirement-snapshot.test.ts`.
- `tests/report-worksheet-tables.test.ts`.
- `tests/requirement-linked-order.test.ts`.
- `tests/requirement-order-outputs.test.ts`.
- `tests/requirement-order-roadmap-ui.test.ts`.
- `tests/requirement-order-store.test.ts`.
- `tests/worksheet-excel-preservation.test.ts`.
- `tests/worksheet-excel.test.ts`.
- `tests/worksheet-load-safety.test.ts`.

주 작업 폴더의 기존 리팩토링과 개정값 검사 코드를 보존하여 같은 기능을 통합했다. 그 폴더에만 존재하는 `tests/api-requirements-batch-save.test.ts`의 모의 데이터와 `tests/api-project-export.test.ts`의 order fixture도 이번 조회·갱신에 맞게 보완했다. 해당 폴더의 관련 없는 기존 변경은 이 커밋에 포함하지 않았다.

## COMMIT.

- 브랜치 `codex/requirement-order-sync-20261011`.
- 계획 커밋 `a71d2e8`.
- 코드 커밋 `80991212198917c5d12461983d3b0c9520dd3773`.
- 작업 폴더 `E:/Dropbox/codetest2`에 이번 변경을 반영했다. 그 폴더의 기존 미커밋 작업은 보존했다.
- 푸시·배포는 이번 요청에 포함되지 않아 실행하지 않았다.

## VERIFIED BY.

원격 DB를 사용하지 않는 더미 환경변수와 Prisma mock으로 수행했다. 개발 서버·실DB 쓰기·스키마 변경·마이그레이션은 수행하지 않았다.

### 분리된 변경 브랜치.

- `npx tsc --noEmit`은 출력 없이 exit 0이다.
- `npm run lint`는 `> eslint .` 실행 후 exit 0이다.
- `npm run test`의 마지막 집계다.

```text
 Test Files  229 passed (229)
      Tests  3111 passed (3111)
   Start at  16:09:00
   Duration  18.07s (transform 32.74s, setup 0ms, import 111.29s, tests 56.58s, environment 66.44s)
```

- `npm run build`는 exit 0이고 마지막 줄은 다음과 같다.

```text
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

### 기존 작업과 통합된 사용자 폴더.

- `npx tsc --noEmit`, `npm run lint`, `npm run build`는 모두 exit 0이다.
- `npm run test`는 한글 인코딩 검사 후 다음 집계를 출력했다.

```text
 Test Files  239 passed (239)
      Tests  3198 passed (3198)
   Start at  16:09:36
   Duration  14.45s (transform 19.23s, setup 0ms, import 81.24s, tests 49.96s, environment 52.87s)
```

### 확인한 회귀 경로.

- 구현 전 요구사항 API의 공통 순서·생략된 문항 보존 테스트 실패를 확인했다.
- ID·응답·QFD 연결 유지, 명시적 null 초기화, 중복·빈 문구 보존, A/B 이름 교환, 변경 없는 행의 DB 갱신 생략을 검사했다.
- 엑셀·HTML 순서 변경 전 파일 업로드, 문항 추가 후 업로드, Google Forms 문항 헤더, 삭제·중복·식별 불가 ID 저장 전 거부, 부분 성공을 검사했다.
- 실제 WS-13 컴포넌트의 화면·POST 본문·저장 후 순서와 모든 작성값을 검사했다.
- 실제 온라인·Word XML·오프라인·스크립트·Kano 집계·QFD·보고서·워크시트 엑셀 출력을 검사했다.
- 읽기 전용 검토 담당자가 주 폴더의 기존 권한·개정값·트랜잭션·백업 코드 보존을 확인했다. 정렬 전 DB 행의 revision 계산이 유지된다.
- `git diff --check`는 통과했다. 기존 Stryker mutate 목록 파일은 이번 변경 대상에 없으므로 의무 뮤테이션 재실행 대상이 없다.

## DEVIATIONS.

- 항목 ID나 유일한 질문 문구가 없는 과거 번호 전용 응답 파일은 현재 순서에 임의 대입하지 않고 400으로 거부한다. 데이터 오연결을 방지하기 위한 필요한 변경이다.
- 전체 워크시트 엑셀에 숨김 `Kano문항연결` 시트를 추가하여 기존 17개에서 18개 시트가 되었다. 기존 데이터·서식·수식 검사 단언은 유지하고 시트 수와 의도적으로 바뀐 순서·번호 표제·보존 해시만 갱신했다.
- 조회 실패 보호 테스트에 새 requirements 조회 응답을 추가했고 API 테스트에 후속 모델을 mock했다. 기존 테스트는 삭제하지 않았다.
- WS-11은 중요도 선정 후 표시 순서를 바꾸므로 표제 `순위`를 `번호`로 바꾸고 QFD 중요도와의 관계를 안내했다.
- WS-13 UI 테스트는 현재 설정이 `.test.ts`만 수집하므로 createElement를 사용하여 `.test.ts`로 작성했다. 테스트 설정은 바꾸지 않았다. 이 UI 테스트의 최초 실행 시점에는 수정이 반영되어 별도 실패 실행은 남기지 못했다.

## RISKS.

- 실계정 브라우저와 원격 실DB에서의 검증은 CLAUDE.md 환경 제약에 따라 실행하지 않았다. 기존 데이터는 조회할 때 새 순서로 재구성되며 WS-5 저장 시 DB의 연결 행 order도 갱신된다. 실DB의 일괄 쓰기 작업은 실행하지 않았다.
- WS-10·11·13의 과거 연결은 ID가 없는 텍스트 방식이다. 중복 문구·수동 작성·빈 내용은 특정 요구사항으로 추측하여 변경하지 않고 내용과 상대 순서를 보존한다.
- 배포 전에 배포된 이전 버전의 Google Forms 스크립트·응답 양식에는 항목 ID가 없을 수 있다. 유일한 기존 문구로 식별할 수 있으면 가져오고 식별할 수 없으면 재다운로드한 양식을 사용해야 한다.
- 완료 보고서는 저장 스냅샷 계약을 유지한다. 변경된 워크시트 순서는 새 보고서 생성 또는 표 갱신에 반영된다.
- 기존 Vite 설정 안내와 Browserslist 갱신 안내는 실패가 아닌 경고이며 이번 범위에서 설정을 변경하지 않았다.

## QUESTIONS.

추가 질문은 없다.
