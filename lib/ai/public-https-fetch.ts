// 원격 AI 요청의 DNS 주소를 검사하고 해당 주소에 고정해 내부망 접근과 리다이렉트를 차단한다.
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { assertPublicHttpsUrl } from './url-guard';

const NON_PUBLIC_IPV4 = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
    ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
    ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const;

function ipv4Number(address: string): number {
    return address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
}

function isPublicAddress(address: string): boolean {
    if (isIP(address) === 4) {
        const value = ipv4Number(address);
        return !NON_PUBLIC_IPV4.some(([base, bits]) => (value >>> (32 - bits)) === (ipv4Number(base) >>> (32 - bits)));
    }
    if (isIP(address) !== 6) return false;
    const [first, second = '0'] = address.split(':');
    const a = parseInt(first, 16);
    const b = parseInt(second || '0', 16);
    // 전역 유니캐스트만 허용하며 전환·문서·벤치마크 전용 대역도 제외한다.
    return a >= 0x2000 && a <= 0x3fff && a !== 0x2002 && a !== 0x3fff
        && !(a === 0x2001 && (b === 0 || b === 2 || b === 0xdb8 || (b >= 0x10 && b <= 0x2f)));
}

export async function publicHttpsFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(assertPublicHttpsUrl(rawUrl));
    init.signal?.throwIfAborted();
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    init.signal?.throwIfAborted();
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
        throw new Error('원격 AI 주소는 공용 네트워크로 연결되어야 합니다.');
    }
    // 연결 단계에서 DNS를 재조회하지 않는다. TLS 인증에는 원래 호스트 이름이 사용된다.
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
        const candidates = addresses.filter(({ family }) => !options.family || options.family === family);
        if (!candidates.length) {
            callback(new Error('연결할 수 있는 공용 주소가 없습니다.'), []);
        } else if (options.all) {
            callback(null, candidates);
        } else {
            callback(null, candidates[0].address, candidates[0].family);
        }
    };
    if (init.body != null && typeof init.body !== 'string') {
        throw new Error('원격 AI 요청은 JSON 문자열 본문만 지원합니다.');
    }

    return new Promise<Response>((resolve, reject) => {
        const req = request(url, {
            method: init.method ?? 'GET',
            headers: Object.fromEntries(new Headers(init.headers)),
            lookup: pinnedLookup,
            agent: false,
            signal: init.signal ?? undefined,
        }, (res) => {
            const status = res.statusCode ?? 502;
            if (status >= 300 && status < 400) {
                res.resume();
                reject(new Error('원격 AI 주소의 리다이렉트는 허용되지 않습니다. 최종 주소를 입력하세요.'));
                return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            res.on('data', (chunk: Buffer) => {
                size += chunk.length;
                if (size > 4 * 1024 * 1024) {
                    req.destroy(new Error('원격 AI 응답이 허용 크기를 초과했습니다.'));
                    return;
                }
                chunks.push(chunk);
            });
            res.on('error', reject);
            res.on('end', () => {
                const headers = new Headers();
                for (const [name, value] of Object.entries(res.headers)) {
                    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
                }
                resolve(new Response(status === 204 || status === 205 ? null : Buffer.concat(chunks), { status, headers }));
            });
        });
        req.on('error', reject);
        req.end(init.body ?? undefined);
    });
}
