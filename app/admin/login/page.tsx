// 관리자 로그인 화면입니다. 본체는 /admin 과 공유하는 AdminLoginForm 이며, 이 경로는 예전 링크를 위해 남겨 둡니다.
'use client';

import { useRouter } from 'next/navigation';
import AdminLoginForm from '@/components/admin/AdminLoginForm';

export default function AdminLoginPage() {
    const router = useRouter();

    return <AdminLoginForm onAuthenticated={() => router.push('/admin')} />;
}
