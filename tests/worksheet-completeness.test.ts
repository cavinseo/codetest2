import { describe, expect, it } from 'vitest';
import {
    calculateWorksheetCompleteness,
    type WorksheetCompletenessInput,
} from '../lib/worksheet-completeness';

describe('worksheet completeness', () => {
    const baseInput: WorksheetCompletenessInput = {
        project: {
            name: 'Project',
            description: 'Short description',
            detailedDescription: 'Detailed product overview',
        },
        counts: {
            salesEstimates: 0,
            specFunctions: 0,
            productAttributes: 0,
            attributeFitnesses: 0,
            requirements: 0,
            kanoResponses: 0,
            technicalCharacteristics: 0,
            qfdRelationships: 0,
            techTreeEntries: 0,
            improvementItems: 0,
            targetSpecs: 0,
            techRoadmaps: 0,
            devPlans: 0,
            assetItems: 0,
            fundingPlans: 0,
            fundingSources: 0,
        },
        hasFitnessMatrix: false,
    };

    it('marks an empty workflow as not started and points to the first missing required worksheet', () => {
        const result = calculateWorksheetCompleteness(baseInput);

        expect(result.percent).toBe(7);
        expect(result.status).toBe('IN_PROGRESS');
        expect(result.nextAction?.worksheetKey).toBe('sales');
        expect(result.blockers.map((item) => item.worksheetKey)).toContain('requirements');
    });

    it('marks the workflow report-ready when required worksheets are complete', () => {
        const result = calculateWorksheetCompleteness({
            ...baseInput,
            counts: {
                salesEstimates: 2,
                specFunctions: 3,
                productAttributes: 4,
                attributeFitnesses: 4,
                requirements: 5,
                kanoResponses: 10,
                technicalCharacteristics: 3,
                qfdRelationships: 15,
                techTreeEntries: 2,
                improvementItems: 3,
                targetSpecs: 3,
                techRoadmaps: 2,
                devPlans: 2,
                assetItems: 2,
                fundingPlans: 2,
                fundingSources: 1,
            },
            hasFitnessMatrix: true,
        });

        expect(result.status).toBe('REPORT_READY');
        expect(result.percent).toBe(100);
        expect(result.requiredComplete).toBe(true);
        expect(result.blockers).toEqual([]);
        expect(result.items.find((item) => item.key === 'funding')?.worksheetKey).toBe('funding-source');
    });

    it('keeps optional worksheets from blocking report readiness', () => {
        const result = calculateWorksheetCompleteness({
            ...baseInput,
            counts: {
                ...baseInput.counts,
                salesEstimates: 1,
                specFunctions: 1,
                productAttributes: 1,
                attributeFitnesses: 1,
                requirements: 1,
                kanoResponses: 1,
                technicalCharacteristics: 1,
                qfdRelationships: 1,
                improvementItems: 1,
                targetSpecs: 1,
            },
            hasFitnessMatrix: true,
        });

        expect(result.status).toBe('REPORT_READY');
        expect(result.requiredComplete).toBe(true);
        expect(result.items.find((item) => item.key === 'funding')?.required).toBe(false);
    });
});
