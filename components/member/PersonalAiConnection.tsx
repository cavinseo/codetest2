'use client';
// 내 AI 연결 카드. 사용자 정보(/profile)와 서비스 설정(/settings) 양쪽에서 쓴다.
//
// 자립형이다 — 마운트 시 스스로 /api/me/ai-connection 을 읽고, 저장·확인·삭제도
// 스스로 처리한다. 두 화면이 상태를 각자 들고 있으면 한쪽에서 저장한 것이
// 다른 쪽에 안 보이는 어긋남이 생기므로, 화면은 이 컴포넌트를 놓기만 한다.
//
// 키는 서버가 어떤 형태로도 돌려주지 않는다. 저장 즉시 입력칸을 비우고,
// "등록됨" 사실만 표시한다.

import { useCallback, useEffect, useState } from 'react';
import {
    MEMBER_AI_MODES,
    MEMBER_AI_MODE_DESCRIPTIONS,
    MEMBER_AI_MODE_LABELS,
    PERSONAL_AI_VENDORS,
    PERSONAL_AI_VENDOR_LABELS,
    PERSONAL_AI_VENDOR_PRESETS,
    parseMemberAiMode,
    type MemberAiMode,
    type PersonalAiVendor,
} from '@/lib/ai/personal-vendors';

interface ConnectionSummary {
    mode: MemberAiMode;
    vendor: PersonalAiVendor | null;
    model: string | null;
    mcpBaseUrl: string | null;
    mcpModel: string | null;
    localBaseUrl: string | null;
    localModel: string | null;
}

interface AiConnectionForm {
    mode: MemberAiMode;
    vendor: PersonalAiVendor;
    apiKey: string;
    model: string;
    mcpBaseUrl: string;
    mcpModel: string;
    localBaseUrl: string;
    localModel: string;
}

const INITIAL_AI_FORM: AiConnectionForm = {
    mode: 'rule',
    vendor: 'openai',
    apiKey: '',
    model: '',
    mcpBaseUrl: '',
    mcpModel: '',
    localBaseUrl: '',
    localModel: '',
};

function parseConnectionSummary(value: unknown): ConnectionSummary | null {
    if (!value || typeof value !== 'object') return null;
    const source = value as Record<string, unknown>;
    const mode = parseMemberAiMode(source.mode) ?? 'rule';
    const vendor = PERSONAL_AI_VENDORS.includes(source.vendor as PersonalAiVendor)
        ? source.vendor as PersonalAiVendor
        : null;

    return {
        mode,
        vendor,
        model: typeof source.model === 'string' ? source.model : null,
        mcpBaseUrl: typeof source.mcpBaseUrl === 'string' ? source.mcpBaseUrl : null,
        mcpModel: typeof source.mcpModel === 'string' ? source.mcpModel : null,
        localBaseUrl: typeof source.localBaseUrl === 'string' ? source.localBaseUrl : null,
        localModel: typeof source.localModel === 'string' ? source.localModel : null,
    };
}

