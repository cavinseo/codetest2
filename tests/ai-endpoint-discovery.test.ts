import { describe, expect, it } from 'vitest';
import {
    buildCandidateBaseUrls,
    extractModelIds,
    HERMES_BASE_URL_DEFAULTS,
    LOCAL_BASE_URL_DEFAULTS,
    nativeTagsUrl,
    pickModel,
} from '../lib/ai/endpoint-discovery';

describe('후보 주소 목록', () => {
    it('설정한 주소를 맨 앞에 두고 기본 후보를 뒤에 붙인다', () => {
        expect(buildCandidateBaseUrls('http://localhost:9999/v1', LOCAL_BASE_URL_DEFAULTS)).toEqual([
            'http://localhost:9999/v1',
            'http://localhost:11434/v1',
            'http://localhost:1234/v1',
            'http://localhost:8000/v1',
        ]);
    });

    it('설정 주소가 기본 후보와 같으면 중복을 없앤다', () => {
        expect(buildCandidateBaseUrls('http://localhost:11434/v1/', LOCAL_BASE_URL_DEFAULTS)).toEqual(
            LOCAL_BASE_URL_DEFAULTS
        );
    });

    it('설정이 비어 있어도 기본 후보로 탐색한다', () => {
        expect(buildCandidateBaseUrls('', HERMES_BASE_URL_DEFAULTS)).toEqual(HERMES_BASE_URL_DEFAULTS);
        expect(buildCandidateBaseUrls(undefined, [])).toEqual([]);
    });
});

describe('모델 목록 해석', () => {
    it('OpenAI 호환 응답을 읽는다', () => {
        expect(extractModelIds({ data: [{ id: 'qwen2.5:7b' }, { id: 'llama3.1:8b' }] })).toEqual([
            'qwen2.5:7b',
            'llama3.1:8b',
        ]);
    });

    it('Ollama 네이티브 응답도 읽는다', () => {
        expect(extractModelIds({ models: [{ name: 'hermes3:8b' }] })).toEqual(['hermes3:8b']);
    });

    it('형식이 다르면 빈 배열을 돌려준다', () => {
        expect(extractModelIds(null)).toEqual([]);
        expect(extractModelIds({ unexpected: true })).toEqual([]);
    });
});

describe('모델 선택', () => {
    const models = ['qwen2.5:7b-instruct', 'hermes3:8b', 'llama3.1:8b'];

    it('설정한 모델이 정확히 있으면 그대로 쓴다', () => {
        expect(pickModel(models, 'hermes3:8b')).toBe('hermes3:8b');
    });

    it('접두사만 맞아도 실제 태그를 찾아낸다', () => {
        expect(pickModel(models, 'qwen2.5:7b')).toBe('qwen2.5:7b-instruct');
    });

    it('설정 모델이 없으면 힌트로 고른다', () => {
        expect(pickModel(models, '', 'hermes')).toBe('hermes3:8b');
    });

    it('힌트도 안 맞으면 첫 모델을 쓴다', () => {
        expect(pickModel(models, '', 'mistral')).toBe('qwen2.5:7b-instruct');
    });

    it('목록이 비면 설정값을 그대로 돌려준다', () => {
        expect(pickModel([], 'my-model')).toBe('my-model');
    });
});

describe('Ollama 네이티브 경로 변환', () => {
    it('/v1 을 떼고 /api/tags 를 붙인다', () => {
        expect(nativeTagsUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/api/tags');
        expect(nativeTagsUrl('http://localhost:11434')).toBe('http://localhost:11434/api/tags');
    });
});
