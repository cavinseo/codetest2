// 스마트폰 개선 프로젝트 샘플 데이터 생성 스크립트

import { users, projects, customerRequirements, projectMembers } from './lib/temp-db';
import { kanoInvitations, kanoResponses } from './lib/kano-store';
import bcrypt from 'bcryptjs';

// 1. 사용자 생성
const demoUser = {
    id: 'user_demo_001',
    email: 'demo@kano.com',
    name: '데모 사용자',
    passwordHash: bcrypt.hashSync('Demo1234!', 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};
users.push(demoUser);

// 2. 프로젝트 생성
const demoProject = {
    id: 'project_smartphone_001',
    name: '스마트폰 만족도 개선 프로젝트',
    description: '고객 만족도 향상을 위한 스마트폰 기능 및 성능 개선',
    ownerId: demoUser.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};
projects.push(demoProject);

// 프로젝트 멤버 추가 (본인)
projectMembers.push({
    id: 'member_001',
    projectId: demoProject.id,
    userId: demoUser.id,
    role: 'OWNER',
    invitedBy: demoUser.id,
    invitedAt: new Date().toISOString(),
    joinedAt: new Date().toISOString(),
});

// 3. 고객 요구사항 10개 추가
const requirements = [
    {
        id: 'req_001',
        projectId: demoProject.id,
        category: '성능',
        subcategory: '배터리',
        requirement: '배터리 수명이 길었으면 좋겠다',
        order: 1,
    },
    {
        id: 'req_002',
        projectId: demoProject.id,
        category: '성능',
        subcategory: '속도',
        requirement: '앱 실행 속도가 빨랐으면 좋겠다',
        order: 2,
    },
    {
        id: 'req_003',
        projectId: demoProject.id,
        category: '성능',
        subcategory: '발열',
        requirement: '장시간 사용 시 발열이 적었으면 좋겠다',
        order: 3,
    },
    {
        id: 'req_004',
        projectId: demoProject.id,
        category: '디자인',
        subcategory: '외관',
        requirement: '슬림하고 가벼운 디자인이었으면 좋겠다',
        order: 4,
    },
    {
        id: 'req_005',
        projectId: demoProject.id,
        category: '디자인',
        subcategory: '화면',
        requirement: '화면 테두리가 얇았으면 좋겠다',
        order: 5,
    },
    {
        id: 'req_006',
        projectId: demoProject.id,
        category: '카메라',
        subcategory: '화질',
        requirement: '야간 촬영 화질이 좋았으면 좋겠다',
        order: 6,
    },
    {
        id: 'req_007',
        projectId: demoProject.id,
        category: '카메라',
        subcategory: '기능',
        requirement: '줌 기능이 강력했으면 좋겠다',
        order: 7,
    },
    {
        id: 'req_008',
        projectId: demoProject.id,
        category: '사용성',
        subcategory: '편의성',
        requirement: '한 손으로 편하게 사용할 수 있었으면 좋겠다',
        order: 8,
    },
    {
        id: 'req_009',
        projectId: demoProject.id,
        category: '사용성',
        subcategory: '내구성',
        requirement: '물에 빠뜨려도 고장나지 않았으면 좋겠다',
        order: 9,
    },
    {
        id: 'req_010',
        projectId: demoProject.id,
        category: '보안',
        subcategory: '인증',
        requirement: '얼굴 인식이 빠르고 정확했으면 좋겠다',
        order: 10,
    },
];

customerRequirements.push(...requirements);

// 4. Kano 설문 초대 3명 생성
for (let i = 1; i <= 3; i++) {
    kanoInvitations.push({
        id: `invitation_00${i}`,
        projectId: demoProject.id,
        email: `respondent${i}@example.com`,
        token: `token_demo_00${i}`,
        invitedBy: demoUser.id,
        invitedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7일 후
        isUsed: i <= 2, // 첫 2명은 응답 완료
    });
}

// 5. Kano 설문 응답 생성 (첫 2명이 응답)
// 응답자 1: 모든 기능에 긍정적
requirements.forEach((req, index) => {
    kanoResponses.push({
        id: `response_1_${index + 1}`,
        invitationId: 'invitation_001',
        projectId: demoProject.id,
        requirementId: req.id,
        functionalAnswer: '1', // 좋다 (매우 만족)
        dysfunctionalAnswer: '5', // 싫다 (매우 불만)
        category: 'O', // One-dimensional (일원적)
        respondedAt: new Date().toISOString(),
    });
});

// 응답자 2: 혼합된 응답
const mixedResponses = [
    { functional: '1', dysfunctional: '5', category: 'O' }, // req_001: 배터리 - 일원적
    { functional: '1', dysfunctional: '4', category: 'A' }, // req_002: 속도 - 매력적
    { functional: '2', dysfunctional: '5', category: 'M' }, // req_003: 발열 - 당연적
    { functional: '1', dysfunctional: '3', category: 'A' }, // req_004: 슬림 디자인 - 매력적
    { functional: '3', dysfunctional: '3', category: 'I' }, // req_005: 화면 테두리 - 무관심
    { functional: '1', dysfunctional: '4', category: 'A' }, // req_006: 야간 촬영 - 매력적
    { functional: '2', dysfunctional: '4', category: 'I' }, // req_007: 줌 기능 - 무관심
    { functional: '2', dysfunctional: '5', category: 'M' }, // req_008: 한 손 사용 - 당연적
    { functional: '1', dysfunctional: '5', category: 'O' }, // req_009: 방수 - 일원적
    { functional: '1', dysfunctional: '5', category: 'O' }, // req_010: 얼굴 인식 - 일원적
];

requirements.forEach((req, index) => {
    const response = mixedResponses[index];
    kanoResponses.push({
        id: `response_2_${index + 1}`,
        invitationId: 'invitation_002',
        projectId: demoProject.id,
        requirementId: req.id,
        functionalAnswer: response.functional,
        dysfunctionalAnswer: response.dysfunctional,
        category: response.category,
        respondedAt: new Date().toISOString(),
    });
});

console.log('✅ 샘플 데이터 생성 완료!');
console.log(`
📊 생성된 데이터:
- 사용자: ${demoUser.email}
- 프로젝트: ${demoProject.name}
- 고객 요구사항: ${requirements.length}개
- Kano 설문 초대: 3명
- Kano 응답: 2명 (총 20개 응답)

🔐 로그인 정보:
- 이메일: demo@kano.com
- 비밀번호: Demo1234!

📝 프로젝트 ID: ${demoProject.id}

🎯 다음 단계:
1. http://localhost:3000/login 접속
2. 위 계정으로 로그인
3. 프로젝트 "${demoProject.name}" 선택
4. Kano 분석 결과 확인
`);

export { demoUser, demoProject };
