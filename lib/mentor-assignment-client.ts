// 단일·복수 멘토 배정 화면에서 사용하는 배정·해제 요청을 전송한다.

/** 이미 멘토가 있으면 새 배정이 아니라 교체이므로 버튼 문구로 구분한다. */
export function mentorAssignToggleLabel(mentorName: string | null, isOpen: boolean): string {
    const action = mentorName ? '멘토 변경' : '멘토 배정';
    return isOpen ? `${action} 닫기` : action;
}

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
