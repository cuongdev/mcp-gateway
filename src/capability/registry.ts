import type { ToolRegistry, RegisteredTool } from '../registry/tool.registry.js';
import type { PromptRegistry, RegisteredPrompt } from '../registry/prompt.registry.js';
import type { ResourceRegistry } from '../registry/resource.registry.js';
import type { RootRegistry } from '../registry/root.registry.js';
import type {
  Capability, CapabilityKind, ListCapabilityOptions,
  ToolCapability, PromptCapability,
} from './types.js';

function toolToCap(t: RegisteredTool): ToolCapability {
  return {
    canonicalName: t.canonicalName,
    serverName: t.serverName,
    kind: 'tool',
    enabled: t.enabled,
    sensitive: t.sensitive,
    tenantId: 'tnt_default',
    originalName: t.originalName,
    description: t.description,
    inputSchema: t.inputSchema,
    cacheable: t.cacheable,
    cacheTtlSec: t.cacheTtlSec,
    cachePerPrincipal: t.cachePerPrincipal,
  };
}

function promptToCap(p: RegisteredPrompt): PromptCapability {
  return {
    canonicalName: p.canonicalName,
    serverName: p.serverName,
    kind: 'prompt',
    enabled: p.enabled,
    sensitive: false,
    tenantId: 'tnt_default',
    originalName: p.originalName,
    description: p.description,
    argumentsSchema: p.argumentsSchema,
  };
}

/**
 * Façade unifying tool / prompt / resource / root registries behind one
 * `Capability` view. Reads only — writes still go through each concrete
 * registry (callers can grab them via the accessor methods).
 */
export class CapabilityRegistry {
  constructor(
    private readonly toolReg: ToolRegistry,
    private readonly promptReg: PromptRegistry,
    private readonly resourceReg: ResourceRegistry,
    private readonly rootReg: RootRegistry,
  ) {}

  list(opts: ListCapabilityOptions = {}): Capability[] {
    const all: Capability[] = [];
    if (!opts.kind || opts.kind === 'tool') {
      for (const t of this.toolReg.list()) all.push(toolToCap(t));
    }
    if (!opts.kind || opts.kind === 'prompt') {
      for (const p of this.promptReg.list()) all.push(promptToCap(p));
    }
    if (!opts.kind || opts.kind === 'resource') {
      for (const r of this.resourceReg.list()) all.push(r);
    }
    if (!opts.kind || opts.kind === 'root') {
      for (const r of this.rootReg.list()) all.push(r);
    }
    return all.filter((c) =>
      (!opts.serverName || c.serverName === opts.serverName) &&
      (!opts.enabledOnly || c.enabled),
    );
  }

  get(canonical: string, kind: CapabilityKind): Capability | undefined {
    switch (kind) {
      case 'tool': {
        const t = this.toolReg.get(canonical);
        return t ? toolToCap(t) : undefined;
      }
      case 'prompt': {
        const p = this.promptReg.get(canonical);
        return p ? promptToCap(p) : undefined;
      }
      case 'resource':
        return this.resourceReg.get(canonical);
      case 'root':
        return this.rootReg.get(canonical);
      default:
        return undefined;
    }
  }

  tools(): ToolRegistry { return this.toolReg; }
  prompts(): PromptRegistry { return this.promptReg; }
  resources(): ResourceRegistry { return this.resourceReg; }
  roots(): RootRegistry { return this.rootReg; }
}
