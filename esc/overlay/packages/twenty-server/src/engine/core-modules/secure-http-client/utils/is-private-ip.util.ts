import { BlockList } from 'net';

const PRIVATE_RANGES = new BlockList();

PRIVATE_RANGES.addSubnet('0.0.0.0', 8);
PRIVATE_RANGES.addSubnet('10.0.0.0', 8);
PRIVATE_RANGES.addSubnet('100.64.0.0', 10);
PRIVATE_RANGES.addSubnet('127.0.0.0', 8);
PRIVATE_RANGES.addSubnet('169.254.0.0', 16);
PRIVATE_RANGES.addSubnet('172.16.0.0', 12);
PRIVATE_RANGES.addSubnet('192.0.0.0', 24);
PRIVATE_RANGES.addSubnet('192.0.2.0', 24);
PRIVATE_RANGES.addSubnet('192.168.0.0', 16);
PRIVATE_RANGES.addSubnet('198.18.0.0', 15);
PRIVATE_RANGES.addSubnet('198.51.100.0', 24);
PRIVATE_RANGES.addSubnet('203.0.113.0', 24);
PRIVATE_RANGES.addSubnet('224.0.0.0', 4);
PRIVATE_RANGES.addSubnet('240.0.0.0', 4);

PRIVATE_RANGES.addSubnet('::1', 128, 'ipv6');
PRIVATE_RANGES.addSubnet('::', 128, 'ipv6');
PRIVATE_RANGES.addSubnet('fc00::', 7, 'ipv6');
PRIVATE_RANGES.addSubnet('fe80::', 10, 'ipv6');

const fromLong = (ipl: number): string => {
  return `${ipl >>> 24}.${(ipl >> 16) & 255}.${(ipl >> 8) & 255}.${ipl & 255}`;
};

// Parses IPv4 in any encoding (dotted decimal, octal, hex, bare integer)
// into a 32-bit unsigned integer. Returns -1 for invalid input.
const normalizeToLong = (addr: string): number => {
  const parts = addr.split('.').map((part) => {
    if (part.startsWith('0x') || part.startsWith('0X')) {
      return parseInt(part, 16);
    } else if (part.startsWith('0') && part !== '0' && /^[0-7]+$/.test(part)) {
      return parseInt(part, 8);
    } else if (/^[1-9]\d*$/.test(part) || part === '0') {
      return parseInt(part, 10);
    } else {
      return NaN;
    }
  });

  if (parts.some(isNaN)) return -1;

  let val = 0;
  const n = parts.length;

  switch (n) {
    case 1:
      val = parts[0];
      break;
    case 2:
      if (parts[0] > 0xff || parts[1] > 0xffffff) return -1;
      val = (parts[0] << 24) | (parts[1] & 0xffffff);
      break;
    case 3:
      if (parts[0] > 0xff || parts[1] > 0xff || parts[2] > 0xffff) return -1;
      val = (parts[0] << 24) | (parts[1] << 16) | (parts[2] & 0xffff);
      break;
    case 4:
      if (parts.some((part) => part > 0xff)) return -1;
      val = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
      break;
    default:
      return -1;
  }

  return val >>> 0;
};

// Extracts the embedded IPv4 from an IPv4-mapped IPv6 address in hex
// notation (e.g. ::ffff:a9fe:a9fe → 169.254.169.254). Returns null
// if the address is not in this form.
const HEX_MAPPED_RE = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

const extractIpv4FromHexMappedIpv6 = (addr: string): string | null => {
  const match = addr.match(HEX_MAPPED_RE);

  if (!match) {
    return null;
  }

  const hi = parseInt(match[1], 16);
  const lo = parseInt(match[2], 16);

  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
};

// Extracts the embedded IPv4 from an IPv4-mapped IPv6 address in
// dotted-decimal notation (e.g. ::ffff:127.0.0.1 → 127.0.0.1).
const DOTTED_MAPPED_RE = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

const extractIpv4FromDottedMappedIpv6 = (addr: string): string | null => {
  const match = addr.match(DOTTED_MAPPED_RE);

  return match ? match[1] : null;
};

// ESC OVERLAY PATCH — an exact-match allowlist, read at call time so a container restart is enough
// to change it. Twenty's workflow HTTP_REQUEST action refuses any host that resolves
// to a private address, re-checking AFTER DNS, and upstream exposes no allowlist. We
// need exactly one internal endpoint reachable from a workflow — the twenty-ingest
// service on CT175, which rebuilds ONE customer's interest profile (C4, Redmine
// #14830). Publishing that endpoint on the internet was the larger exposure.
//
// FAILS CLOSED: with ESC_SSRF_ALLOWED_HOSTS unset or empty this is exactly upstream's
// behaviour. Exact-match on the address only — a CIDR here would quietly re-open the
// whole estate.
const isEscAllowedHost = (addr: string): boolean =>
  (process.env.ESC_SSRF_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
    .includes(addr);

export const isPrivateIp = (addr: string): boolean => {
  if (isEscAllowedHost(addr)) {
    return false;
  }

  // IPv4-mapped IPv6 in hex form — the form Node.js URL parser produces.
  const hexMappedIpv4 = extractIpv4FromHexMappedIpv6(addr);

  if (hexMappedIpv4 !== null) {
    return PRIVATE_RANGES.check(hexMappedIpv4);
  }

  // IPv4-mapped IPv6 in dotted-decimal form (::ffff:D.D.D.D)
  const dottedMappedIpv4 = extractIpv4FromDottedMappedIpv6(addr);

  if (dottedMappedIpv4 !== null) {
    return PRIVATE_RANGES.check(dottedMappedIpv4);
  }

  // Pure IPv6 (any address containing a colon that isn't IPv4-mapped)
  if (addr.includes(':')) {
    return PRIVATE_RANGES.check(addr, 'ipv6');
  }

  // IPv4 in any encoding (standard, octal, hex, bare integer)
  const ipl = normalizeToLong(addr);

  if (ipl < 0) {
    throw new Error('invalid ipv4 address');
  }

  return PRIVATE_RANGES.check(fromLong(ipl));
};
