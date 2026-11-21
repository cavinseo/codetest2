export interface KanoResetClient {
    kanoResponse: {
        deleteMany(args: { where: { projectId: string; respondentEmail?: { in: string[] } } }): Promise<{ count: number }>;
    };
    kanoSurveyInvitation: {
        deleteMany(args: { where: { projectId: string } }): Promise<{ count: number }>;
        updateMany(args: {
            where: { projectId: string; email?: { in: string[] } };
            data: { respondedAt: null; isUsed: false };
        }): Promise<{ count: number }>;
    };
}

export async function resetKanoProjectResponses(
    client: KanoResetClient,
    projectId: string,
    options: { includeInvitations?: boolean; respondentEmails?: string[] } = {}
) {
    const deletedResponses = await client.kanoResponse.deleteMany({
        where: { projectId, ...(options.respondentEmails ? { respondentEmail: { in: options.respondentEmails } } : {}) },
    });

    if (options.includeInvitations) {
        const deletedInvitations = await client.kanoSurveyInvitation.deleteMany({
            where: { projectId },
        });

        return {
            deletedResponses: deletedResponses.count,
            resetInvitations: 0,
            deletedInvitations: deletedInvitations.count,
        };
    }

    const resetInvitations = await client.kanoSurveyInvitation.updateMany({
        where: { projectId, ...(options.respondentEmails ? { email: { in: options.respondentEmails } } : {}) },
        data: {
            respondedAt: null,
            isUsed: false,
        },
    });

    return {
        deletedResponses: deletedResponses.count,
        resetInvitations: resetInvitations.count,
        deletedInvitations: 0,
    };
}
