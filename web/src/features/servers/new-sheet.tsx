import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChipInput } from '@/components/chip-input';
import { useRegisterServer } from './api';
import type { RegisterServerBody, ServerTransport } from '@/types/api';

type TransportType = 'streamable-http' | 'sse' | 'stdio' | 'openapi';

interface FormState {
  name: string;
  type: TransportType;
  // HTTP / SSE
  url: string;
  bearerToken: string;
  headers: string;
  // stdio
  command: string;
  args: string;
  env: string;
  stateful: boolean;
  // openapi
  specUrl: string;
  specPath: string;
  baseUrl: string;
  openapiToken: string;
  tags: string[];
  operationIds: string[];
  excludeOps: string[];
}

const empty: FormState = {
  name: '',
  type: 'streamable-http',
  url: '',
  bearerToken: '',
  headers: '',
  command: '',
  args: '',
  env: '',
  stateful: false,
  specUrl: '',
  specPath: '',
  baseUrl: '',
  openapiToken: '',
  tags: [],
  operationIds: [],
  excludeOps: [],
};

/** Parse a textarea of "key<sep>value" lines into an object (or undefined if empty). */
function parseKeyVals(text: string, sep: '=' | ':'): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(sep);
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    if (k) out[k] = t.slice(i + 1).trim();
  }
  return Object.keys(out).length ? out : undefined;
}

function buildTransport(f: FormState): ServerTransport {
  if (f.type === 'stdio') {
    const env = parseKeyVals(f.env, '=');
    return {
      type: 'stdio',
      command: f.command,
      args: f.args.split(/\s+/).filter(Boolean),
      stateful: f.stateful,
      ...(env ? { env } : {}),
    };
  }
  if (f.type === 'openapi') {
    return {
      type: 'openapi',
      ...(f.specUrl ? { specUrl: f.specUrl } : {}),
      ...(f.specPath ? { specPath: f.specPath } : {}),
      ...(f.baseUrl ? { baseUrl: f.baseUrl } : {}),
      ...(f.openapiToken ? { auth: { type: 'bearer', token: f.openapiToken } } : {}),
      ...(f.tags.length || f.operationIds.length || f.excludeOps.length
        ? {
            filter: {
              ...(f.tags.length ? { tags: f.tags } : {}),
              ...(f.operationIds.length ? { operationIds: f.operationIds } : {}),
              ...(f.excludeOps.length ? { exclude: f.excludeOps } : {}),
            },
          }
        : {}),
    };
  }
  const headers = parseKeyVals(f.headers, ':');
  return {
    type: f.type,
    url: f.url,
    ...(f.bearerToken ? { bearerToken: f.bearerToken } : {}),
    ...(headers ? { headers } : {}),
    timeout: 30000,
  };
}

