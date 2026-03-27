import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";
import type { AppEnv } from "./app-env";

type ValidationTarget = "json" | "query" | "param";

type ValidationOptions<T extends z.ZodType> = {
  /** Where to read data from */
  target: ValidationTarget;
  /** Zod schema to validate against */
  schema: T;
};

/**
 * Hono middleware that validates request data against a Zod schema.
 * On failure, returns a 400 JSON error response with structured details.
 * On success, stores the parsed data in c.set("validatedBody" | "validatedQuery" | "validatedParam").
 */
export function validate<T extends z.ZodType>(
  options: ValidationOptions<T>,
): MiddlewareHandler<AppEnv> {
  return async (c: Context<AppEnv>, next) => {
    const raw = await extractData(c, options.target);
    const result = options.schema.safeParse(raw);

    if (!result.success) {
      const tree = z.treeifyError(result.error);
      return c.json(
        {
          error: "Validation failed",
          details: tree,
        },
        400,
      );
    }

    // Store validated data on the context. Handlers retrieve via c.get().
    switch (options.target) {
      case "json":
        c.set("validatedBody", result.data);
        break;
      case "query":
        c.set("validatedQuery", result.data);
        break;
      case "param":
        c.set("validatedParam", result.data);
        break;
    }

    return next();
  };
}

async function extractData(
  c: Context<AppEnv>,
  target: ValidationTarget,
): Promise<unknown> {
  switch (target) {
    case "json":
      try {
        return await c.req.json();
      } catch {
        return undefined;
      }
    case "query":
      return c.req.query();
    case "param":
      return c.req.param();
  }
}
