import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  allowedFontRoots,
  resolveAllowedFontPath,
  isNonPublicAddress,
  validateFontUrl,
  FONT_DIRS_ENV,
  publicOnlyLookup
} from '../../src/util/fontSources.js';

describe('font file path guard', () => {
  let root: string;
  let outside: string;

  beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fonts-allowed-')));
    outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fonts-outside-')));
    fs.writeFileSync(path.join(root, 'good.ttf'), Buffer.from([0x00, 0x01, 0x00, 0x00]));
    fs.writeFileSync(path.join(root, 'notes.txt'), 'not a font');
    fs.writeFileSync(path.join(outside, 'secret.ttf'), 'outside');
    fs.symlinkSync(path.join(outside, 'secret.ttf'), path.join(root, 'link.ttf'));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  test('allows a font file inside an allowed root', () => {
    expect(resolveAllowedFontPath(path.join(root, 'good.ttf'), [root])).toBe(path.join(root, 'good.ttf'));
  });

  test('rejects traversal out of an allowed root', () => {
    expect(resolveAllowedFontPath(path.join(root, '..', path.basename(outside), 'secret.ttf'), [root])).toBeNull();
  });

  test('rejects a symlink inside the root that points outside it', () => {
    expect(resolveAllowedFontPath(path.join(root, 'link.ttf'), [root])).toBeNull();
  });

  test('rejects non-font extensions even inside the root', () => {
    expect(resolveAllowedFontPath(path.join(root, 'notes.txt'), [root])).toBeNull();
    expect(resolveAllowedFontPath('/etc/passwd', ['/etc'])).toBeNull();
  });

  test('rejects missing files', () => {
    expect(resolveAllowedFontPath(path.join(root, 'missing.ttf'), [root])).toBeNull();
  });

  test('reads extra roots from MCP_FONT_DIRS and drops missing ones', () => {
    const previous = process.env[FONT_DIRS_ENV];
    process.env[FONT_DIRS_ENV] = [root, path.join(root, 'does-not-exist')].join(path.delimiter);
    try {
      expect(allowedFontRoots([])).toEqual([root]);
    } finally {
      if (previous === undefined) delete process.env[FONT_DIRS_ENV];
      else process.env[FONT_DIRS_ENV] = previous;
    }
  });
});

describe('font URL guard', () => {
  test.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1',
    // IPv4 embedded in IPv6 written in hex, plus NAT64 and 6to4 wrappers around private IPv4
    '::ffff:7f00:1', '::ffff:a9fe:a9fe', '0:0:0:0:0:ffff:7f00:0001', '::7f00:1', '::127.0.0.1',
    '64:ff9b::7f00:1', '64:ff9b::169.254.169.254', '2002:7f00:1::', '2002:c0a8:101::1',
    'fec0::1', '2001:db8::1', 'not-an-ip',
    // NAT64 (well-known and local-use), Teredo, SIIT, discard, documentation
    '64:ff9b::808:808', '64:ff9b:1::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '::ffff:0:7f00:1',
    '100::1', '3fff::1'
  ])('treats %s as non-public', (ip) => {
    expect(isNonPublicAddress(ip)).toBe(true);
  });

  test.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:808:808', '2002:808:808::1', '2a00:1450:4001::1'])('treats %s as public', (ip) => {
    expect(isNonPublicAddress(ip)).toBe(false);
  });

  test('accepts a public https URL', () => {
    expect(validateFontUrl('https://fonts.example.com/inter.woff2')?.hostname).toBe('fonts.example.com');
  });

  test.each([
    'http://fonts.example.com/inter.woff2',
    'file:///etc/passwd',
    'https://localhost/font.ttf',
    'https://127.0.0.1/font.ttf',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/font.ttf',
    'https://[::ffff:7f00:1]/font.ttf',
    'https://[::ffff:a9fe:a9fe]/latest/meta-data/',
    'https://user:pass@fonts.example.com/font.ttf',
    'not a url'
  ])('rejects %s', (url) => {
    expect(validateFontUrl(url)).toBeNull();
  });
});

describe('connect-time DNS guard', () => {
  test('refuses hostnames that resolve to loopback', async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      publicOnlyLookup('localhost', {}, (e) => resolve(e));
    });
    expect(err?.code).toBe('EBLOCKED');
  });
});
