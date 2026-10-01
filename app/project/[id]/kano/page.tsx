// Kano 설문을 프로젝트 워크시트 화면의 WS-6 탭으로 엽니다.
import { ProjectDetailWorkspace } from '../page';

export default function KanoSurveyPage() {
    return <ProjectDetailWorkspace initialTab="kano" />;
}
