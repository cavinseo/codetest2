// admin-recovery.mjs 의 타입 선언입니다.

export interface AdminProfileInput {
    organization?: string | null;
    phone?: string | null;
    expertise?: string | null;
    careerYears?: number | null;
    companyName?: string | null;
    industry?: string | null;
}

export interface AdminCandidateInput {
    email: string;
    name?: string | null;
    status: string;
    isAdmin: boolean;
    role: string;
    accessExpiresAt?: Date | null;
    mustChangePassword?: boolean;
    /** undefined 면 조회에서 빠진 것이라 판정하지 않는다. 행이 없으면 null 이다. */
    profile?: AdminProfileInput | null;
}

export interface AdminAccessDiagnosis {
    canEnterAdminMode: boolean;
    blockers: string[];
}

export declare function loadEnvFileIfPresent(): void;
export declare function isProfileComplete(role: string, profile: AdminProfileInput | null): boolean;
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
