export interface KanoAnalysisStatResponse {
    invitationId?: string | null;
    respondentEmail?: string | null;
}

export function countUniqueProjectRespondents(responses: KanoAnalysisStatResponse[]): number {
    const respondentKeys = responses.map((response) =>
        String(response.respondentEmail || response.invitationId || '').trim()
    ).filter(Boolean);
    return new Set(respondentKeys).size;
}

export function countProjectResponses(responses: KanoAnalysisStatResponse[]): number {
    return responses.length;
}
