import { describe, it, expect } from 'vitest';
import { operationToTool } from '../../../../src/adapters/openapi/operation-to-tool.js';

describe('operationToTool', () => {
  it('skips operations without operationId', () => {
    expect(operationToTool('/pet', 'get', {})).toBeNull();
  });

  it('builds inputSchema from path + query params', () => {
    const t = operationToTool('/pet/{id}', 'get', {
      operationId: 'getPetById',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        { name: 'detail', in: 'query', schema: { type: 'boolean' } },
      ],
    });
    expect(t?.originalName).toBe('getPetById');
    expect(t?.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        id: expect.objectContaining({ type: 'integer' }),
        detail: expect.objectContaining({ type: 'boolean' }),
      },
      required: ['id'],
    });
    expect(t?.meta.paramLocations).toEqual({ id: 'path', detail: 'query' });
  });

  it('includes body when requestBody.content.application/json present', () => {
    const t = operationToTool('/pet', 'post', {
      operationId: 'addPet',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } },
    });
    expect(t?.meta.hasJsonBody).toBe(true);
    expect((t?.inputSchema.properties as Record<string, unknown>).body).toBeDefined();
    expect(t?.inputSchema.required).toContain('body');
  });
});
