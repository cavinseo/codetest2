// 단일·복수 멘토 배정 화면에서 사용하는 배정·해제 요청을 전송한다.
export async function requestMentorAssignment(
    endpoint: string,
    mentorId: string,
    method: 'POST' | 'DELETE'
): Promise<{ ok: boolean; error?: string }> {
    const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: mentorId }),
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, error: body?.error };
}
