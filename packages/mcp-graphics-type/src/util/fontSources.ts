import * as dns from 'dns';
import * as fs from 'fs';
import * as https from 'https';
import * as net from 'net';
import * as path from 'path';

/**
 * Guards for loading fonts from caller-supplied paths and URLs.
 *
 * MCP tool arguments come from a model, so a path or URL may be attacker-influenced
 * (for example via prompt injection). File loads are limited to font files inside
 * allowed directories, and URL loads are limited to public HTTPS hosts.
 */

export const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];
export const MAX_REMOTE_FONT_BYTES = 20 * 1024 * 1024;
export const REMOTE_FONT_TIMEOUT_MS = 15_000;

/** Extra font directories, separated by the platform path delimiter (":" or ";"). */
export const FONT_DIRS_ENV = 'MCP_FONT_DIRS';

/**
 * Returns the real paths of the directories font files may be read from:
 * the given system font directories plus any listed in MCP_FONT_DIRS.
 * Directories that don't exist are dropped.
 */
export function allowedFontRoots(systemPaths: string[]): string[] {
  const extra = (process.env[FONT_DIRS_ENV] || '').split(path.delimiter).filter(Boolean);
  const roots: string[] = [];
  for (const dir of [...systemPaths, ...extra]) {
    try {
      roots.push(fs.realpathSync(dir));
    } catch {
      // Missing directory; skip it.
    }
  }
  return roots;
}

/**
 * Resolves a requested font path and returns its real path only if it has a font
 * extension and sits inside one of the allowed roots. Symlinks are resolved first,
 * so a link inside an allowed root can't point outside it. Returns null otherwise.
 */
export function resolveAllowedFontPath(requested: string, roots: string[]): string | null {
  if (!FONT_EXTENSIONS.includes(path.extname(requested).toLowerCase())) {
    return null;
  }
  let real: string;
  try {
    real = fs.realpathSync(path.resolve(requested));
  } catch {
    return null;
  }
  const inside = roots.some((root) => real === root || real.startsWith(root + path.sep));
  return inside ? real : null;
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inIpv4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_IPV4: Array<[string, number]> = [
  ['0.0.0.0', 8],        // "this" network
  ['10.0.0.0', 8],       // private
  ['100.64.0.0', 10],    // carrier-grade NAT
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local, incl. cloud metadata (169.254.169.254)
  ['172.16.0.0', 12],    // private
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.0.2.0', 24],     // documentation
  ['192.168.0.0', 16],   // private
  ['198.18.0.0', 15],    // benchmarking
  ['198.51.100.0', 24],  // documentation
  ['203.0.113.0', 24],   // documentation
  ['224.0.0.0', 3],      // multicast and reserved (224.0.0.0 - 255.255.255.255)
];

/** True for loopback, private, link-local, metadata, and other non-public addresses. */
export function isNonPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return BLOCKED_IPV4.some(([base, bits]) => inIpv4Range(ip, base, bits));
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) {
      return isNonPublicAddress(mapped[1]);
    }
    if (lower === '::' || lower === '::1') return true;
    const firstHextet = parseInt(lower.split(':')[0] || '0', 16);
    if ((firstHextet & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((firstHextet & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((firstHextet & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    return false;
  }
  return true; // Not an IP at all: refuse.
}

/**
 * Parses a font URL and returns it only if it is HTTPS, carries no credentials,
 * and isn't a literal non-public IP. Hostnames are checked again at connect time.
 */
export function validateFontUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    return null;
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return null;
  }
  if (net.isIP(host) && isNonPublicAddress(host)) {
    return null;
  }
  return url;
}

/**
 * DNS lookup that refuses to connect to non-public addresses. Used as the agent's
 * lookup so the check runs on the address actually dialed, which also defeats
 * DNS rebinding between validation and connection.
 */
export const publicOnlyLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isNonPublicAddress(a.address))) {
      const blocked = Object.assign(new Error('Font URL resolves to a non-public address'), { code: 'EBLOCKED' });
      callback(blocked, '', 0);
      return;
    }
    if ((options as dns.LookupOptions).all) {
      (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
};

export function publicOnlyHttpsAgent(): https.Agent {
  return new https.Agent({ lookup: publicOnlyLookup });
}
