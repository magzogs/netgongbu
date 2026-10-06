import { z } from 'zod';
import { IdSchema } from './topology';

/**
 * List of ready-made scenarios. Each entry points at `scenarios/<id>.json` and
 * `topologies/<topologyId>.json` next to the catalog.
 */
export const CatalogEntrySchema = z.object({
  id: IdSchema,
  topologyId: IdSchema,
  title: z.string().min(1),
});
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

export const CatalogSchema = z.object({
  scenarios: z.array(CatalogEntrySchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;
