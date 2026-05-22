# MCP Spec Compliance Harness

Tests that the gateway's JSON-RPC surface conforms to the MCP protocol spec.

Each `*.test.ts` file targets one MCP method (or method family) and asserts:
- Response envelope shape (`jsonrpc: "2.0"`, `id`, `result` or `error`)
- Required fields per the spec
- Error codes match MCP-defined values
- Method-specific invariants (e.g. `tools/list.tools[].inputSchema` is a JSON Schema)

The harness uses an in-memory storage adapter + mock upstream MCP servers
seeded with known shapes. It does NOT require Docker, Postgres, or
@modelcontextprotocol/inspector binary — those would be a separate harness.

References:
- MCP protocol spec: https://spec.modelcontextprotocol.io
- JSON-RPC 2.0: https://www.jsonrpc.org/specification
