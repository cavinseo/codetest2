// 이름을 아직 입력하지 않은 초대 회원도 관리 목록과 삭제 대상에 표시되는지 검수한다.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import MembersTab, { type User } from '../components/admin/MembersTab';

it('이름이 없는 회원이 있어도 목록과 삭제 버튼을 렌더링한다', () => {
    const member: User = { id: 'unprofiled', name: null, email: 'member@example.com', role: 'MENTEE',
        isAdmin: false, status: 'APPROVED', accessExpiresAt: null, mustChangePassword: false,
        createdAt: '2026-09-10T00:00:00Z', updatedAt: '2026-09-10T00:00:00Z', programId: null, programName: null };
    const html = renderToStaticMarkup(React.createElement(MembersTab, {
        members: [member], onApprove: vi.fn(), onRequestDelete: vi.fn(),
        onSetRole: vi.fn(), onExtendAccess: vi.fn(), onCreate: vi.fn(), onReload: vi.fn(),
    }));
    expect(html).toContain('이름 미등록');
    expect(html).toContain('member@example.com');
    expect(html).toContain('admin-delete-user-unprofiled');
});
