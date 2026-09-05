// Google Forms 연동처럼 아직 열지 않은 기능의 on/off 를 한 곳에 모은다.
//
// 화면과 라우트가 각자 false 를 들고 있으면 기능을 열 때 한쪽만 고쳐져 반쯤 열린 상태가
// 된다. 여기 한 줄만 true 로 바꾸면 화면과 서버가 함께 열리게 한다.

/** Google Forms 연동은 개발 중이다. 완료되면 이 값을 true 로 바꾼다. */
export const GOOGLE_FORMS_INTEGRATION_ENABLED = false;

export const GOOGLE_FORMS_DISABLED_MESSAGE =
    'Google Forms 연동은 개발 중입니다. 응답 파일 업로드 또는 오프라인 응답파일 업로드를 사용해 주세요.';
