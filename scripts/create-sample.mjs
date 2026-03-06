/**
 * 샘플 데이터 생성 스크립트
 * 임시 메모리 저장소에 직접 데이터 추가
 */

console.log('📦 샘플 데이터 초기화 스크립트');
console.log('이 스크립트는 서버가 실행되는 동안 메모리에 데이터를 추가합니다.\n');

// API를 통해 데이터 생성
async function createSampleData() {
    const baseUrl = 'http://localhost:3000';

    try {
        // 1. 회원가입
        console.log('1️⃣ 사용자 생성 중...');
        const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'demo@kano.com',
                name: '데모 사용자',
                password: 'Demo1234!'
            })
        });

        if (!signupRes.ok) {
            console.log('⚠️ 사용자가 이미 존재하거나 생성 실패');
        } else {
            console.log('✅ 사용자 생성 완료');
        }

        // 2. 로그인
        console.log('\n2️⃣ 로그인 중...');
        const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'demo@kano.com',
                password: 'Demo1234!'
            })
        });

        const userData = await loginRes.json();
        console.log('✅ 로그인 완료:', userData.user.name);

        // 세션 쿠키 추출
        const cookies = loginRes.headers.get('set-cookie') || '';

        // 3. 프로젝트 생성
        console.log('\n3️⃣ 프로젝트 생성 중...');
        const projectRes = await fetch(`${baseUrl}/api/projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookies
            },
            body: JSON.stringify({
                name: '스마트폰 만족도 개선 프로젝트',
                description: '고객 만족도 향상을 위한 스마트폰 기능 및 성능 개선'
            })
        });

        const projectData = await projectRes.json();
        const projectId = projectData.project.id;
        console.log('✅ 프로젝트 생성 완료:', projectData.project.name);
        console.log('   프로젝트 ID:', projectId);

        // 4. 고객 요구사항 추가
        console.log('\n4️⃣ 고객 요구사항 10개 추가 중...');

        const requirements = [
            { category: '성능', subcategory: '배터리', requirement: '배터리 수명이 길었으면 좋겠다', order: 1 },
            { category: '성능', subcategory: '속도', requirement: '앱 실행 속도가 빨랐으면 좋겠다', order: 2 },
            { category: '성능', subcategory: '발열', requirement: '장시간 사용 시 발열이 적었으면 좋겠다', order: 3 },
            { category: '디자인', subcategory: '외관', requirement: '슬림하고 가벼운 디자인이었으면 좋겠다', order: 4 },
            { category: '디자인', subcategory: '화면', requirement: '화면 테두리가 얇았으면 좋겠다', order: 5 },
            { category: '카메라', subcategory: '화질', requirement: '야간 촬영 화질이 좋았으면 좋겠다', order: 6 },
            { category: '카메라', subcategory: '기능', requirement: '줌 기능이 강력했으면 좋겠다', order: 7 },
            { category: '사용성', subcategory: '편의성', requirement: '한 손으로 편하게 사용할 수 있었으면 좋겠다', order: 8 },
            { category: '사용성', subcategory: '내구성', requirement: '물에 빠뜨려도 고장나지 않았으면 좋겠다', order: 9 },
            { category: '보안', subcategory: '인증', requirement: '얼굴 인식이 빠르고 정확했으면 좋겠다', order: 10 },
        ];

        const reqRes = await fetch(`${baseUrl}/api/projects/${projectId}/requirements`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookies
            },
            body: JSON.stringify({ requirements })
        });

        const reqData = await reqRes.json();
        console.log('✅ 고객 요구사항 추가 완료:', reqData.count, '개');

        console.log('\n' + '='.repeat(60));
        console.log('🎉 샘플 데이터 생성 완료!');
        console.log('='.repeat(60));
        console.log('\n📊 생성된 데이터:');
        console.log('   - 사용자: demo@kano.com');
        console.log('   - 프로젝트:', projectData.project.name);
        console.log('   - 고객 요구사항: 10개');
        console.log('   - 카테고리: 성능, 디자인, 카메라, 사용성, 보안');
        console.log('\n🔐 로그인 정보:');
        console.log('   - 이메일: demo@kano.com');
        console.log('   - 비밀번호: Demo1234!');
        console.log('\n📝 프로젝트 ID:', projectId);
        console.log('\n🎯 다음 단계:');
        console.log('   1. http://localhost:3000/login 접속');
        console.log('   2. 위 계정으로 로그인');
        console.log('   3. "스마트폰 만족도 개선 프로젝트" 선택');
        console.log('   4. Kano 설문 → 응답자 초대');
        console.log('   5. Kano 분석 결과 확인');

    } catch (error) {
        console.error('\n❌ 에러 발생:', error.message);
    }
}

// 스크립트 실행
createSampleData();
