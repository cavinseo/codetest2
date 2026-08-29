'use client';
// 온보딩 관문(lib/auth.ts requireAuth)이 낸 403 을 잡아 온보딩 화면으로 보낸다.
//
// fetch 호출이 35개 파일에 147곳 흩어져 있고 공용 래퍼가 없다. 호출부마다 고치면
// 회귀 위험이 이 기능의 값어치를 넘으므로, 전역 fetch 를 한 겹 감싸 한 곳으로 모은다.
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { shouldRedirectToOnboarding } from '@/lib/onboarding-redirect';

export default function OnboardingRedirect() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const originalFetch = window.fetch;

        window.fetch = async (...args: Parameters<typeof fetch>) => {
            const response = await originalFetch(...args);

            if (response.status === 403) {
                // 복제본에서 읽는다. 원본 스트림을 소비하면 호출부가 빈 본문을 받는다.
                const body = await response.clone().json().catch(() => null);
                if (shouldRedirectToOnboarding(pathname, response.status, body)) {
                    router.replace('/onboarding');
                }
            }

            return response;
        };

        return () => {
            window.fetch = originalFetch;
        };
    }, [pathname, router]);

    return null;
}
