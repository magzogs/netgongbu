// Builds the web viewer's "trace" example from the demo report, in Korean (public/data) and
// English (public/data/en):
//   pnpm --filter @netgongbu/trace build:example
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CatalogSchema, setLocale, tr, type Locale } from '@netgongbu/schema';
import { buildFromReport, TraceReportSchema } from '../src';

const ID = 'trace-demo';
const here = import.meta.dirname;
const root = join(here, '..', '..', '..', 'apps', 'web', 'public', 'data');

const report = TraceReportSchema.parse(
  JSON.parse(readFileSync(join(here, '..', 'test', 'fixtures', 'demo-report.json'), 'utf8')),
);

const write = (path: string, value: unknown): void => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

function buildExample(locale: Locale, data: string): void {
  setLocale(locale);
  const { topology, scenario } = buildFromReport(report, ID);
  topology.title = tr('실측 경로 예시 (데모 데이터)', 'Measured path example (demo data)');
  scenario.title = tr(
    '실측 예시: 서울에서 미국 서버까지 (데모 데이터)',
    'Measured example: from Seoul to a US server (demo data)',
  );

  mkdirSync(join(data, 'topologies'), { recursive: true });
  mkdirSync(join(data, 'scenarios'), { recursive: true });
  write(join(data, 'topologies', `${ID}.json`), topology);
  write(join(data, 'scenarios', `${ID}.json`), scenario);

  // Upsert by id, keeping the other examples' entries and this one last.
  const catalogPath = join(data, 'catalog.json');
  const catalog = CatalogSchema.parse(
    existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf8')) : { scenarios: [] },
  );
  const entry = { id: ID, topologyId: ID, title: scenario.title };
  catalog.scenarios = [...catalog.scenarios.filter((s) => s.id !== ID), entry];
  write(catalogPath, catalog);
  console.log(
    `wrote ${ID} (${locale}): ${String(topology.nodes.length)} nodes, ${String(scenario.beats.length)} beats`,
  );
}

buildExample('en', join(root, 'en'));
buildExample('ko', root);
