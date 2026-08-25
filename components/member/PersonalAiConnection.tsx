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
    PERSONAL_AI_VENDORS,
    PERSONAL_AI_VENDOR_LABELS,
    PERSONAL_AI_VENDOR_PRESETS,
    type PersonalAiVendor,
} from '@/lib/ai/personal-vendors';

interface ConnectionSummary {
    vendor: PersonalAiVendor;
    model: string | null;
}

export default function PersonalAiConnection() {
    const [aiConn, setAiConn] = useState<ConnectionSummary | null>(null);
    const [aiForm, setAiForm] = useState({
        vendor: 'openai' as PersonalAiVendor,
        apiKey: '',
        model: '',
    });
    const [aiBusy, setAiBusy] = useState(false);
    const [aiMsg, setAiMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/me/ai-connection');
            const data = await res.json().catch(() => null);
            if (res.ok && data?.connection) {
                setAiConn(data.connection);
                setAiForm({
                    vendor: data.connection.vendor,
                    apiKey: '',
                    model: data.connection.model ?? '',
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
            const res = await fetch('/api/me/ai-connection', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendor: aiForm.vendor,
                    ...(aiForm.apiKey.trim() ? { apiKey: aiForm.apiKey.trim() } : {}),
                    ...(aiForm.model.trim() ? { model: aiForm.model.trim() } : {}),
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || '저장에 실패했습니다.');
            setAiConn(data.connection);
            // 키는 저장 즉시 입력칸에서 지운다 — 화면에 남겨둘 이유가 없다.
            setAiForm((prev) => ({ ...prev, apiKey: '' }));
            setAiMsg({
                type: 'success',
                text: '저장했습니다. [연결 확인]으로 키가 통하는지 점검해 보세요.',
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
        if (!window.confirm('등록된 AI 키를 삭제하시겠습니까?')) return;
        setAiBusy(true);
        setAiMsg(null);
        try {
            const res = await fetch('/api/me/ai-connection', { method: 'DELETE' });
            if (!res.ok) throw new Error('삭제에 실패했습니다.');
            setAiConn(null);
            setAiForm({ vendor: 'openai', apiKey: '', model: '' });
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

    return (
        <section className="card space-y-4">
            <div>
                <h2 className="text-sm font-bold text-white">내 AI 연결</h2>
                <p className="mt-1 text-xs text-gray-500">
                    본인의 OpenAI·Claude·Gemini API 키를 등록하면, 프로젝트 AI 모드에서
                    「내 AI (개인 키)」를 골라 쓸 수 있습니다. 키는 암호화되어 저장되고 다시
                    표시되지 않으며, 사용 요금은 본인의 벤더 계정에 청구됩니다.
                </p>
            </div>

            {aiConn && (
                <p className="text-xs text-emerald-300">
                    ✅ {PERSONAL_AI_VENDOR_LABELS[aiConn.vendor]} 키가 등록되어 있습니다.
                </p>
            )}

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
                {aiConn && (
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
                    disabled={aiBusy || (
                        !aiForm.apiKey.trim() && aiConn?.vendor !== aiForm.vendor
                    )}
                    className="btn-primary text-sm disabled:opacity-50"
                    id="personal-ai-save"
                >
                    {aiBusy ? '처리 중...' : '저장'}
                </button>
            </div>
        </section>
    );
}
