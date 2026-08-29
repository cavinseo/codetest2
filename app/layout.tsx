import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import ThemeToggle from "@/components/ThemeToggle";
import OnboardingRedirect from "@/components/OnboardingRedirect";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
});

const outfit = Outfit({
    subsets: ["latin"],
    variable: "--font-outfit",
    display: "swap",
});

export const metadata: Metadata = {
    title: "KS-QFD — Product Quality Intelligence",
    description: "AI-powered Kano survey analysis and QFD matrix for building products people love",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const themeScript = `
        (function() {
            try {
                var theme = localStorage.getItem('kano-qfd-theme') || 'dark';
                document.documentElement.classList.toggle('light', theme === 'light');
                document.documentElement.classList.toggle('dark', theme !== 'light');
            } catch (e) {}
        })();
    `;

    return (
        <html lang="ko" className="dark">
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
            </head>
            <body className={`${inter.variable} ${outfit.variable} antialiased bg-noise`}>
                <ThemeToggle />
                <OnboardingRedirect />
                {children}
            </body>
        </html>
    );
}
