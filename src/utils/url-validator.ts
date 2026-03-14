import { resolve4, resolve6 } from 'dns/promises';

/**
 * Private and reserved IPv4 ranges that should be blocked
 * to prevent SSRF attacks.
 */
const BLOCKED_IPV4_RANGES: Array<{ network: number; mask: number }> = [
    // 0.0.0.0/8 — current network
    { network: 0, mask: 0xff000000 },
    // 10.0.0.0/8 — private
    { network: 0x0a000000, mask: 0xff000000 },
    // 100.64.0.0/10 — carrier-grade NAT
    { network: 0x64400000, mask: 0xffc00000 },
    // 127.0.0.0/8 — loopback
    { network: 0x7f000000, mask: 0xff000000 },
    // 169.254.0.0/16 — link-local
    { network: 0xa9fe0000, mask: 0xffff0000 },
    // 172.16.0.0/12 — private
    { network: 0xac100000, mask: 0xfff00000 },
    // 192.0.0.0/24 — IETF protocol assignments
    { network: 0xc0000000, mask: 0xffffff00 },
    // 192.0.2.0/24 — TEST-NET-1
    { network: 0xc0000200, mask: 0xffffff00 },
    // 192.168.0.0/16 — private
    { network: 0xc0a80000, mask: 0xffff0000 },
    // 198.18.0.0/15 — benchmarking
    { network: 0xc6120000, mask: 0xfffe0000 },
    // 198.51.100.0/24 — TEST-NET-2
    { network: 0xc6336400, mask: 0xffffff00 },
    // 203.0.113.0/24 — TEST-NET-3
    { network: 0xcb007100, mask: 0xffffff00 },
    // 224.0.0.0/4 — multicast
    { network: 0xe0000000, mask: 0xf0000000 },
    // 240.0.0.0/4 — reserved
    { network: 0xf0000000, mask: 0xf0000000 },
];

/**
 * Blocked IPv6 prefixes. We check if the resolved address
 * starts with any of these.
 */
const BLOCKED_IPV6_PREFIXES = [
    '::',       // unspecified + loopback (::1)
    'fc',       // unique local (fc00::/7)
    'fd',       // unique local (fc00::/7)
    'fe80',     // link-local
    'ff',       // multicast
];

function ipv4ToNumber(ip: string): number {
    const parts = ip.split('.').map(Number);
    // eslint-disable-next-line no-bitwise
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
    const num = ipv4ToNumber(ip);
    return BLOCKED_IPV4_RANGES.some(
        // eslint-disable-next-line no-bitwise
        ({ network, mask }) => (num & mask) >>> 0 === network,
    );
}

function isBlockedIPv6(ip: string): boolean {
    const normalized = ip.toLowerCase();
    return BLOCKED_IPV6_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export interface UrlValidationResult {
    valid: boolean;
    url?: URL;
    error?: string;
}

const LOCALHOST_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '[::0]'];

function isLocalhostUrl(hostname: string): boolean {
    return LOCALHOST_HOSTNAMES.includes(hostname);
}

/**
 * Validates a URL for use with the screenshot API:
 * 1. Must be a valid URL with http: or https: protocol
 * 2. Hostname must not resolve to a private/reserved IP (SSRF protection)
 *
 * When the ALLOW_LOCALHOST env var is set to "true", localhost URLs are
 * permitted (useful for local development).
 */
export async function validateUrl(raw: string): Promise<UrlValidationResult> {
    const allowLocalhost = process.env.ALLOW_LOCALHOST === 'true';

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
        return { valid: false, error: 'URL must use http or https protocol' };
    }

    const hostname = url.hostname;

    // Allow localhost URLs when explicitly enabled (dev mode)
    if (allowLocalhost && isLocalhostUrl(hostname)) {
        return { valid: true, url };
    }

    // Block obvious localhost variants before DNS
    if (['localhost', '0.0.0.0', '[::1]', '[::0]'].includes(hostname)) {
        return { valid: false, error: 'URLs pointing to localhost are not allowed' };
    }

    // Resolve hostname and check all returned IPs
    try {
        let blocked = false;

        try {
            const ipv4s = await resolve4(hostname);
            if (ipv4s.some(isBlockedIPv4)) {
                blocked = true;
            }
        } catch {
            // No A records — that's fine, check AAAA
        }

        if (!blocked) {
            try {
                const ipv6s = await resolve6(hostname);
                if (ipv6s.some(isBlockedIPv6)) {
                    blocked = true;
                }
            } catch {
                // No AAAA records — that's fine
            }
        }

        if (blocked) {
            // In dev mode, allow IPs that resolve to loopback
            if (allowLocalhost) {
                try {
                    const ipv4s = await resolve4(hostname);
                    if (ipv4s.every((ip) => isBlockedIPv4(ip) && ipv4ToNumber(ip) >= 0x7f000000 && ipv4ToNumber(ip) <= 0x7fffffff)) {
                        return { valid: true, url };
                    }
                } catch {
                    // fall through to blocked
                }
            }
            return { valid: false, error: 'URL resolves to a blocked IP range' };
        }
    } catch {
        return { valid: false, error: 'Could not resolve hostname' };
    }

    return { valid: true, url };
}
