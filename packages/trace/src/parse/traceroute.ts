/** One line of `traceroute -n -q 1` (macOS and Linux print the same shape). */
export interface TracerouteLine {
  ttl: number;
  ip: string | null;
  rttMs: number | null;
}

/**
 * " 3  116.251.184.164  3.435 ms" → hop 3; " 4  *" → hop 4 without answer. The header line
 * ("traceroute to …") and blank lines give null. Annotations such as "!H" are ignored.
 */
export function parseTracerouteLine(line: string): TracerouteLine | null {
  const m = /^\s*(\d+)\s+(.*)$/.exec(line);
  if (!m?.[1] || m[2] === undefined) return null;
  const ttl = Number(m[1]);
  const rest = m[2].trim();
  if (rest.startsWith('*')) return { ttl, ip: null, rttMs: null };
  const answer = /^([0-9a-f.:]+)\s+([\d.]+)\s*ms/i.exec(rest);
  if (!answer?.[1] || !answer[2]) return null;
  return { ttl, ip: answer[1], rttMs: Number(answer[2]) };
}

/** Splits a stream of stdout chunks into whole lines. */
export function lineSplitter(onLine: (line: string) => void): (chunk: string) => void {
  let pending = '';
  return (chunk) => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) onLine(line);
  };
}
