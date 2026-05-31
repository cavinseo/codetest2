export interface KanoResetClient {
    kanoResponse: {
        deleteMany(args: { where: { projectId: string } }): Promise<{ count: number }>;
    };
    kanoSurveyInvitation: {
        deleteMany(args: { where: { projectId: string } }): Promise<{ count: number }>;
        updateMany(args: {
            where: { projectId: string };
            data: { respondedAt: null; isUsed: false };
        }): Promise<{ count: number }>;
    };
}

export async function resetKanoProjectResponses(
    client: KanoResetClient,
    projectId: string,
    options: { includeInvitations?: boolean } = {}
) {
    const deletedResponses = await client.kanoResponse.deleteMany({
        where: { projectId },
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
        where: { projectId },
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
