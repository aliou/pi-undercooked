#!/usr/bin/env node
/**
 * CLI entry point for pi-evals
 */
import { loadConfig } from "./config";
import { printJson, printResults } from "./reporter";
import { runEvals } from "./runner";
import type { CliOptions } from "./types";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Load config
  const config = await loadConfig(options.config);

  if (!options.json) {
    console.log(`Running evals from ${config.evalsDir}...`);
  }

  // Run evals
  const summary = await runEvals(config, options);

  // Output results
  if (options.json) {
    printJson(summary);
  } else {
    printResults(summary);
  }

  // Check threshold
  if (options.threshold !== undefined) {
    const passRate =
      summary.total > 0 ? (summary.passed / summary.total) * 100 : 0;
    if (passRate < options.threshold) {
      console.log(
        `\nFailed: pass rate ${passRate.toFixed(0)}% < threshold ${options.threshold}%`,
      );
      process.exit(1);
    }
  }

  // Exit with error if any tests failed
  if (summary.failed > 0) {
    process.exit(1);
  }
}

interface ParsedOptions extends CliOptions {
  help?: boolean;
  model?: string;
  provider?: string;
}

function parseArgs(args: string[]): ParsedOptions {
  const options: ParsedOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--filter" || arg === "-f") {
      options.filter = args[++i];
    } else if (arg.startsWith("--filter=")) {
      options.filter = arg.split("=")[1];
    } else if (arg === "--threshold" || arg === "-t") {
      options.threshold = parseInt(args[++i], 10);
    } else if (arg.startsWith("--threshold=")) {
      options.threshold = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--config" || arg === "-c") {
      options.config = args[++i];
    } else if (arg.startsWith("--config=")) {
      options.config = arg.split("=")[1];
    } else if (arg === "--model" || arg === "-m") {
      options.model = args[++i];
    } else if (arg.startsWith("--model=")) {
      options.model = arg.split("=")[1];
    } else if (arg === "--provider" || arg === "-p") {
      options.provider = args[++i];
    } else if (arg.startsWith("--provider=")) {
      options.provider = arg.split("=")[1];
    }
  }

  // Environment variable overrides (lower priority than CLI args)
  options.model = options.model ?? process.env.PI_EVAL_MODEL;
  options.provider = options.provider ?? process.env.PI_EVAL_PROVIDER;

  return options;
}

function printHelp(): void {
  console.log(`
pi-evals - Eval framework for pi coding agent

Usage:
  pi-evals [options]

Options:
  -h, --help              Show this help message
  -f, --filter <pattern>  Filter evals by name substring
  -t, --threshold <pct>   Minimum pass percentage to exit 0
  -c, --config <path>     Config file path (default: pi-evals.config.ts)
  -m, --model <model>     Override model (also: PI_EVAL_MODEL env var)
  -p, --provider <name>   Override provider (also: PI_EVAL_PROVIDER env var)
  -v, --verbose           Show detailed output during run
  --json                  Output results as JSON

Examples:
  pi-evals                                      # Run all evals
  pi-evals --filter "file-creation"             # Run matching evals
  pi-evals --threshold 80                       # Fail if < 80% pass
  pi-evals --json > results.json                # JSON output for CI
  pi-evals -p github-models -m gpt-4o           # Use GitHub Models
  PI_EVAL_PROVIDER=github-models PI_EVAL_MODEL=gpt-4o pi-evals  # Via env vars
`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
