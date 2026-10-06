import { z } from 'zod';
import { GeoSchema } from '@magvirtualedu/schema';

/**
 * Everything one page load measured on the learner's computer. It is the evidence: the topology
 * and scenario are built from it deterministically, so they can be rebuilt (or re-explained)
 * from a saved report at any time.
 */

export const PLATFORMS = ['darwin', 'linux', 'win32', 'other'] as const;

export const LocalNetworkSchema = z.object({
  platform: z.enum(PLATFORMS),
  /** The interface the default route leaves through. */
  interface: z
    .object({
      name: z.string(),
      kind: z.enum(['wifi', 'ethernet', 'other']),
      ipv4: z.string().nullable(),
      mac: z.string().nullable(),
      netmask: z.string().nullable(),
    })
    .nullable(),
  gateway: z.object({ ip: z.string(), mac: z.string().nullable() }).nullable(),
  /** The routing table entry used for the internet, as the OS prints it. */
  defaultRoute: z.string().nullable(),
  /** Resolvers the OS asks for ordinary names (VPN-only, scoped resolvers left out). */
  dnsServers: z.array(z.string()),
});
export type LocalNetwork = z.infer<typeof LocalNetworkSchema>;

export const DnsAddressSchema = z.object({
  address: z.string(),
  family: z.union([z.literal(4), z.literal(6)]),
  ttl: z.number().nullable(),
});

export const DnsLookupSchema = z.object({
  host: z.string(),
  cnames: z.array(z.string()),
  addresses: z.array(DnsAddressSchema),
  /** Resolver that answered (the first configured one). */
  server: z.string().nullable(),
});
export type DnsLookup = z.infer<typeof DnsLookupSchema>;

/** Phase durations in milliseconds; null when the phase did not happen (e.g. reused connection). */
export const TimingSchema = z.object({
  dnsMs: z.number().nullable(),
  connectMs: z.number().nullable(),
  tlsMs: z.number().nullable(),
  sendMs: z.number().nullable(),
  waitMs: z.number().nullable(),
  receiveMs: z.number().nullable(),
});
export type Timing = z.infer<typeof TimingSchema>;

export const SecuritySchema = z.object({
  protocol: z.string(),
  keyExchange: z.string(),
  cipher: z.string(),
  subject: z.string(),
  issuer: z.string(),
  validTo: z.string().nullable(),
  san: z.array(z.string()),
});
export type Security = z.infer<typeof SecuritySchema>;

/** One request the browser made, as Chromium reported it (DevTools protocol). */
export const CapturedRequestSchema = z.object({
  id: z.string(),
  url: z.string(),
  method: z.string(),
  resourceType: z.string(),
  status: z.number().nullable(),
  statusText: z.string(),
  /** "http/1.1", "h2", "h3", … */
  protocol: z.string().nullable(),
  remoteIp: z.string().nullable(),
  remotePort: z.number().nullable(),
  connectionId: z.number().nullable(),
  connectionReused: z.boolean(),
  fromCache: z.boolean(),
  requestHeaders: z.record(z.string(), z.string()),
  responseHeaders: z.record(z.string(), z.string()),
  timing: TimingSchema.nullable(),
  security: SecuritySchema.nullable(),
  encodedBytes: z.number().nullable(),
  /** Set when this response redirected the browser elsewhere. */
  redirectedTo: z.string().nullable(),
});
export type CapturedRequest = z.infer<typeof CapturedRequestSchema>;

export const AsnSchema = z.object({
  number: z.number(),
  name: z.string(),
  country: z.string().nullable(),
});
export type Asn = z.infer<typeof AsnSchema>;

export const HopSchema = z.object({
  ttl: z.number().int().positive(),
  /** null when the router did not answer within the timeout. */
  ip: z.string().nullable(),
  rttMs: z.number().nullable(),
  hostname: z.string().nullable(),
  asn: AsnSchema.nullable(),
  geo: GeoSchema.nullable(),
});
export type Hop = z.infer<typeof HopSchema>;

export const PathSchema = z.object({
  /** Address traced to (the server the page's main document came from). */
  target: z.string().nullable(),
  hops: z.array(HopSchema),
  /** True when the target itself answered. */
  complete: z.boolean(),
  error: z.string().nullable(),
});
export type TracePath = z.infer<typeof PathSchema>;

export const TraceReportSchema = z.object({
  version: z.literal(1),
  /** What the learner typed. */
  input: z.string(),
  startedAt: z.string(),
  userAgent: z.string(),
  local: LocalNetworkSchema,
  /** Every request of the page load in the order they started. */
  requests: z.array(CapturedRequestSchema),
  /** Requests of the main document, from the first URL through each redirect. */
  documentChain: z.array(z.string()),
  dns: DnsLookupSchema.nullable(),
  path: PathSchema,
  /** Where the learner probably is: the first public hop's location. */
  origin: GeoSchema.nullable(),
  /** Attribution for the location data, when any was used. */
  geoSource: z.string().nullable(),
});
export type TraceReport = z.infer<typeof TraceReportSchema>;

/** The final document request: the last of the redirect chain. */
export function mainRequest(report: TraceReport): CapturedRequest | undefined {
  const id = report.documentChain.at(-1);
  return report.requests.find((r) => r.id === id);
}
