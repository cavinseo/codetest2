/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '127.0.0.1:5000', 'localhost:5000'],
    },
  },
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // 한 번 HTTPS 로 들어온 브라우저는 이후 평문으로 접속하지 않는다.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // 업로드된 파일 등을 브라우저가 임의 타입으로 해석하지 못하게 한다.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // 스크립트·스타일은 자기 출처만 허용한다.
          // app/layout.tsx 의 테마 스크립트가 인라인이라 'unsafe-inline' 이 필요하다.
          // 이 인라인은 사용자 입력이 섞이지 않는 정적 문자열이며, nonce 로 바꾸는 것은
          // 별도 작업으로 남긴다.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "object-src 'none'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
