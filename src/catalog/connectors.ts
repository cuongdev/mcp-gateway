// ============================================================
// Connector template registry — loader + lookup (spec §4.4)
// ============================================================

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { logger } from '../utils/logger.js';
import type {
  ConnectorCategory,
  ConnectorFilter,
  ConnectorSupports,
  ConnectorTemplate,
} from './types.js';

// ---- Zod schemas --------------------------------------------------

const CategoryEnum = z.enum([
  'developer-tools',
  'databases',
  'productivity',
  'cloud',
  'ai-ml',
  'communications',
  'local',
]);

const EnvSchema = z.object({
  key: z.string().min(1),
  description: z.string(),
  secret: z.boolean(),
  pattern: z.string().optional(),
});

const ArgSchema = z.object({
  key: z.string().min(1),
  description: z.string(),
  default: z.unknown().optional(),
  type: z.enum(['string', 'number', 'boolean']),
});

const TransportSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stdio'),
    command: z.string().min(1),
    args: z.array(z.string()),
    envPassthrough: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal('streamable-http'),
    urlTemplate: z.string().min(1),
  }),
]);

const SupportsSchema = z.object({
  tools: z.boolean(),
  resources: z.boolean(),
  prompts: z.boolean(),
  sampling: z.boolean(),
  roots: z.boolean(),
});

const DefaultsSchema = z
  .object({
    rateLimit: z.object({ perSecond: z.number().positive() }).optional(),
    quota: z.object({ perDay: z.number().positive() }).optional(),
    circuit: z.record(z.unknown()).optional(),
  })
  .optional();

export const ConnectorTemplateSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  category: CategoryEnum,
  iconSlug: z.string().optional(),
  docsUrl: z.string().url(),
  templateVersion: z.string().min(1),
  transport: TransportSchema,
  requiredEnv: z.array(EnvSchema),
  requiredArgs: z.array(ArgSchema).optional(),
  optionalArgs: z.array(ArgSchema).optional(),
  supports: SupportsSchema,
  defaults: DefaultsSchema,
});

export const ConnectorCatalogFileSchema = z.object({
  version: z.string(),
  connectors: z.array(z.unknown()),
});

// ---- Registry -----------------------------------------------------

export class ConnectorRegistry {
  private byId = new Map<string, ConnectorTemplate>();

  /** Load and validate connectors from a JSON file. */
  loadFromFile(path: string): void {
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch (err) {
      logger.warn(
        { err, path },
        'ConnectorRegistry: failed to read catalog file',
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      logger.warn(
        { err, path },
        'ConnectorRegistry: catalog file is not valid JSON',
      );
      return;
    }

    const fileResult = ConnectorCatalogFileSchema.safeParse(parsed);
    if (!fileResult.success) {
      logger.warn(
        { issues: fileResult.error.issues, path },
        'ConnectorRegistry: catalog file shape invalid',
      );
      return;
    }

    this.byId.clear();
    let accepted = 0;
    let rejected = 0;
    for (const entry of fileResult.data.connectors) {
      const r = ConnectorTemplateSchema.safeParse(entry);
      if (!r.success) {
        rejected += 1;
        logger.warn(
          {
            issues: r.error.issues,
            entryId:
              entry && typeof entry === 'object' && 'id' in entry
                ? (entry as { id: unknown }).id
                : '<unknown>',
          },
          'ConnectorRegistry: skipping invalid connector entry',
        );
        continue;
      }
      const tpl = r.data as ConnectorTemplate;
      if (this.byId.has(tpl.id)) {
        rejected += 1;
        logger.warn(
          { id: tpl.id },
          'ConnectorRegistry: duplicate connector id, skipping',
        );
        continue;
      }
      this.byId.set(tpl.id, tpl);
      accepted += 1;
    }

    logger.info(
      { accepted, rejected, path },
      'ConnectorRegistry: loaded catalog',
    );
  }

  /**
   * Probe three candidate paths for the built-in catalog:
   *  1. ../../data/catalog/connectors.json relative to this module (dist or src)
   *  2. ../../../data/catalog/connectors.json relative to this module (nested)
   *  3. process.cwd()/data/catalog/connectors.json
   * First existing path wins.
   */
  loadBuiltin(): void {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(here, '../../data/catalog/connectors.json'),
      resolve(here, '../../../data/catalog/connectors.json'),
      resolve(process.cwd(), 'data/catalog/connectors.json'),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        this.loadFromFile(candidate);
        return;
      }
    }

    logger.warn(
      { candidates },
      'ConnectorRegistry: no built-in catalog file found',
    );
  }

  list(): ConnectorTemplate[] {
    return Array.from(this.byId.values()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  }

  get(id: string): ConnectorTemplate | undefined {
    return this.byId.get(id);
  }

  filter(opts: ConnectorFilter): ConnectorTemplate[] {
    return this.list().filter((t) => {
      if (opts.category && t.category !== opts.category) return false;
      if (opts.supports) {
        const key = opts.supports as keyof ConnectorSupports;
        if (!t.supports[key]) return false;
      }
      return true;
    });
  }

  get size(): number {
    return this.byId.size;
  }

  /** Test helper — drop all loaded templates. */
  clear(): void {
    this.byId.clear();
  }
}

export type { ConnectorCategory };
