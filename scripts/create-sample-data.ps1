# 스마트폰 프로젝트 샘플 데이터 생성 스크립트
# UTF-8 인코딩 설정
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "샘플 데이터 생성 시작" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3000"

# 1. 회원가입
Write-Host "1. 사용자 생성 중..." -ForegroundColor Yellow
$signupData = @{
    email = "demo@kano.com"
    name = "데모사용자"
    password = "Demo1234!"
}

try {
    $signupJson = $signupData | ConvertTo-Json
    $signupResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/signup" `
        -Method POST `
        -Body $signupJson `
        -ContentType "application/json; charset=utf-8"
    
    Write-Host "   ✅ 사용자 생성 완료: $($signupResponse.user.email)" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "   ⚠️ 사용자가 이미 존재합니다" -ForegroundColor Yellow
    } else {
        Write-Host "   ❌ 오류: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Start-Sleep -Seconds 1

# 2. 로그인
Write-Host "`n2. 로그인 중..." -ForegroundColor Yellow
$loginData = @{
    email = "demo@kano.com"
    password = "Demo1234!"
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

try {
    $loginJson = $loginData | ConvertTo-Json
    $loginResponse = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" `
        -Method POST `
        -Body $loginJson `
        -ContentType "application/json; charset=utf-8" `
        -WebSession $session `
        -UseBasicParsing
    
    Write-Host "   ✅ 로그인 성공!" -ForegroundColor Green
} catch {
    Write-Host "   ❌ 로그인 실패: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# 3. 프로젝트 생성
Write-Host "`n3. 프로젝트 생성 중..." -ForegroundColor Yellow
$projectData = @{
    name = "스마트폰 만족도 개선 프로젝트"
    description = "고객 만족도 향상을 위한 스마트폰 기능 및 성능 개선"
}

try {
    $projectJson = $projectData | ConvertTo-Json
    $projectResponse = Invoke-RestMethod -Uri "$baseUrl/api/projects" `
        -Method POST `
        -Body $projectJson `
        -ContentType "application/json; charset=utf-8" `
        -WebSession $session
    
    $projectId = $projectResponse.project.id
    Write-Host "   ✅ 프로젝트 생성 완료!" -ForegroundColor Green
    Write-Host "   프로젝트 ID: $projectId" -ForegroundColor Cyan
} catch {
    Write-Host "   ❌ 프로젝트 생성 실패: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# 4. 고객 요구사항 10개 추가
Write-Host "`n4. 고객 요구사항 10개 추가 중..." -ForegroundColor Yellow

$requirements = @(
    @{ category = "성능"; subcategory = "배터리"; requirement = "배터리 수명이 길었으면 좋겠다"; order = 1 }
    @{ category = "성능"; subcategory = "속도"; requirement = "앱 실행 속도가 빨랐으면 좋겠다"; order = 2 }
    @{ category = "성능"; subcategory = "발열"; requirement = "장시간 사용 시 발열이 적었으면 좋겠다"; order = 3 }
    @{ category = "디자인"; subcategory = "외관"; requirement = "슬림하고 가벼운 디자인이었으면 좋겠다"; order = 4 }
    @{ category = "디자인"; subcategory = "화면"; requirement = "화면 테두리가 얇았으면 좋겠다"; order = 5 }
    @{ category = "카메라"; subcategory = "화질"; requirement = "야간 촬영 화질이 좋았으면 좋겠다"; order = 6 }
    @{ category = "카메라"; subcategory = "기능"; requirement = "줌 기능이 강력했으면 좋겠다"; order = 7 }
    @{ category = "사용성"; subcategory = "편의성"; requirement = "한 손으로 편하게 사용할 수 있었으면 좋겠다"; order = 8 }
    @{ category = "사용성"; subcategory = "내구성"; requirement = "물에 빠뜨려도 고장나지 않았으면 좋겠다"; order = 9 }
    @{ category = "보안"; subcategory = "인증"; requirement = "얼굴 인식이 빠르고 정확했으면 좋겠다"; order = 10 }
)

$reqData = @{
    requirements = $requirements
}

try {
    $reqJson = $reqData | ConvertTo-Json -Depth 10
    $reqResponse = Invoke-RestMethod -Uri "$baseUrl/api/projects/$projectId/requirements" `
        -Method POST `
        -Body $reqJson `
        -ContentType "application/json; charset=utf-8" `
        -WebSession $session
    
    Write-Host "   ✅ 고객 요구사항 10개 추가 완료!" -ForegroundColor Green
} catch {
    Write-Host "   ❌ 요구사항 추가 실패: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 결과 출력
Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "🎉 샘플 데이터 생성 완료!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📊 생성된 데이터:" -ForegroundColor White
Write-Host "   - 사용자: demo@kano.com" -ForegroundColor Gray
Write-Host "   - 프로젝트: 스마트폰 만족도 개선 프로젝트" -ForegroundColor Gray
Write-Host "   - 요구사항: 10개 (5개 카테고리)" -ForegroundColor Gray
Write-Host ""
Write-Host "🔐 로그인 정보:" -ForegroundColor White
Write-Host "   이메일: demo@kano.com" -ForegroundColor Gray
Write-Host "   비밀번호: Demo1234!" -ForegroundColor Gray
Write-Host ""
Write-Host "📝 프로젝트 ID: $projectId" -ForegroundColor White
Write-Host ""
Write-Host "🚀 다음 단계:" -ForegroundColor White
Write-Host "   1. http://localhost:3000/login 접속" -ForegroundColor Gray
Write-Host "   2. 위 계정으로 로그인" -ForegroundColor Gray
Write-Host "   3. '스마트폰 만족도 개선 프로젝트' 선택" -ForegroundColor Gray
Write-Host "   4. Kano 설문 → 응답자 초대 → 설문 응답 → 분석" -ForegroundColor Gray
Write-Host ""
