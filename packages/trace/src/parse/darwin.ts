import { normalizeMac } from '../ip';

// Parsers for macOS tools. Each takes the tool's stdout and returns null when the output does
// not have the expected shape, so a changed format degrades to "unknown" instead of wrong data.

export interface DefaultRoute {
  gateway: string;
  interface: string;
}

/** `route -n get default` */
export function parseRouteGetDefault(stdout: string): DefaultRoute | null {
  const gateway = /^\s*gateway:\s*(\S+)/m.exec(stdout)?.[1];
  const iface = /^\s*interface:\s*(\S+)/m.exec(stdout)?.[1];
  return gateway && iface ? { gateway, interface: iface } : null;
}

/** `arp -n <ip>`: "? (192.168.4.1) at 7c:49:cf:3d:3:d on en0 ifscope [ethernet]" */
export function parseArp(stdout: string, iface?: string): string | null {
  for (const line of stdout.split('\n')) {
    const m = /\(([\d.]+)\) at ([0-9a-f:]+) on (\S+)/i.exec(line);
    if (m?.[2] && (!iface || m[3] === iface)) return normalizeMac(m[2]);
  }
  return null;
}

/** `networksetup -listallhardwareports`: interface name → hardware port ("Wi-Fi", "Ethernet"). */
export function parseHardwarePorts(stdout: string): Map<string, string> {
  const ports = new Map<string, string>();
  for (const block of stdout.split(/\n\s*\n/)) {
    const port = /Hardware Port:\s*(.+)/.exec(block)?.[1]?.trim();
    const device = /Device:\s*(\S+)/.exec(block)?.[1];
    if (port && device) ports.set(device, port);
  }
  return ports;
}

export function interfaceKind(port: string | undefined): 'wifi' | 'ethernet' | 'other' {
  if (!port) return 'other';
  if (/wi-?fi|airport/i.test(port)) return 'wifi';
  if (/ethernet|thunderbolt|usb.*lan/i.test(port)) return 'ethernet';
  return 'other';
}

/**
 * `scutil --dns`: name servers of the general resolvers — those without a `domain` (which only
 * serve that domain) and not marked Supplemental (VPN search domains). Only the first section is
 * read; the "for scoped queries" section repeats per-interface resolvers.
 */
export function parseScutilDns(stdout: string): string[] {
  const general = stdout.split(/DNS configuration \(for scoped queries\)/)[0] ?? '';
  const servers: string[] = [];
  for (const block of general.split(/\n(?=resolver #\d+)/)) {
    if (!block.startsWith('resolver #')) continue;
    if (/^\s*domain\s*:/m.test(block) || /flags\s*:.*Supplemental/.test(block)) continue;
    for (const m of block.matchAll(/nameserver\[\d+\]\s*:\s*(\S+)/g)) {
      if (m[1] && !servers.includes(m[1])) servers.push(m[1]);
    }
  }
  return servers;
}