export function ServerNewSheet() {
  const navigate = useNavigate();
  const close = () => navigate('/servers');
  const [f, set] = useState<FormState>(empty);
  const register = useRegisterServer();

  const submit = async () => {
    const body: RegisterServerBody = { name: f.name, transport: buildTransport(f) };
    try {
      await register.mutateAsync(body);
      close();
    } catch { /* toast handled in hook */ }
  };

  const canSubmit =
    f.name.trim() !== '' &&
    !register.isPending &&
    (f.type === 'stdio'
      ? f.command.trim() !== ''
      : f.type === 'openapi'
        ? (f.specUrl.trim() !== '' || f.specPath.trim() !== '')
        : f.url.trim() !== '');

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Register MCP Server</SheetTitle>
          <SheetDescription>Add an upstream MCP server and discover its tools.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Server name</Label>
            <Input id="name" value={f.name} onChange={(e) => set({ ...f, name: e.target.value })} placeholder="my-server" />
          </div>

          <div className="space-y-1.5">
            <Label>Transport</Label>
            <Select value={f.type} onValueChange={(v) => set({ ...f, type: v as TransportType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="streamable-http">Streamable HTTP</SelectItem>
                <SelectItem value="sse">SSE</SelectItem>
                <SelectItem value="stdio">STDIO</SelectItem>
                <SelectItem value="openapi">OpenAPI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(f.type === 'streamable-http' || f.type === 'sse') && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="url">URL</Label>
                <Input id="url" value={f.url} onChange={(e) => set({ ...f, url: e.target.value })} placeholder="http://localhost:8001/mcp" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bearer">Bearer token (optional)</Label>
                <Input id="bearer" value={f.bearerToken} onChange={(e) => set({ ...f, bearerToken: e.target.value })} placeholder="upstream-secret" type="password" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="headers">Headers (optional)</Label>
                <Textarea
                  id="headers"
                  value={f.headers}
                  onChange={(e) => set({ ...f, headers: e.target.value })}
                  placeholder={'X-API-Key: abc123\nX-Org: acme'}
                  rows={3}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  One <code>Name: value</code> per line. Forwarded to the upstream on every request.
                </p>
              </div>
            </>
          )}

          {f.type === 'stdio' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="command">Command</Label>
                <Input id="command" value={f.command} onChange={(e) => set({ ...f, command: e.target.value })} placeholder="node" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="args">Arguments</Label>
                <Input id="args" value={f.args} onChange={(e) => set({ ...f, args: e.target.value })} placeholder="./server.js --port 8001" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="env">Environment variables (optional)</Label>
                <Textarea
                  id="env"
                  value={f.env}
                  onChange={(e) => set({ ...f, env: e.target.value })}
                  placeholder={'GITHUB_TOKEN=ghp_xxx\nAPI_BASE_URL=https://api.example.com'}
                  rows={3}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  One <code>KEY=value</code> per line. Passed to the child process — use for credentials.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="stateful" className="flex flex-col">
                  <span>Stateful</span>
                  <span className="text-xs font-normal text-muted-foreground">Keep the child process alive between calls.</span>
                </Label>
                <Switch id="stateful" checked={f.stateful} onCheckedChange={(v) => set({ ...f, stateful: v })} />
              </div>
            </>
          )}

          {f.type === 'openapi' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="specUrl">Spec URL</Label>
                <Input id="specUrl" value={f.specUrl} onChange={(e) => set({ ...f, specUrl: e.target.value })} placeholder="https://api.example.com/openapi.json" />
              </div>
              <div className="text-center text-xs text-muted-foreground">— OR —</div>
              <div className="space-y-1.5">
                <Label htmlFor="specPath">Spec path (server-local file)</Label>
                <Input id="specPath" value={f.specPath} onChange={(e) => set({ ...f, specPath: e.target.value })} placeholder="/etc/mcp-gateway/openapi.yaml" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="baseUrl">Base URL (override)</Label>
                <Input id="baseUrl" value={f.baseUrl} onChange={(e) => set({ ...f, baseUrl: e.target.value })} placeholder="https://api.example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="oaToken">Bearer token (optional)</Label>
                <Input id="oaToken" value={f.openapiToken} onChange={(e) => set({ ...f, openapiToken: e.target.value })} placeholder="api-key" type="password" />
              </div>
              <div className="space-y-1.5">
                <Label>Filter by tags</Label>
                <ChipInput value={f.tags} onChange={(v) => set({ ...f, tags: v })} placeholder="users, admin" ariaLabel="tags" />
              </div>
              <div className="space-y-1.5">
                <Label>Include operations (allowlist)</Label>
                <ChipInput value={f.operationIds} onChange={(v) => set({ ...f, operationIds: v })} placeholder="listUsers, getUser" ariaLabel="operationIds" />
              </div>
              <div className="space-y-1.5">
                <Label>Exclude operations</Label>
                <ChipInput value={f.excludeOps} onChange={(v) => set({ ...f, excludeOps: v })} placeholder="deleteUser" ariaLabel="exclude" />
              </div>
            </>
          )}
        </div>

        <SheetFooter>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {register.isPending ? 'Registering…' : 'Register'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
