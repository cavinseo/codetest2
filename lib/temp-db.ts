// 임시 메모리 저장소 (실제 배포 시 데이터베이스로 대체)
// globalThis를 사용하여 Next.js의 여러 라우트 모듈에서 데이터를 공유

export interface User {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    createdAt: string;
    updatedAt: string;
}

export interface Project {
    id: string;
    name: string;
    description?: string;
    detailedDescription?: string;
    businessPlanFile?: string;
    ownerId: string;
    createdAt: string;
    updatedAt: string;
}

// AS-IS 스펙 기능 (FAST 분석)
export interface SpecFunction {
    id: string;
    projectId: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string;
    name: string;
    technology?: string;
    order: number;
}

// 프로젝트 멤버
export interface ProjectMember {
    id: string;
    projectId: string;
    userId: string;
    role: 'OWNER' | 'EDITOR' | 'COACH' | 'ADMIN';
    invitedBy: string;
    invitedAt: string;
    joinedAt: string;
}

// 고객 요구사항
export interface DBRequirement {
    id: string;
    projectId: string;
    category: string;
    subcategory?: string;
    requirement: string;
    order: number;
}

// 기술특성
export interface TechnicalCharacteristic {
    id: string;
    projectId: string;
    name: string;
    unit?: string;
    targetValue?: string;
}

// QFD 관계
export interface QFDRelationship {
    id: string;
    projectId: string;
    requirementId: string;
    technicalCharId: string;
    strength: 'STRONG' | 'MEDIUM' | 'WEAK' | 'NONE';
}

// Kano 응답
export interface KanoResponse {
    id: string;
    invitationId: string;
    projectId: string;
    requirementId: string;
    functionalAnswer: string;
    dysfunctionalAnswer: string;
    category: string;
    respondedAt: string;
}

// 제품 속성서 (Excel 제품속성표 구조)
export interface ProductAttribute {
    id: string;
    projectId: string;
    productName?: string;    // 제품명
    customerName?: string;   // 고객명
    marketSegment?: string;  // 세분시장
    customerNeed?: string;   // 고객 니즈
    benefit?: string;        // 제공혜택
    attribute?: string;      // 제품속성
    techCapability?: string; // 기술 역량
    order: number;
}

// 제품 속성 적합도 (Attribute Fitness)
export interface AttributeFitness {
    id: string;
    projectId: string;
    attributeId: string;
    importance: number; // 중요도 (1-5 or 1-10)
    currentLevel: number; // 현재 수준
    targetLevel: number; // 목표 수준
    note?: string;      // 비고
}

// 기술특성 간 상관관계 (QFD 지붕)
export interface TechCorrelation {
    id: string;
    projectId: string;
    techId1: string;
    techId2: string;
    correlation: 'STRONG_POSITIVE' | 'POSITIVE' | 'NEGATIVE' | 'STRONG_NEGATIVE' | 'NONE';
}

// 경쟁 벤치마킹
export interface Benchmark {
    id: string;
    projectId: string;
    requirementId: string;
    company: string; // 'self' | 경쟁사명
    score: number;   // 1-5
}

// globalThis에 데이터를 보관하여 모듈 인스턴스 간 공유
interface GlobalStore {
    __kano_users: User[];
    __kano_projects: Project[];
    __kano_projectMembers: ProjectMember[];
    __kano_customerRequirements: DBRequirement[];
    __kano_technicalCharacteristics: TechnicalCharacteristic[];
    __kano_qfdRelationships: QFDRelationship[];
    __kano_kanoResponses: KanoResponse[];
    __kano_specFunctions: SpecFunction[];
    __kano_productAttributes: ProductAttribute[];
    __kano_attributeFitnesses: AttributeFitness[];
    __kano_techCorrelations: TechCorrelation[];
    __kano_benchmarks: Benchmark[];
}

const g = globalThis as unknown as GlobalStore;

if (!g.__kano_users) g.__kano_users = [];
if (!g.__kano_projects) g.__kano_projects = [];
if (!g.__kano_projectMembers) g.__kano_projectMembers = [];
if (!g.__kano_customerRequirements) g.__kano_customerRequirements = [];
if (!g.__kano_technicalCharacteristics) g.__kano_technicalCharacteristics = [];
if (!g.__kano_qfdRelationships) g.__kano_qfdRelationships = [];
if (!g.__kano_kanoResponses) g.__kano_kanoResponses = [];
if (!g.__kano_specFunctions) g.__kano_specFunctions = [];
if (!g.__kano_productAttributes) g.__kano_productAttributes = [];
if (!g.__kano_attributeFitnesses) g.__kano_attributeFitnesses = [];
if (!g.__kano_techCorrelations) g.__kano_techCorrelations = [];
if (!g.__kano_benchmarks) g.__kano_benchmarks = [];

export const users = g.__kano_users;
export const projects = g.__kano_projects;
export const projectMembers = g.__kano_projectMembers;
export const customerRequirements = g.__kano_customerRequirements;
export const technicalCharacteristics = g.__kano_technicalCharacteristics;
export const qfdRelationships = g.__kano_qfdRelationships;
export const kanoResponses = g.__kano_kanoResponses;
export const specFunctions = g.__kano_specFunctions;
export const productAttributes = g.__kano_productAttributes;
export const attributeFitnesses = g.__kano_attributeFitnesses;
export const techCorrelations = g.__kano_techCorrelations;
export const benchmarks = g.__kano_benchmarks;

// 헬퍼 함수
export function findUserByEmail(email: string): User | undefined {
    return users.find((u) => u.email === email);
}

export function findUserById(id: string): User | undefined {
    return users.find((u) => u.id === id);
}

export function findProjectById(id: string): Project | undefined {
    return projects.find((p) => p.id === id);
}

export function findProjectsByOwnerId(ownerId: string): Project[] {
    return projects.filter((p) => p.ownerId === ownerId);
}

export function findSpecFunctionsByProjectId(projectId: string): SpecFunction[] {
    return specFunctions.filter((s) => s.projectId === projectId);
}