export default function PersonalAiConnection() {
    const [aiConn, setAiConn] = useState<ConnectionSummary | null>(null);
    const [aiForm, setAiForm] = useState<AiConnectionForm>(INITIAL_AI_FORM);
    const [aiBusy, setAiBusy] = useState(false);
    const [aiMsg, setAiMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/me/ai-connection');
            const data = await res.json().catch(() => null);
            if (res.ok) {
                const connection = parseConnectionSummary(data?.connection);
                setAiConn(connection);
                if (!connection) {
                    setAiForm({ ...INITIAL_AI_FORM });
                    return;
                }
                setAiForm({
                    mode: connection.mode,
                    vendor: connection.vendor ?? 'openai',
                    apiKey: '',
                    model: connection.model ?? '',
                    mcpBaseUrl: connection.mcpBaseUrl ?? '',
                    mcpModel: connection.mcpModel ?? '',
                    localBaseUrl: connection.localBaseUrl ?? '',
                    localModel: connection.localModel ?? '',
                });
            }
            // 401(미로그인)·403 은 조용히 미등록 상태로 둔다. 이 카드가 쓰이는
            // 화면들은 각자 로그인 처리를 이미 갖고 있다.
        } catch {
            // 네트워크 실패도 미등록 표시로 끝낸다. 카드가 화면을 멈추게 하지 않는다.
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const saveAiConnection = async () => {
        setAiBusy(true);
        setAiMsg(null);
        try {
            let payload: Record<string, string> = { mode: aiForm.mode };
            if (aiForm.mode === 'api') {
                payload = {
                    mode: aiForm.mode,
                    vendor: aiForm.vendor,
                    ...(aiForm.apiKey.trim() ? { apiKey: aiForm.apiKey.trim() } : {}),
                    ...(aiForm.model.trim() ? { model: aiForm.model.trim() } : {}),
                };
            } else if (aiForm.mode === 'mcp') {
                payload = {
                    mode: aiForm.mode,
                    mcpBaseUrl: aiForm.mcpBaseUrl.trim(),
                    ...(aiForm.mcpModel.trim() ? { mcpModel: aiForm.mcpModel.trim() } : {}),
                    ...(aiForm.apiKey.trim() ? { apiKey: aiForm.apiKey.trim() } : {}),
                };
            } else if (aiForm.mode === 'local') {
                payload = {
                    mode: aiForm.mode,
                    ...(aiForm.localBaseUrl.trim()
                        ? { localBaseUrl: aiForm.localBaseUrl.trim() }
                        : {}),
                    ...(aiForm.localModel.trim() ? { localModel: aiForm.localModel.trim() } : {}),
                };
            }

            const res = await fetch('/api/me/ai-connection', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || '저장에 실패했습니다.');
            setAiConn(parseConnectionSummary(data?.connection));
            // 키는 저장 즉시 입력칸에서 지운다 — 화면에 남겨둘 이유가 없다.
            setAiForm((prev) => ({ ...prev, apiKey: '' }));
            setAiMsg({
                type: 'success',
                text: aiForm.mode === 'rule'
                    ? '저장했습니다.'
                    : '저장했습니다. [연결 확인]으로 연결 상태를 점검해 보세요.',
            });
        } catch (error) {
            setAiMsg({
                type: 'error',
                text: error instanceof Error ? error.message : '저장에 실패했습니다.',
            });
        } finally {
            setAiBusy(false);
        }
    };

    const verifyAiConnection = async () => {
        setAiBusy(true);
        setAiMsg(null);
        try {
            const res = await fetch('/api/me/ai-connection/verify', { method: 'POST' });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || '연결 확인에 실패했습니다.');
            setAiMsg({ type: data.ok ? 'success' : 'error', text: data.message });
        } catch (error) {
            setAiMsg({
                type: 'error',
                text: error instanceof Error ? error.message : '연결 확인에 실패했습니다.',
            });
        } finally {
            setAiBusy(false);
        }
    };

    const removeAiConnection = async () => {
        if (!window.confirm('저장된 AI 연결 설정을 삭제하시겠습니까?')) return;
        setAiBusy(true);
        setAiMsg(null);
        try {
            const res = await fetch('/api/me/ai-connection', { method: 'DELETE' });
            if (!res.ok) throw new Error('삭제에 실패했습니다.');
            setAiConn(null);
            setAiForm({ ...INITIAL_AI_FORM });
            setAiMsg({ type: 'success', text: '삭제했습니다.' });
        } catch (error) {
            setAiMsg({
                type: 'error',
                text: error instanceof Error ? error.message : '삭제에 실패했습니다.',
            });
        } finally {
            setAiBusy(false);
        }
    };

    const canSave = aiForm.mode === 'rule'
        || aiForm.mode === 'local'
        || (aiForm.mode === 'mcp' && Boolean(aiForm.mcpBaseUrl.trim()))
        || (aiForm.mode === 'api' && Boolean(
            aiForm.apiKey.trim() || aiConn?.vendor === aiForm.vendor
        ));

    return (
        <section className="card space-y-4">
            <div>
                <h2 className="text-sm font-bold text-white">내 AI 연결</h2>
                <p className="mt-1 text-xs text-gray-500">
                    규칙 기반 또는 본인의 API·원격 MCP·로컬 AI를 선택할 수 있습니다.
                    인증 키는 암호화되어 저장되고 다시 표시되지 않으며 다른 회원과 공유되지 않습니다.
                </p>
            </div>

            <fieldset>
                <legend className="text-sm font-medium text-gray-400">연결 방식</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {MEMBER_AI_MODES.map((mode) => (
                        <label
                            key={mode}
                            className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                                aiForm.mode === mode
                                    ? 'border-indigo-400/60 bg-indigo-500/10'
                                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                            }`}
                            htmlFor={`personal-ai-mode-${mode}`}
                        >
                            <input
                                type="radio"
                                name="personal-ai-mode"
                                value={mode}
                                checked={aiForm.mode === mode}
                                onChange={() => {
                                    setAiForm((prev) => ({ ...prev, mode }));
                                    setAiMsg(null);
                                }}
                                disabled={aiBusy}
                                className="mt-1 h-4 w-4 accent-indigo-500"
                                id={`personal-ai-mode-${mode}`}
                            />
                            <span>
                                <span className="block text-sm font-semibold text-gray-200">
                                    {MEMBER_AI_MODE_LABELS[mode]}
                                </span>
                                <span className="mt-1 block text-xs leading-relaxed text-gray-500">
                                    {MEMBER_AI_MODE_DESCRIPTIONS[mode]}
                                </span>
                            </span>
                        </label>
                    ))}
                </div>
            </fieldset>

            {aiConn && (
                <p className="text-xs text-emerald-300">
                    ✅ {MEMBER_AI_MODE_LABELS[aiConn.mode]} 설정이 저장되어 있습니다.
                </p>
            )}

            {aiForm.mode === 'rule' && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-gray-400">
                    {MEMBER_AI_MODE_DESCRIPTIONS.rule}
                </div>
            )}

            {aiForm.mode === 'api' && (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-medium text-gray-400">
                            벤더
                            <select
                                className="input mt-2"
                                value={aiForm.vendor}
                                onChange={(e) => setAiForm({
                                    ...aiForm,
                                    vendor: e.target.value as PersonalAiVendor,
                                })}
                                id="personal-ai-vendor"
                            >
                                {PERSONAL_AI_VENDORS.map((vendor) => (
                                    <option key={vendor} value={vendor}>
                                        {PERSONAL_AI_VENDOR_LABELS[vendor]}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-sm font-medium text-gray-400">
                            모델 <span className="text-gray-600">(선택)</span>
                            <input
                                className="input mt-2"
                                value={aiForm.model}
                                placeholder={PERSONAL_AI_VENDOR_PRESETS[aiForm.vendor].defaultModel}
                                onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                                id="personal-ai-model"
                            />
                        </label>
                    </div>

                    <label className="block text-sm font-medium text-gray-400">
                        API 키 {aiConn?.vendor === aiForm.vendor && (
                            <span className="text-gray-600">(비워 두면 저장된 키 유지)</span>
                        )}
                        <input
                            type="password"
                            className="input mt-2"
                            value={aiForm.apiKey}
                            autoComplete="off"
                            placeholder="sk-..."
                            onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
                            id="personal-ai-key"
                        />
                    </label>
                </>
            )}

            {aiForm.mode === 'mcp' && (
                <>
                    <label className="block text-sm font-medium text-gray-400">
                        원격 MCP 주소
                        <input
                            className="input mt-2"
                            value={aiForm.mcpBaseUrl}
                            placeholder="https://my-llm.example.com/v1"
                            onChange={(e) => setAiForm({ ...aiForm, mcpBaseUrl: e.target.value })}
                            id="personal-ai-mcp-base-url"
                        />
                        <span className="mt-1 block text-xs text-gray-600">
                            https 공인 주소만 허용됩니다.
                        </span>
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-medium text-gray-400">
                            모델 <span className="text-gray-600">(선택)</span>
                            <input
                                className="input mt-2"
                                value={aiForm.mcpModel}
                                onChange={(e) => setAiForm({ ...aiForm, mcpModel: e.target.value })}
                                id="personal-ai-mcp-model"
                            />
                        </label>
                        <label className="block text-sm font-medium text-gray-400">
                            API 키 <span className="text-gray-600">(선택)</span>
                            <input
                                type="password"
                                className="input mt-2"
                                value={aiForm.apiKey}
                                autoComplete="off"
                                onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
                                id="personal-ai-mcp-key"
                            />
                        </label>
                    </div>
                </>
            )}

            {aiForm.mode === 'local' && (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-medium text-gray-400">
                            로컬 주소 <span className="text-gray-600">(선택)</span>
                            <input
                                className="input mt-2"
                                value={aiForm.localBaseUrl}
                                placeholder="http://localhost:11434/v1"
                                onChange={(e) => setAiForm({ ...aiForm, localBaseUrl: e.target.value })}
                                id="personal-ai-local-base-url"
                            />
                            <span className="mt-1 block text-xs text-gray-600">
                                비우면 Ollama·LM Studio 기본 주소를 자동 탐색합니다.
                            </span>
                        </label>
                        <label className="block text-sm font-medium text-gray-400">
                            모델 <span className="text-gray-600">(선택)</span>
                            <input
                                className="input mt-2"
                                value={aiForm.localModel}
                                onChange={(e) => setAiForm({ ...aiForm, localModel: e.target.value })}
                                id="personal-ai-local-model"
                            />
                        </label>
                    </div>
                    <p className="text-xs leading-relaxed text-amber-300/80">
                        온라인 접속 시에는 서버가 내 PC 에 닿지 못해 규칙 기반으로 자동 전환될 수 있습니다.
                    </p>
                </>
            )}

            {aiMsg && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${aiMsg.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                    }`}>
                    {aiMsg.text}
                </div>
            )}

            <div className="flex justify-end gap-2">
                {aiConn && (
                    <button
                        type="button"
                        onClick={removeAiConnection}
                        disabled={aiBusy}
                        className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                        id="personal-ai-delete"
                    >
                        삭제
                    </button>
                )}
                {aiForm.mode !== 'rule' && (
                    <button
                        type="button"
                        onClick={verifyAiConnection}
                        disabled={aiBusy}
                        className="btn-secondary text-sm disabled:opacity-50"
                        id="personal-ai-verify"
                    >
                        연결 확인
                    </button>
                )}
                <button
                    type="button"
                    onClick={saveAiConnection}
                    disabled={aiBusy || !canSave}
                    className="btn-primary text-sm disabled:opacity-50"
                    id="personal-ai-save"
                >
                    {aiBusy ? '처리 중...' : '저장'}
                </button>
            </div>
        </section>
    );
}
