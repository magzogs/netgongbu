import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '@netgongbu/schema';
import { buildFromReport, TraceReportSchema } from '../src';

const HANGUL = /[가-힣]/;

function demo(): ReturnType<typeof TraceReportSchema.parse> {
  return TraceReportSchema.parse(
    JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'demo-report.json'), 'utf8')),
  );
}

describe('buildFromReport in English', () => {
  afterEach(() => {
    setLocale('ko');
  });

  it('writes the narration, labels and packet fields without Korean', () => {
    setLocale('en');
    const { topology, scenario } = buildFromReport(demo(), 'trace-demo');
    const narration = scenario.beats.map((b) => b.narration).join('\n');
    expect(narration).not.toMatch(HANGUL);
    expect(narration).toContain('address bar');
    expect(JSON.stringify(topology)).not.toMatch(HANGUL);
    expect(JSON.stringify(scenario)).not.toMatch(HANGUL);
  });

  it('still writes Korean by default', () => {
    const { scenario } = buildFromReport(demo(), 'trace-demo');
    expect(scenario.beats[0]?.narration).toMatch(HANGUL);
  });
});
