import { describe, expect, it } from 'vitest';
import { countProjectResponses, countUniqueProjectRespondents } from '../lib/kano-analysis-stats';

describe('Kano analysis project-scoped stats', () => {
    it('counts response rows and unique respondents from the already project-filtered response set', () => {
        const currentProjectResponses = [
            { invitationId: 'inv-a', respondentEmail: 'a@example.com' },
            { invitationId: 'inv-a', respondentEmail: 'a@example.com' },
            { invitationId: 'inv-b', respondentEmail: 'b@example.com' },
        ];

        expect(countProjectResponses(currentProjectResponses)).toBe(3);
        expect(countUniqueProjectRespondents(currentProjectResponses)).toBe(2);
    });

    it('falls back to invitation id when imported rows do not have an email', () => {
        expect(countUniqueProjectRespondents([
            { invitationId: 'inv-a', respondentEmail: '' },
            { invitationId: 'inv-a', respondentEmail: '' },
            { invitationId: 'inv-b', respondentEmail: null },
        ])).toBe(2);
    });
});
