// Builds the web viewer's "trace" example from the demo report:
//   pnpm --filter @magvirtualedu/trace build:example
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CatalogSchema } from '@magvirtualedu/schema';
import { buildFromReport, TraceReportSchema } from '../src';

const ID = 'trace-demo';
const here = import.meta.dirname;
const data = join(here, '..', '..', '..', 'apps', 'web', 'public', 'data');

const report = TraceReportSchema.parse(
  JSON.parse(readFileSync(join(here, '..', 'test', 'fixtures', 'demo-report.json'), 'utf8')),
);
const { topology, scenario } = buildFromReport(report, ID);
topology.title = '실측 경로 예시 (데모 데이터)';
scenario.title = '실측 예시: 서울에서 미국 서버까지 (데모 데이터)';

const write = (path: string, value: unknown): void => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};
write(join(data, 'topologies', `${ID}.json`), topology);
write(join(data, 'scenarios', `${ID}.json`), scenario);

const catalogPath = join(data, 'catalog.json');
const catalog = CatalogSchema.parse(JSON.parse(readFileSync(catalogPath, 'utf8')));
const entry = { id: ID, topologyId: ID, title: scenario.title };
catalog.scenarios = [...catalog.scenarios.filter((s) => s.id !== ID), entry];
write(catalogPath, catalog);
console.log(
  `wrote ${ID}: ${String(topology.nodes.length)} nodes, ${String(scenario.beats.length)} beats`,
);
