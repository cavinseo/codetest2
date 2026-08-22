// 관리자가 만든 계정에 임시 비밀번호를 알리는 메일 본문.
//
// 관리자가 평문 비밀번호를 다루지 않도록 서버가 생성해 본인에게만 보낸다.
// 받은 사람은 첫 로그인 때 반드시 바꿔야 한다(users.mustChangePassword).

export function buildTempPasswordEmail(params: {
    tempPassword: string;
    roleLabel: string;
    loginUrl: string;
    escapeHtml: (value: string) => string;
}): { subject: string; html: string } {
    const tempPassword = params.escapeHtml(params.tempPassword);
    const roleLabel = params.escapeHtml(params.roleLabel);
    const loginUrl = params.escapeHtml(params.loginUrl);

    return {
        subject: `[KS-QFD] ${params.roleLabel} 계정이 생성되었습니다`,
        html: `
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0; padding: 28px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">KS-QFD 계정 생성</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">${roleLabel} 계정이 만들어졌습니다</p>
        </div>
        <div style="background: white; padding: 28px; border-radius: 0 0 12px 12px;">
            <p style="color: #333; font-size: 15px;">아래 임시 비밀번호로 로그인해 주세요.</p>
            <div style="margin: 20px 0; padding: 16px; background: #f1f5f9; border-radius: 8px; text-align: center;">
                <span style="font-family: monospace; font-size: 20px; font-weight: 700; letter-spacing: 2px; color: #0f172a;">${tempPassword}</span>
            </div>
            <ul style="color: #555; font-size: 13px; line-height: 1.8; padding-left: 18px;">
                <li>첫 로그인 때 비밀번호를 <strong>변경</strong>해야 합니다.</li>
                <li>이 메일은 본인 외에는 전달하지 마세요.</li>
            </ul>
            <div style="text-align: center; margin: 26px 0 8px;">
                <a href="${loginUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 13px 36px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">로그인 하러 가기</a>
            </div>
        </div>
    </div>
    `,
    };
}
