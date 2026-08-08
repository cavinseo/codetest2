// 프로바이더 인스턴스 생성. 설정값을 읽어 그때그때 만들므로 설정 변경이 바로 반영된다.
import { getAiSettings } from '../service-settings';
import {
    buildCandidateBaseUrls,
    HERMES_BASE_URL_DEFAULTS,
    LOCAL_BASE_URL_DEFAULTS,
} from './endpoint-discovery';
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
                baseUrls: buildCandidateBaseUrls(settings.localBaseUrl, LOCAL_BASE_URL_DEFAULTS),
                model: settings.localModel,
                // Ollama/LM Studio 는 키가 없지만 OpenAI 호환 규격상 헤더가 필요한 구현이 있어 더미를 보낸다.
                apiKey: process.env.AI_LOCAL_API_KEY || 'local',
                allowRemoteHost: false,
            });

        case 'hermes':
            // 헤르메스 연동 규격이 확정되기 전까지 OpenAI 호환 엔드포인트로 가정하고,
            // 자체 서버·Ollama·LM Studio 어느 쪽에 올라와 있든 찾아내도록 후보를 넓게 둔다.
            return createOpenAiCompatibleProvider({
                id: 'hermes',
                label: '헤르메스 에이전트',
                baseUrls: buildCandidateBaseUrls(settings.hermesBaseUrl, HERMES_BASE_URL_DEFAULTS),
                model: settings.hermesModel,
                modelHint: 'hermes',
                apiKey: process.env.HERMES_API_KEY,
                allowRemoteHost: false,
            });

        case 'api':
            return createOpenAiCompatibleProvider({
                id: 'api',
                label: '클라우드 API',
                baseUrls: buildCandidateBaseUrls(process.env.AI_API_BASE_URL, []),
                model: process.env.AI_API_MODEL,
                apiKey: process.env.AI_API_KEY,
                allowRemoteHost: true,
            });

        case 'rule':
        default:
            return ruleProvider;
    }
}
