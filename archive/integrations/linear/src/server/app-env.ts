import type { Config } from "./config";
import type { SessionStore } from "./session-store";

export type AppEnv = {
  Variables: {
    config: Config;
    store: SessionStore;
    validatedBody: unknown;
    validatedQuery: unknown;
    validatedParam: unknown;
  };
};
