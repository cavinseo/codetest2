// admin-recovery.mjs 의 타입 선언입니다.

export interface AdminCandidateInput {
    email: string;
    name?: string | null;
    status: string;
    isAdmin: boolean;
    role: string;
    accessExpiresAt?: Date | null;
}

export interface AdminAccessDiagnosis {
    canEnterAdminMode: boolean;
    blockers: string[];
}

export declare function parseAdminEmails(raw: string | null | undefined): string[];
export declare function diagnoseAdminAccess(
    user: AdminCandidateInput,
    adminEmails: string[],
    now?: Date
): AdminAccessDiagnosis;
export declare function summarizeAdminCandidates<T extends AdminCandidateInput>(
    users: T[],
    adminEmails: string[],
    now?: Date
): (T & AdminAccessDiagnosis)[];
export declare function findMissingAdminEmails(users: AdminCandidateInput[], adminEmails: string[]): string[];
export declare function describeDatabase(url: string | null | undefined): string;
