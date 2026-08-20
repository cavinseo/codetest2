// 프로바이더 선택과 폴백을 담당한다.
// 어떤 이유로든 선택한 엔진이 실패하면 규칙 기반 엔진 결과를 돌려주고, degraded 플래그로 알린다.
import { createLogger } from '../logger';
import { getAiSettings } from '../service-settings';
import { createProvider } from './providers';
import { ruleProvider } from './provider-rule';
import type { AiProvider, AiProviderId, AiTaskOutcome } from './types';

const log = createLogger('lib/ai/registry');

export interface RunAiTaskOptions {
    requested?: AiProviderId;
    // 테스트에서 프로바이더를 주입하기 위한 확장점
    resolveProvider?: (id: AiProviderId) => AiProvider;
}

export async function runAiTask<T>(
    task: (provider: AiProvider) => Promise<T>,
    options: RunAiTaskOptions = {}
): Promise<AiTaskOutcome<T>> {
    // 설정 조회는 여기서 한 번만 한다. 아래 resolve 는 계속 동기라
    // 테스트의 resolveProvider 주입 방식이 그대로 유지된다.
    const settings = await getAiSettings();
    const resolve = options.resolveProvider ?? ((id: AiProviderId) => createProvider(id, settings));
    const requested = options.requested ?? settings.provider;

    if (requested === 'rule') {
        const fallback = resolve('rule');
        return {
            result: await task(fallback),
            provider: 'rule',
            requestedProvider: 'rule',
            degraded: false,
        };
    }

    const degrade = async (reason: string): Promise<AiTaskOutcome<T>> => {
        log.warn(`AI 프로바이더 폴백: ${requested} -> rule (${reason})`);
        return {
            result: await task(resolve('rule')),
            provider: 'rule',
            requestedProvider: requested,
            degraded: true,
            degradedReason: reason,
        };
    };

    let provider: AiProvider;
    try {
        provider = resolve(requested);
    } catch (error) {
        return degrade(toReason(error, '엔진을 초기화하지 못했습니다.'));
    }

    const available = await provider.isAvailable().catch(() => false);
    if (!available) {
        return degrade('엔진에 연결할 수 없습니다.');
    }

    try {
        return {
            result: await task(provider),
            provider: provider.id,
            requestedProvider: requested,
            degraded: false,
        };
    } catch (error) {
        return degrade(toReason(error, '엔진 호출에 실패했습니다.'));
    }
}

// 화면에 "현재 사용 가능한 엔진"을 보여주기 위한 조회.
export async function getProviderStatuses(
    resolveProvider?: (id: AiProviderId) => AiProvider
): Promise<Array<{ id: AiProviderId; label: string; available: boolean }>> {
    const settings = await getAiSettings();
    const resolve = resolveProvider ?? ((id: AiProviderId) => createProvider(id, settings));
    const ids: AiProviderId[] = ['rule', 'local', 'hermes', 'api'];

    return Promise.all(
        ids.map(async (id) => {
            try {
                const provider = resolve(id);
                return { id, label: provider.label, available: await provider.isAvailable().catch(() => false) };
            } catch {
                return { id, label: id, available: false };
            }
        })
    );
}

export { ruleProvider };

function toReason(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}
