import { describe, it, expect, vi } from 'vitest';
import { gqlRequest } from './graphql.js';

describe('gqlRequest', () => {
  const cfg = { url: 'https://md.test/api/v2/graphql', token: 'tok' };

  it('envoie la requête avec le header Bearer et retourne data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ping: 'pong' } })
    });
    const data = await gqlRequest(cfg, 'query { ping }', { a: 1 }, fetchMock as unknown as typeof fetch);
    expect(data).toEqual({ ping: 'pong' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(cfg.url);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ query: 'query { ping }', variables: { a: 1 } });
  });

  it('lève une erreur si la réponse GraphQL contient des errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: 'boom' }] })
    });
    await expect(gqlRequest(cfg, 'query { x }', {}, fetchMock as unknown as typeof fetch))
      .rejects.toThrow('boom');
  });

  it('lève une erreur explicite sur redirection (3xx) au lieu de la suivre', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 301,
      headers: { get: (h: string) => (h === 'location' ? 'https://www.md.test/api/v2/graphql' : null) }
    });
    await expect(gqlRequest(cfg, 'q', {}, fetchMock as unknown as typeof fetch))
      .rejects.toThrow(/Redirection HTTP 301.*www\.md\.test/);
    expect((fetchMock.mock.calls[0][1] as { redirect?: string }).redirect).toBe('manual');
  });

  it('lève une erreur sur statut HTTP non ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
    await expect(gqlRequest(cfg, 'q', {}, fetchMock as unknown as typeof fetch))
      .rejects.toThrow(/401/);
  });
});
