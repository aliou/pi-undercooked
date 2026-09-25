import { LinearClient } from "@linear/sdk";

const clients = new Map<string, LinearClient>();

export interface LinearClientConfiguration {
  activeWorkspace?: string;
  apiKey?: string;
}

let getConfiguration: (
  workspace?: string,
) => LinearClientConfiguration | undefined = () => ({
  apiKey: process.env.LINEAR_API_KEY,
});

export function configureLinearClient(
  resolver: (workspace?: string) => LinearClientConfiguration | undefined,
): void {
  getConfiguration = resolver;
  clearClients();
}

function getClientKey(workspace?: string): string {
  const resolvedWorkspace = workspace ?? getConfiguration()?.activeWorkspace;
  return resolvedWorkspace ? `workspace:${resolvedWorkspace}` : "env";
}

function resolveApiKey(workspace?: string): string | undefined {
  return getConfiguration(workspace)?.apiKey;
}

export function getLinearClient(workspace?: string): LinearClient | null {
  const clientKey = getClientKey(workspace);
  const existing = clients.get(clientKey);
  if (existing) return existing;

  const apiKey = resolveApiKey(workspace);
  if (!apiKey) return null;

  const client = new LinearClient({ apiKey });
  clients.set(clientKey, client);
  return client;
}

export function clearClients(): void {
  clients.clear();
}
