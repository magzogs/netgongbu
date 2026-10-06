// Small IPv4 helpers (IPv6 is passed through: the trace treats it as public).

function octets(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

export function isIPv4(ip: string): boolean {
  return octets(ip) !== null;
}

/** RFC 1918 private ranges and link-local. */
export function isPrivateIPv4(ip: string): boolean {
  const o = octets(ip);
  if (!o) return false;
  const [a = 0, b = 0] = o;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/** 100.64.0.0/10: shared address space used for carrier-grade NAT inside ISPs. */
export function isCgnatIPv4(ip: string): boolean {
  const o = octets(ip);
  return o !== null && o[0] === 100 && (o[1] ?? 0) >= 64 && (o[1] ?? 0) <= 127;
}

/** Addresses that have no meaningful public location or owner. */
export function isNonPublic(ip: string): boolean {
  const o = octets(ip);
  if (!o)
    return ip === '::1' || ip.toLowerCase().startsWith('fe80') || ip.toLowerCase().startsWith('fd');
  return isPrivateIPv4(ip) || isCgnatIPv4(ip) || o[0] === 127 || o[0] === 0;
}

/** "1.2.3.4" → "4.3.2.1", the form DNS-based lookups (reverse, Team Cymru) use. */
export function reversedOctets(ip: string): string | null {
  const o = octets(ip);
  return o ? [...o].reverse().join('.') : null;
}

/** Pads every byte to two hex digits: macOS prints "7c:49:cf:3d:3:d". */
export function normalizeMac(mac: string): string | null {
  const parts = mac.trim().toLowerCase().split(/[:-]/);
  if (parts.length !== 6 || !parts.every((p) => /^[0-9a-f]{1,2}$/.test(p))) return null;
  return parts.map((p) => p.padStart(2, '0')).join(':');
}
