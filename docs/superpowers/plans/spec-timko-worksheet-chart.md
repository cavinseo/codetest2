---
title: 'WS-6·WS-7 TIMKO 워크시트 차트'
type: 'bugfix'
created: '2026-09-08'
status: 'done'
route: 'one-shot'
---

# WS-6·WS-7 TIMKO 워크시트 차트

## Intent

**Problem:** WS-6과 WS-7의 단색 사분면 차트가 사용자가 첨부한 워크시트의 격자·색상 구간과 달랐다.

**Approach:** 두 화면에 공용 10×10 격자를 적용했다. 셀별 색상, 상단 3.2~5.0 눈금, 우측 만족 계수와 하단 불만족 계수 구간을 재현하고 기존 점 좌표와 선택 동작을 유지했다.

## Suggested Review Order

1. [공용 격자](../../../components/TimkoWorksheetGrid.tsx). 첨부 이미지의 셀 색상과 축 배치를 확인한다.
2. [WS-6 차트](../../../components/Kano2DChart.tsx). 공용 격자와 점 좌표를 확인한다.
3. [WS-7 차트](../../../components/project/KanoSatisfactionGraph.tsx). 공용 격자와 기존 선택·상세표 연결을 확인한다.

검증 결과는 전체 테스트 107개 파일·1,227개 테스트 통과, 타입 검사와 수정 파일 ESLint 통과이다. 격자를 PNG로 렌더링하여 첨부 이미지와 대조했다. 독립 검토에서 지적한 가로축 제목과 WS-7 품질 영역 안내 누락은 보완했다. 전체 빌드는 Prisma 엔진 DLL 교체 시 EPERM 오류로 중단되어 Next.js 빌드 단계는 검증하지 못했다. 실제 앱 브라우저 확인은 도구 초기화 오류로 수행하지 못했다.
