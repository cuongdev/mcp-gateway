import { describe, it, expect, vi } from 'vitest';
import { SessionManager } from '../../src/session/session.manager.js';

/**
 * Exercises the reverse-channel redaction legs wired into
 * SessionManager.handleUpstreamReverseRequest (v0.10, gated by
 * gateway.reverseChannelRedaction). We drive the private method directly
 * with a stub mux + redactor + a fake STDIO session that captures whatever
 * is written back to the upstream's stdin.
 */

interface FakeStdioSession {
  type: 'stdio';
  written: string[];
  process: { stdin: { write: (s: string) => boolean }; killed: boolean };
}

function makeStdioSession(): FakeStdioSession {
  const written: string[] = [];
  return {
    type: 'stdio',
    written,
    process: { stdin: { write: (s: string) => { written.push(s); return true; } }, killed: false },
  };
}

const reverseMsg = (overrides: Record<string, unknown> = {}) => ({
  jsonrpc: '2.0' as const,
  id: 'rev-1',
  method: 'sampling/createMessage',
  params: { _meta: { session_id: 's1' }, prompt: 'my key is SECRET_IN', ...overrides },
});

/** Invoke the private reverse handler without leaking `any` everywhere. */
type ReverseHandler = {
  handleUpstreamReverseRequest: (server: string, session: unknown, msg: unknown) => Promise<void>;
};
const invoke = (mgr: SessionManager, session: unknown, msg: unknown) =>
  (mgr as never as ReverseHandler).handleUpstreamReverseRequest('srv', session, msg);

/** Redactor that replaces SECRET_* markers; optionally blocks on a scope. */
function makeRedactor(blockOn?: 'request' | 'response') {
  return vi.fn(async (value: unknown, scope: 'request' | 'response') => {
    if (blockOn === scope) return { value, blocked: { ruleName: 'test-block' } };
    const redacted = JSON.parse(
      JSON.stringify(value).replace(/SECRET_[A-Z]+/g, '[REDACTED]'),
    );
    return { value: redacted };
  });
}

describe('Reverse-channel redaction (both legs)', () => {
  it('redacts the request leg before the mux forwards to the client', async () => {
    const mgr = new SessionManager();
    let forwarded: { params?: unknown } | undefined;
    const mux = {
      forwardFromUpstream: vi.fn(async (_srv: string, _sid: string, frame: { params?: unknown }) => {
        forwarded = frame;
        return { jsonrpc: '2.0', id: 'rev-1', result: { text: 'plain output' } };
      }),
    };
    mgr.setReverseChannel(mux as never);
    mgr.setReverseRedactor(makeRedactor());

    const session = makeStdioSession();
    await invoke(mgr, session, reverseMsg());

    // The mux saw redacted params — the raw secret never reached the client.
    expect(JSON.stringify(forwarded?.params)).not.toContain('SECRET_IN');
    expect(JSON.stringify(forwarded?.params)).toContain('[REDACTED]');
  });

  it('redacts the response leg before relaying to the upstream', async () => {
    const mgr = new SessionManager();
    const mux = {
      forwardFromUpstream: vi.fn(async () => ({
        jsonrpc: '2.0', id: 'rev-1', result: { text: 'leaked SECRET_OUT here' },
      })),
    };
    mgr.setReverseChannel(mux as never);
    mgr.setReverseRedactor(makeRedactor());

    const session = makeStdioSession();
    await invoke(mgr, session, reverseMsg());

    const relayed = session.written.join('');
    expect(relayed).not.toContain('SECRET_OUT');
    expect(relayed).toContain('[REDACTED]');
    // The upstream's own request id is preserved on the relayed response.
    expect(JSON.parse(session.written[0])).toMatchObject({ id: 'rev-1' });
  });

  it('refuses the call with -32000 when a block-mode rule matches the request leg', async () => {
    const mgr = new SessionManager();
    const mux = { forwardFromUpstream: vi.fn() };
    mgr.setReverseChannel(mux as never);
    mgr.setReverseRedactor(makeRedactor('request'));

    const session = makeStdioSession();
    await invoke(mgr, session, reverseMsg());

    // Blocked before forwarding — the mux is never called and the upstream
    // gets a JSON-RPC error.
    expect(mux.forwardFromUpstream).not.toHaveBeenCalled();
    const resp = JSON.parse(session.written[0]);
    expect(resp).toMatchObject({ id: 'rev-1', error: { code: -32000 } });
    expect(resp.error.message).toContain('test-block');
  });

  it('refuses the call with -32000 when a block-mode rule matches the response leg', async () => {
    const mgr = new SessionManager();
    const mux = {
      forwardFromUpstream: vi.fn(async () => ({ jsonrpc: '2.0', id: 'rev-1', result: { text: 'x' } })),
    };
    mgr.setReverseChannel(mux as never);
    mgr.setReverseRedactor(makeRedactor('response'));

    const session = makeStdioSession();
    await invoke(mgr, session, reverseMsg());

    const resp = JSON.parse(session.written[0]);
    expect(resp).toMatchObject({ id: 'rev-1', error: { code: -32000 } });
    expect(resp.error.message).toContain('test-block');
  });

  it('passes through unredacted when no redactor is wired (flag off)', async () => {
    const mgr = new SessionManager();
    const mux = {
      forwardFromUpstream: vi.fn(async () => ({ jsonrpc: '2.0', id: 'rev-1', result: { text: 'SECRET_OUT' } })),
    };
    mgr.setReverseChannel(mux as never);
    // No setReverseRedactor — simulates gateway.reverseChannelRedaction = false.

    const session = makeStdioSession();
    await invoke(mgr, session, reverseMsg());

    // Unredacted (pre-v0.10 behaviour) — confirms the flag-off path.
    expect(session.written.join('')).toContain('SECRET_OUT');
  });
});
