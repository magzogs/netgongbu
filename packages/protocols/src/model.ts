/**
 * Where a value in the anatomy view comes from. The first three are the scenario's own
 * (measured, computed from measurements, usual stand-in); spec is a constant the protocol
 * standard fixes (IPv4 version 4, TLS record type 22, …).
 */
export type ByteSource = 'observed' | 'derived' | 'typical' | 'spec';

export interface Field {
  key: string;
  /** Name as the standard calls it, e.g. "Time To Live". */
  name: string;
  /** Value as shown to the learner, e.g. "64" or "SYN, ACK". */
  value: string;
  /** What the field is for, in the viewer's language. */
  meaning: string;
  source: ByteSource;
  /** Absolute bit offset in the bytes the field belongs to (frame or encrypted content). */
  bitOffset: number;
  bitLength: number;
  /** Sub-fields, e.g. the individual TCP flags or HPACK representations. */
  children?: Field[];
}

export type LayerKind =
  | 'ethernet'
  | 'wifi'
  | 'arp'
  | 'ipv4'
  | 'icmp'
  | 'udp'
  | 'tcp'
  | 'quic'
  | 'dns'
  | 'tls'
  | 'http1'
  | 'http2';

export interface DissectedLayer {
  kind: LayerKind;
  /** Display name, e.g. "IPv4". */
  title: string;
  /** Standard that defines it, e.g. "RFC 791". */
  standard: string;
  /** Byte range of this layer's header within its bytes. */
  start: number;
  length: number;
  /** Byte range of what the layer adds after its payload (Ethernet padding and FCS), if any. */
  trailer?: { start: number; length: number };
  /** Header fields, then trailer fields. */
  fields: Field[];
  /** True for content carried encrypted: its bytes are the plaintext, not what is on the wire. */
  encrypted: boolean;
  /** A note shown with the layer (e.g. what an observer on the path can and cannot see). */
  note?: string;
}

export interface Dissection {
  /** The frame exactly as it would cross the first link (outermost header first). */
  frame: Uint8Array;
  /** Layers on the wire, outermost first, with byte ranges in `frame`. */
  layers: DissectedLayer[];
  /** Plaintext of what an encryption layer carries (e.g. HTTP inside TLS), with its layers. */
  inner: { bytes: Uint8Array; layers: DissectedLayer[] } | null;
  /** Layers the scenario did not give but a real packet has, filled with usual values. */
  completed: string[];
}
