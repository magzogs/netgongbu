import { normalizeMac } from '../ip';
import type { DefaultRoute } from './darwin';

// Parsers for Linux iproute2 output and resolv.conf.

/** `ip route show default`: "default via 192.168.1.1 dev wlan0 proto dhcp metric 600" */
export function parseIpRouteDefault(stdout: string): DefaultRoute | null {
  for (const line of stdout.split('\n')) {
    const m = /^default via (\S+) dev (\S+)/.exec(line.trim());
    if (m?.[1] && m[2]) return { gateway: m[1], interface: m[2] };
  }
  return null;
}

/** `ip neigh show <ip>`: "192.168.1.1 dev wlan0 lladdr aa:bb:cc:dd:ee:ff REACHABLE" */
export function parseIpNeigh(stdout: string): string | null {
  const mac = /lladdr ([0-9a-f:]+)/i.exec(stdout)?.[1];
  return mac ? normalizeMac(mac) : null;
}

/** nameserver lines of /etc/resolv.conf. */
export function parseResolvConf(text: string): string[] {
  const servers: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*nameserver\s+(\S+)/.exec(line);
    if (m?.[1] && !servers.includes(m[1])) servers.push(m[1]);
  }
  return servers;
}
