import { reversedOctets } from '../ip';

// Team Cymru IP-to-ASN mapping over DNS (TXT records), no API key or HTTP needed:
//   4.3.2.1.origin.asn.cymru.com  → "13335 | 104.20.0.0/14 | US | arin | 2014-03-28"
//   AS13335.asn.cymru.com         → "13335 | US | arin | 2010-07-14 | CLOUDFLARENET, US"

export function originQueryName(ip: string): string | null {
  const reversed = reversedOctets(ip);
  return reversed ? `${reversed}.origin.asn.cymru.com` : null;
}

export function asnQueryName(asn: number): string {
  return `AS${String(asn)}.asn.cymru.com`;
}

/** First AS number of an origin answer (multi-origin prefixes list several, space separated). */
export function parseOriginTxt(txt: string): { asn: number; country: string | null } | null {
  const [asns, , country] = txt.split('|').map((s) => s.trim());
  const asn = Number(asns?.split(/\s+/)[0]);
  if (!Number.isInteger(asn) || asn <= 0) return null;
  return { asn, country: country !== undefined && country !== '' ? country : null };
}

/** "CLOUDFLARENET, US" → "CLOUDFLARENET" (the trailing country is repeated elsewhere). */
export function parseAsnTxt(txt: string): string | null {
  const name = txt.split('|')[4]?.trim();
  if (!name) return null;
  return name.replace(/,\s*[A-Z]{2}$/, '');
}
