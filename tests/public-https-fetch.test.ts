// 원격 AI 연결이 검증된 DNS 주소에 고정되고 내부 주소와 리다이렉트를 차단하는지 검증한다.
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { publicHttpsFetch } from '../lib/ai/public-https-fetch';

let responseStatus: number;
let responseBody: string;
let req: EventEmitter & { end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
beforeEach(() => {
    vi.resetAllMocks();
    responseStatus = 200;
    responseBody = '{"data":[{"id":"model"}]}';
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mocks.request.mockImplementation((_url, _options, callback) => {
        req = Object.assign(new EventEmitter(), {
            end: vi.fn(() => {
                const res = Object.assign(new PassThrough(), {
                    statusCode: responseStatus, headers: { 'content-type': 'application/json', location: 'https://localhost/admin' },
                });
                callback(res);
                res.end(responseBody);
            }),
            destroy: vi.fn((error) => req.emit('error', error)),
        });
        return req;
    });
});

describe('publicHttpsFetch', () => {
    it.each([
        '0.0.0.0', '10.1.2.3', '127.0.0.1', '100.64.0.1', '100.127.255.254',
        '169.254.169.254', '172.16.0.1', '172.31.255.254', '192.168.0.1',
        '192.0.0.1', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.19.255.254',
        '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
        '::1', '::', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'ff02::1',
        '2001::1', '2001:2::1', '2001:db8::1', '2001:10::1', '2001:2f::1', '2002:7f00:1::1', '3fff::1',
    ])('DNS가 %s로 해석되면 요청을 보내지 않는다', async (address) => {
        mocks.lookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);
        await expect(publicHttpsFetch('https://mcp.example.com/v1/models')).rejects.toThrow('공용 네트워크');
        expect(mocks.request).not.toHaveBeenCalled();
    });

    it('공용·사설 주소가 섞여 있어도 전체 요청을 차단한다', async () => {
        mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]);
        await expect(publicHttpsFetch('https://mcp.example.com/models')).rejects.toThrow('공용 네트워크');
        expect(mocks.request).not.toHaveBeenCalled();
    });

    it('TLS 호스트는 유지하고 실제 소켓 DNS를 최초 검증한 주소에 고정한다', async () => {
        const controller = new AbortController();
        const result = await publicHttpsFetch('https://mcp.example.com/v1/chat/completions', {
            method: 'POST', headers: { Authorization: 'Bearer test-key' }, body: '{"model":"x"}', signal: controller.signal,
        });
        expect(await result.json()).toEqual({ data: [{ id: 'model' }] });
        expect(mocks.lookup).toHaveBeenCalledWith('mcp.example.com', { all: true, verbatim: true });
        const [url, options] = mocks.request.mock.calls[0];
        expect(url.hostname).toBe('mcp.example.com');
        expect(url.pathname).toBe('/v1/chat/completions');
        expect(options).toMatchObject({ agent: false, method: 'POST', headers: { authorization: 'Bearer test-key' }, signal: controller.signal });
        expect(req.end).toHaveBeenCalledWith('{"model":"x"}');
        mocks.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
        const connect = vi.fn();
        options.lookup('mcp.example.com', {}, connect);
        expect(connect).toHaveBeenCalledWith(null, '93.184.216.34', 4);
        options.lookup('mcp.example.com', { all: true }, connect);
        expect(connect).toHaveBeenLastCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
        expect(mocks.lookup).toHaveBeenCalledTimes(1);
    });

    it('공용 IPv6로도 연결하고 요청마다 DNS를 다시 검증한다', async () => {
        mocks.lookup.mockResolvedValueOnce([{ address: '2606:4700:4700::1111', family: 6 }]);
        await expect(publicHttpsFetch('https://mcp.example.com/models')).resolves.toHaveProperty('status', 200);
        const connect = vi.fn();
        mocks.request.mock.calls[0][1].lookup('mcp.example.com', { family: 6 }, connect);
        expect(connect).toHaveBeenCalledWith(null, '2606:4700:4700::1111', 6);
        mocks.lookup.mockResolvedValueOnce([{ address: '::ffff:10.0.0.1', family: 6 }]);
        await expect(publicHttpsFetch('https://mcp.example.com/models')).rejects.toThrow('공용 네트워크');
        expect(mocks.request).toHaveBeenCalledTimes(1);
    });

    it.each([301, 302, 303, 307, 308])('HTTP %s 응답을 따라가거나 인증키를 다른 호스트에 보내지 않는다', async (status) => {
        responseStatus = status;
        await expect(publicHttpsFetch('https://mcp.example.com/models', { headers: { Authorization: 'Bearer secret' } })).rejects.toThrow('리다이렉트');
        expect(mocks.request).toHaveBeenCalledTimes(1);
    });

    it('HTTP 오류 상태를 인증 확인 호출자에게 전달한다', async () => {
        responseStatus = 401;
        expect((await publicHttpsFetch('https://mcp.example.com/models')).status).toBe(401);
    });

    it('이미 취소된 요청은 DNS 조회나 연결을 하지 않는다', async () => {
        await expect(publicHttpsFetch('https://mcp.example.com/models', { signal: AbortSignal.abort() })).rejects.toThrow();
        expect(mocks.lookup).not.toHaveBeenCalled();
        expect(mocks.request).not.toHaveBeenCalled();
    });

    it('DNS 조회 중 취소되어도 소켓을 열지 않는다', async () => {
        const controller = new AbortController();
        mocks.lookup.mockImplementation(async () => { controller.abort(); return [{ address: '93.184.216.34', family: 4 }]; });
        await expect(publicHttpsFetch('https://mcp.example.com/models', { signal: controller.signal })).rejects.toThrow();
        expect(mocks.request).not.toHaveBeenCalled();
    });

    it('과도한 응답은 연결을 종료한다', async () => {
        responseBody = 'x'.repeat(4 * 1024 * 1024 + 1);
        await expect(publicHttpsFetch('https://mcp.example.com/models')).rejects.toThrow('허용 크기');
        expect(req.destroy).toHaveBeenCalledOnce();
    });
});
