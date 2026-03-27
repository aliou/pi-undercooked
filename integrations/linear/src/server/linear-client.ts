import type { Config } from "./config";
import type { AgentActivityCreateInput } from "./types";

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
};

type ActivityCreateResponse = {
  agentActivityCreate: {
    success: boolean;
    agentActivity: { id: string } | null;
  };
};

type SessionUpdateResponse = {
  agentSessionUpdate: {
    success: boolean;
  };
};

export type IssueProjectContext = {
  name: string;
  description?: string;
  resources: Array<{ label: string; url: string }>;
};

type IssueProjectContextResponse = {
  issue: {
    project: {
      name: string;
      description?: string | null;
      externalLinks: {
        nodes: Array<{ label?: string | null; url: string }>;
      };
      documents: {
        nodes: Array<{ title: string; slugId: string }>;
      };
    } | null;
  } | null;
};

export class LinearClient {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Create an agent activity in Linear.
   * Returns the remote activity ID on success, null on failure.
   */
  async createActivity(
    accessToken: string,
    input: AgentActivityCreateInput,
  ): Promise<string | null> {
    const query = `
      mutation AgentActivityCreate($input: AgentActivityCreateInput!) {
        agentActivityCreate(input: $input) {
          success
          agentActivity { id }
        }
      }
    `;

    const result = await this.graphqlWithRetry<ActivityCreateResponse>(
      accessToken,
      query,
      { input },
    );

    if (!result?.data?.agentActivityCreate?.success) {
      console.error(
        "Failed to create activity:",
        result?.errors ?? "unknown error",
      );
      return null;
    }

    return result.data.agentActivityCreate.agentActivity?.id ?? null;
  }

  /**
   * Update session external URLs (for dashboard deep-linking).
   */
  async updateSessionUrls(
    accessToken: string,
    sessionId: string,
    urls: Array<{ label: string; url: string }>,
  ): Promise<boolean> {
    const query = `
      mutation AgentSessionUpdate($id: String!, $input: AgentSessionUpdateInput!) {
        agentSessionUpdate(id: $id, input: $input) {
          success
        }
      }
    `;

    const result = await this.graphqlWithRetry<SessionUpdateResponse>(
      accessToken,
      query,
      { id: sessionId, input: { externalUrls: urls } },
    );

    return result?.data?.agentSessionUpdate?.success ?? false;
  }

  async fetchIssueProjectContext(
    accessToken: string,
    issueId: string,
  ): Promise<IssueProjectContext | null> {
    const query = `
      query IssueProjectContext($issueId: String!) {
        issue(id: $issueId) {
          project {
            name
            description
            externalLinks {
              nodes {
                label
                url
              }
            }
            documents {
              nodes {
                title
                slugId
              }
            }
          }
        }
      }
    `;

    const result = await this.graphqlWithRetry<IssueProjectContextResponse>(
      accessToken,
      query,
      { issueId },
    );

    const project = result?.data?.issue?.project;
    if (!project) {
      return null;
    }

    const resources = [
      ...project.externalLinks.nodes.map((link) => ({
        label: link.label?.trim() || link.url,
        url: link.url,
      })),
      ...project.documents.nodes.map((document) => ({
        label: document.title,
        url: `https://linear.app/document/${document.slugId}`,
      })),
    ];

    return {
      name: project.name,
      description: project.description ?? undefined,
      resources,
    };
  }

  /**
   * Execute a GraphQL request with exponential backoff + jitter.
   */
  private async graphqlWithRetry<T>(
    accessToken: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<GraphQLResponse<T> | null> {
    const maxRetries = this.config.GRAPHQL_MAX_RETRIES ?? 5;
    const baseDelayMs = this.config.GRAPHQL_BASE_DELAY_MS ?? 250;
    const maxDelayMs = this.config.GRAPHQL_MAX_DELAY_MS ?? 5_000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query, variables }),
        });

        if (response.ok) {
          return (await response.json()) as GraphQLResponse<T>;
        }

        // Non-retryable client errors
        if (response.status >= 400 && response.status < 500) {
          const body = await response.text();
          console.error(
            `Linear GraphQL ${response.status} (non-retryable):`,
            body,
          );
          return null;
        }

        // Server error: retry
        console.warn(
          `Linear GraphQL ${response.status}, retrying (attempt ${attempt + 1}/${maxRetries})`,
        );
      } catch (err) {
        console.warn(
          `Linear GraphQL network error, retrying (attempt ${attempt + 1}/${maxRetries}):`,
          err,
        );
      }

      // Exponential backoff with jitter
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jitter = Math.random() * 100;
      await sleep(delay + jitter);
    }

    console.error(`Linear GraphQL exhausted ${maxRetries} retries`);
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
