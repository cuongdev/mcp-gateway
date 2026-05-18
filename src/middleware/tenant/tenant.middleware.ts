import type { MiddlewareHandler } from 'hono';
import type { StorageAdapter } from '../../storage/adapter.js';

export interface TenantMiddlewareOptions {
  storage: StorageAdapter;
  enabled: boolean;
  headerName: string;
  defaultSlug: string;
  suspendedHttpStatus: number;
}

export function tenantMiddleware(opts: TenantMiddlewareOptions): MiddlewareHandler {
  return async (c, next) => {
    if (!opts.enabled) {
      c.set('tenantId', 'tnt_default');
      return next();
    }

    const slug =
      c.req.header(opts.headerName) ??
      c.req.header(opts.headerName.toLowerCase()) ??
      opts.defaultSlug;

    // When the resolved slug is the default slug, skip DB lookup and use
    // the canonical default tenant ID.
    if (slug === opts.defaultSlug) {
      c.set('tenantId', `tnt_${opts.defaultSlug}`);
      return next();
    }

    const tenant = await opts.storage.tenants.findBySlug(slug);

    if (!tenant) {
      return c.json({ error: { code: 'tenant_not_found', slug } }, 404);
    }
    if (tenant.status === 'suspended' || tenant.status === 'deleted') {
      return c.json(
        { error: { code: 'tenant_suspended', slug } },
        opts.suspendedHttpStatus as never,
      );
    }

    c.set('tenantId', tenant.id);
    c.set('tenant', tenant);
    return next();
  };
}
