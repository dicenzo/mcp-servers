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

/**
 * Expands an IPv6 address (any valid notation, including a trailing dotted IPv4
 * part) to eight 16-bit groups, or returns null if it can't be parsed.
 */
export function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase().split('%')[0]; // drop any zone id
  const dotted = addr.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (!net.isIPv4(dotted[2])) return null;
    const n = ipv4ToInt(dotted[2]);
    addr = `${dotted[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function ipv4FromGroups(hi: number, lo: number): string {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
}

/** True for loopback, private, link-local, metadata, and other non-public addresses. */
export function isNonPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return BLOCKED_IPV4.some(([base, bits]) => inIpv4Range(ip, base, bits));
  }
  if (!net.isIPv6(ip)) {
    return true; // Not an IP at all: refuse.
  }
  const g = expandIPv6(ip);
  if (!g) return true;

  // Forms that embed an IPv4 address: judge them by that address, however written.
  const firstFiveZero = g.slice(0, 5).every((x) => x === 0);
  if (firstFiveZero && g[5] === 0xffff) return isNonPublicAddress(ipv4FromGroups(g[6], g[7])); // ::ffff:0:0/96 mapped
  if (firstFiveZero && g[5] === 0) return true;                                               // ::/96 (incl. ::, ::1, IPv4-compatible)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isNonPublicAddress(ipv4FromGroups(g[6], g[7]));                                     // 64:ff9b::/96 NAT64
  }
  if (g[0] === 0x2002) return isNonPublicAddress(ipv4FromGroups(g[1], g[2]));                 // 2002::/16 6to4

  if ((g[0] & 0xfe00) === 0xfc00) return true;             // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true;             // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true;             // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true;             // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;     // 2001:db8::/32 documentation
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true; // 100::/64 discard
  return false;
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
