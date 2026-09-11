'use client';
// 코멘트 편집을 조회 전용 워크시트 밖에 두어 원본 편집 권한과 분리한다.
import { useCallback, useEffect, useState } from 'react';
interface Comment { id: string; content: string; authorId: string | null; author: { name: string | null } | null; createdAt: string; }
export default function WorksheetComments({ projectId, worksheetId }: { projectId: string; worksheetId: string }) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [canComment, setCanComment] = useState(false);
    const [userId, setUserId] = useState('');
    const [text, setText] = useState('');
    const [editing, setEditing] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const url = `/api/projects/${projectId}/comments?worksheetId=${encodeURIComponent(worksheetId)}`;
    const load = useCallback(async () => {
        try {
            const res = await fetch(url); const data = await res.json();
            if (!res.ok) throw new Error(data.error || '의견을 불러오지 못했습니다.');
            setComments(data.comments); setCanComment(data.canComment); setUserId(data.userId);
        } catch (cause) { setError(cause instanceof Error ? cause.message : '의견 조회 실패'); }
    }, [url]);
    useEffect(() => { void load(); }, [load]);
    const save = async (method: string, id?: string) => {
        setBusy(true); setError('');
        try {
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...(method === 'DELETE' ? {} : { content: text }) }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '본인 의견만 변경할 수 있습니다.');
            setText(''); setEditing(null); await load();
        } catch (cause) { setError(cause instanceof Error ? cause.message : '의견 저장 실패'); }
        finally { setBusy(false); }
    };
    return <section className="card mt-6 space-y-3" aria-label="워크시트 멘토 의견">
        <h2 className="font-semibold text-white">멘토 의견</h2>
        {error && <p role="alert" className="text-rose-400 text-sm">{error}</p>}
        {comments.length === 0 && <p className="text-sm text-gray-400">등록된 의견이 없습니다.</p>}
        {comments.map(comment => <article key={comment.id} className="border-b border-white/10 pb-3">
            <p className="text-xs text-gray-400">{comment.author?.name || '탈퇴한 회원'} · {new Date(comment.createdAt).toLocaleString('ko-KR')}</p>
            <p className="whitespace-pre-wrap text-sm mt-2">{comment.content}</p>
            {canComment && comment.authorId === userId && <div className="flex gap-3 mt-2">
                <button disabled={busy} className="text-sm text-primary-400" onClick={() => { setEditing(comment.id); setText(comment.content); }}>수정</button>
                <button disabled={busy} className="text-sm text-rose-400" onClick={() => { if (window.confirm('이 의견을 삭제할까요?')) void save('DELETE', comment.id); }}>삭제</button>
            </div>}
        </article>)}
        {canComment && <form onSubmit={event => { event.preventDefault(); void save(editing ? 'PATCH' : 'POST', editing || undefined); }}>
            <label className="text-sm">{editing ? '의견 수정' : '의견 작성'}<textarea className="input mt-2" maxLength={5000} rows={3} value={text} onChange={event => setText(event.target.value)} disabled={busy} /></label>
            <button className="btn-primary mt-2" disabled={busy || !text.trim()}>{busy ? '저장 중…' : '의견 저장'}</button>
            {editing && <button type="button" className="btn-secondary ml-2" onClick={() => { setEditing(null); setText(''); }}>취소</button>}
        </form>}
    </section>;
}
