import "varlock/auto-load";

export type Config = {
  LINEAR_CLIENT_ID: string;
  LINEAR_CLIENT_SECRET: string;
  LINEAR_WEBHOOK_SECRET: string;
  BASE_URL: string | undefined;
  PORT: number;
  HOST: string;
  STOP_WAIT_TIMEOUT_MS: number;
  GRAPHQL_MAX_RETRIES: number;
  GRAPHQL_BASE_DELAY_MS: number;
  GRAPHQL_MAX_DELAY_MS: number;
  DB_PATH: string;
  API_TOKEN: string | undefined;
};

const defaults = {
  PORT: 3000,
  HOST: "0.0.0.0",
  STOP_WAIT_TIMEOUT_MS: 15_000,
  GRAPHQL_MAX_RETRIES: 5,
  GRAPHQL_BASE_DELAY_MS: 250,
  GRAPHQL_MAX_DELAY_MS: 5_000,
  DB_PATH: "data/linear-bridge.db",
} as const;

/**
 * Load configuration from environment variables.
 * Varlock handles .env file loading via the auto-load import.
 */
export function loadConfig(): Config {
  return {
    LINEAR_CLIENT_ID: process.env.LINEAR_CLIENT_ID as string,
    LINEAR_CLIENT_SECRET: process.env.LINEAR_CLIENT_SECRET as string,
    LINEAR_WEBHOOK_SECRET: process.env.LINEAR_WEBHOOK_SECRET as string,
    BASE_URL: process.env.BASE_URL || undefined,
    PORT: Number(process.env.PORT || defaults.PORT),
    HOST: process.env.HOST || defaults.HOST,
    STOP_WAIT_TIMEOUT_MS: Number(
      process.env.STOP_WAIT_TIMEOUT_MS || defaults.STOP_WAIT_TIMEOUT_MS,
    ),
    GRAPHQL_MAX_RETRIES: Number(
      process.env.GRAPHQL_MAX_RETRIES || defaults.GRAPHQL_MAX_RETRIES,
    ),
    GRAPHQL_BASE_DELAY_MS: Number(
      process.env.GRAPHQL_BASE_DELAY_MS || defaults.GRAPHQL_BASE_DELAY_MS,
    ),
    GRAPHQL_MAX_DELAY_MS: Number(
      process.env.GRAPHQL_MAX_DELAY_MS || defaults.GRAPHQL_MAX_DELAY_MS,
    ),
    DB_PATH: process.env.DB_PATH || defaults.DB_PATH,
    API_TOKEN: process.env.API_TOKEN || undefined,
  };
}
