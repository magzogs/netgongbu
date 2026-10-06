import { promises as dns } from 'node:dns';
import type { Geo } from '@magvirtualedu/schema';
import {
  asnQueryName,
  isNonPublic,
  originQueryName,
  parseAsnTxt,
  parseOriginTxt,
  type Asn,
  type Hop,
  type TracerouteLine,
} from '@magvirtualedu/trace';
import { withTimeout } from './exec';

/** What can be learned about a router address beyond the address itself. */
export interface HopLookups {
  reverse: (ip: string) => Promise<string | null>;
  asn: (ip: string) => Promise<Asn | null>;
  geo: (ip: string) => Geo | null;
}

/** Reverse DNS and Team Cymru ASN over DNS (no web service), cached per address / AS. */
export function dnsLookups(geo: (ip: string) => Geo | null): HopLookups {
  const names = new Map<number, Promise<string | null>>();
  const asName = (asn: number): Promise<string | null> => {
    let name = names.get(asn);
    if (!name) {
      name = withTimeout(dns.resolveTxt(asnQueryName(asn)), 3000, []).then((txt) =>
        parseAsnTxt(txt.flat().join('')),
      );
      names.set(asn, name);
    }
    return name;
  };
  return {
    reverse: (ip) => withTimeout(dns.reverse(ip), 2500, []).then((n) => n[0] ?? null),
    asn: async (ip) => {
      const query = originQueryName(ip);
      if (!query) return null;
      const txt = await withTimeout(dns.resolveTxt(query), 3000, []);
      const origin = parseOriginTxt(txt.flat().join(''));
      if (!origin) return null;
      return {
        number: origin.asn,
        name: (await asName(origin.asn)) ?? `AS${String(origin.asn)}`,
        country: origin.country,
      };
    },
    geo,
  };
}

/** A traceroute line with its name, operator and place (public addresses only). */
export async function enrichHop(line: TracerouteLine, lookups: HopLookups): Promise<Hop> {
  const base: Hop = {
    ttl: line.ttl,
    ip: line.ip,
    rttMs: line.rttMs,
    hostname: null,
    asn: null,
    geo: null,
  };
  if (!line.ip || isNonPublic(line.ip)) return base;
  const [hostname, asn] = await Promise.all([lookups.reverse(line.ip), lookups.asn(line.ip)]);
  return { ...base, hostname, asn, geo: lookups.geo(line.ip) };
}
