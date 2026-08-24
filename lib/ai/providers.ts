// 프로바이더 인스턴스 생성.
// 설정은 DB 에 있어 조회가 async 다. 여기서 직접 읽으면 이 함수까지 async 가 되고
// registry 의 resolveProvider 확장점(테스트에서 프로바이더를 주입하는 곳)까지 번진다.
// 그래서 async 경계인 runAiTask 쪽에서 한 번 읽어 넘겨준다.
import type { AiSettings } from '../service-settings';
import {
    buildCandidateBaseUrls,
    HERMES_BASE_URL_DEFAULTS,
    LOCAL_BASE_URL_DEFAULTS,
} from './endpoint-discovery';
import { createOpenAiCompatibleProvider } from './openai-compatible';
import { ruleProvider } from './provider-rule';
import type { AiProvider, AiProviderId } from './types';

export function createProvider(id: AiProviderId, settings: AiSettings): AiProvider {

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

        case 'personal':
            // 개인 프로바이더는 사용자별 키가 필요해 전역 설정으로는 만들 수 없다.
            // registry 가 personalConnection 으로 직접 만들므로 여기 오면 배선 버그다.
            throw new Error('personal 프로바이더는 registry 의 personalConnection 으로만 생성됩니다.');

        case 'rule':
        default:
            return ruleProvider;
    }
}
