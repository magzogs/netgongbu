import type { BitWriter } from '../bits';
import type { DissectedLayer, LayerKind } from '../model';
import type { Values } from '../values';

/** What outer layers need to know about the packet while inner layers are encoded. */
export interface EncodeContext {
  srcIp: string;
  dstIp: string;
  /** IP protocol number of the transport (6 TCP, 17 UDP, 1 ICMP). */
  ipProtocol: number;
  /** EtherType of what the link layer carries (0x0800 IPv4, 0x0806 ARP). */
  etherType: number;
  /** Host name the packet is about (DNS question, TLS SNI, HTTP authority). */
  host: string | null;
  /** HTTP version spoken inside TLS ("h2", "http/1.1", "h3"). */
  http: 'h2' | 'http/1.1' | 'h3';
}

export interface Encoded {
  kind: LayerKind;
  title: string;
  standard: string;
  /** Header bits and their fields (offsets relative to this header). */
  header: BitWriter;
  /** For encryption layers: what goes on the wire instead of the inner bytes. */
  ciphertext?: Uint8Array;
  note?: string;
}

export type Encoder = (values: Values, payload: Uint8Array, ctx: EncodeContext) => Encoded;

export type { DissectedLayer };
