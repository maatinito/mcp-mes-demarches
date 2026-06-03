import type { Config } from './config.js';

// Client GraphQL minimal authentifié par token Bearer. `fetchImpl` injectable pour les tests.
export async function gqlRequest<T = unknown>(
  config: Config,
  query: string,
  variables: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  const res = await fetchImpl(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`
    },
    body: JSON.stringify({ query, variables })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Erreur HTTP ${res.status} de l'API mes-demarches : ${body}`);
  }

  const payload = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join('; '));
  }
  return payload.data as T;
}
