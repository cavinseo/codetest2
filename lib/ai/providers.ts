// 프로바이더 인스턴스 생성. 설정값을 읽어 그때그때 만들므로 설정 변경이 바로 반영된다.
import { getAiSettings } from '../service-settings';
import { createOpenAiCompatibleProvider } from './openai-compatible';
import { ruleProvider } from './provider-rule';
import type { AiProvider, AiProviderId } from './types';

export function createProvider(id: AiProviderId): AiProvider {
    const settings = getAiSettings();

    switch (id) {
        case 'local':
            return createOpenAiCompatibleProvider({
                id: 'local',
                label: '로컬 AI',
                baseUrl: settings.localBaseUrl,
                model: settings.localModel,
                // Ollama/LM Studio 는 키가 없지만 OpenAI 호환 규격상 헤더가 필요한 구현이 있어 더미를 보낸다.
                apiKey: process.env.AI_LOCAL_API_KEY || 'local',
                allowRemoteHost: false,
            });

        case 'hermes':
            // 헤르메스 연동 규격이 확정되기 전까지 OpenAI 호환 엔드포인트로 가정한다.
            return createOpenAiCompatibleProvider({
                id: 'hermes',
                label: '헤르메스 에이전트',
                baseUrl: settings.hermesBaseUrl,
                model: settings.hermesModel,
                apiKey: process.env.HERMES_API_KEY,
                allowRemoteHost: false,
            });

        case 'api':
            return createOpenAiCompatibleProvider({
                id: 'api',
                label: '클라우드 API',
                baseUrl: process.env.AI_API_BASE_URL || '',
                model: process.env.AI_API_MODEL || '',
                apiKey: process.env.AI_API_KEY,
                allowRemoteHost: true,
            });

        case 'rule':
        default:
            return ruleProvider;
    }
}
