import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import type { DnsLookup } from '@netgongbu/trace';
import { withTimeout } from './exec';

/**
 * Resolves the page's host the way the browser's resolver did: against the first configured DNS
 * server when it is a plain address (not a local stub such as 127.0.0.53), with TTLs.
 */
export async function lookupHost(
  host: string,
  servers: readonly string[],
): Promise<DnsLookup | null> {
  if (isIP(host))
    return {
      host,
      cnames: [],
      addresses: [{ address: host, family: isIP(host) === 6 ? 6 : 4, ttl: null }],
      server: null,
    };
  const server = servers.find((s) => isIP(s) !== 0) ?? null;
  const resolver = new dns.Resolver({ timeout: 3000, tries: 1 });
  if (server && !/^(127\.|::1$)/.test(server)) resolver.setServers([server]);

  const [v4, v6, cname] = await Promise.all([
    withTimeout(resolver.resolve4(host, { ttl: true }), 4000, []),
    withTimeout(resolver.resolve6(host, { ttl: true }), 4000, []),
    withTimeout(resolver.resolveCname(host), 4000, []),
  ]);
  const addresses = [
    ...v4.map((a) => ({ address: a.address, family: 4 as const, ttl: a.ttl })),
    ...v6.map((a) => ({ address: a.address, family: 6 as const, ttl: a.ttl })),
  ];
  if (addresses.length === 0) return null;
  return { host, cnames: cname, addresses, server };
}
