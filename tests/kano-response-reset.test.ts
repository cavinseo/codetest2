import { describe, expect, it, vi } from 'vitest';
import { resetKanoProjectResponses } from '../lib/kano-response-reset';

describe('Kano response reset', () => {
    it('선택한 응답자의 모든 문항과 해당 프로젝트 초대 완료 상태만 초기화한다', async () => {
        const client = {
            kanoResponse: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
            kanoSurveyInvitation: {
                deleteMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 2 }),
            },
        };
        const respondentEmails = ['first@example.test', 'second@example.test'];

        await expect(resetKanoProjectResponses(client, 'project_1', { respondentEmails })).resolves.toEqual({
            deletedResponses: 4, resetInvitations: 2, deletedInvitations: 0,
        });
        expect(client.kanoResponse.deleteMany).toHaveBeenCalledExactlyOnceWith({
            where: { projectId: 'project_1', respondentEmail: { in: respondentEmails } },
        });
        expect(client.kanoSurveyInvitation.updateMany).toHaveBeenCalledExactlyOnceWith({
            where: { projectId: 'project_1', email: { in: respondentEmails } }, data: { respondedAt: null, isUsed: false },
        });
        expect(client.kanoSurveyInvitation.deleteMany).not.toHaveBeenCalled();
    });
    it('deletes only current project responses and clears invitation response state', async () => {
        const client = {
            kanoResponse: {
                deleteMany: vi.fn().mockResolvedValue({ count: 12 }),
            },
            kanoSurveyInvitation: {
                deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                updateMany: vi.fn().mockResolvedValue({ count: 3 }),
            },
        };

        await expect(resetKanoProjectResponses(client, 'project_1')).resolves.toEqual({
            deletedResponses: 12,
            resetInvitations: 3,
            deletedInvitations: 0,
        });
        expect(client.kanoResponse.deleteMany).toHaveBeenCalledWith({
            where: { projectId: 'project_1' },
        });
        expect(client.kanoSurveyInvitation.updateMany).toHaveBeenCalledWith({
            where: { projectId: 'project_1' },
            data: { respondedAt: null, isUsed: false },
        });
        expect(client.kanoSurveyInvitation.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes only current project invitations after deleting their responses', async () => {
        const calls: string[] = [];
        const client = {
            kanoResponse: {
                deleteMany: vi.fn().mockImplementation(async () => {
                    calls.push('responses');
                    return { count: 12 };
                }),
            },
            kanoSurveyInvitation: {
                deleteMany: vi.fn().mockImplementation(async () => {
                    calls.push('invitations');
                    return { count: 3 };
                }),
                updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            },
        };

        await expect(
            resetKanoProjectResponses(client, 'project_1', { includeInvitations: true })
        ).resolves.toEqual({
            deletedResponses: 12,
            resetInvitations: 0,
            deletedInvitations: 3,
        });
        expect(client.kanoResponse.deleteMany).toHaveBeenCalledWith({
            where: { projectId: 'project_1' },
        });
        expect(client.kanoSurveyInvitation.deleteMany).toHaveBeenCalledWith({
            where: { projectId: 'project_1' },
        });
        expect(client.kanoSurveyInvitation.updateMany).not.toHaveBeenCalled();
        expect(calls).toEqual(['responses', 'invitations']);
    });
});
