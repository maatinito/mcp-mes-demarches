export interface Config {
  url: string;
  token: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const url = env.MD_GRAPHQL_URL;
  const token = env.MD_API_TOKEN;
  if (!url) throw new Error('MD_GRAPHQL_URL manquant (URL de l\'endpoint GraphQL v2).');
  if (!token) throw new Error('MD_API_TOKEN manquant (token API administrateur).');
  return { url, token };
}
