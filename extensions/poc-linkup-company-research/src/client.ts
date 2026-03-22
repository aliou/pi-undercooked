import packageJson from "../package.json" with { type: "json" };
import type {
  LinkupDepth,
  LinkupErrorResponse,
  LinkupOutputType,
  LinkupSearchResponse,
} from "./types";

const LINKUP_BASE_URL = "https://api.linkup.so/v1";

interface SearchRequest {
  q: string;
  depth: LinkupDepth;
  outputType: LinkupOutputType;
  structuredOutputSchema?: string;
  fromDate?: string;
  toDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeImages?: boolean;
  maxResults?: number;
}

export class LinkupClient {
  constructor(private readonly apiKey: string) {}

  async search(payload: SearchRequest, signal?: AbortSignal) {
    const response = await fetch(`${LINKUP_BASE_URL}/search`, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": `${packageJson.name}/${packageJson.version} (+${packageJson.repository.url})`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const error = (await response.json()) as LinkupErrorResponse;
        message = error.error?.message ?? message;
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message);
    }

    return (await response.json()) as LinkupSearchResponse;
  }
}

export function getClient() {
  const apiKey = process.env.LINKUP_API_KEY;
  if (!apiKey) {
    throw new Error("LINKUP_API_KEY environment variable is not set");
  }
  return new LinkupClient(apiKey);
}

export function parseDomainList(domains?: string) {
  if (!domains) {
    return [];
  }
  return domains
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 50);
}
