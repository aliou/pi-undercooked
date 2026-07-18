import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { getLinearClient } from "../../../src/client";
import { serializeIssue } from "../../../src/tools/issues/serialize";
import type { SerializedIssue } from "../../../src/tools/issues/types";
import {
  configLoader,
  LINEAR_CREDENTIALS_ERROR,
  type StartDecisionMode,
} from "../config";

export interface IssueStartParams {
  id: string;
  updateState?: boolean;
  createBranch?: boolean;
  allowDirty?: boolean;
}

export interface IssueStartDetails {
  issue?: SerializedIssue;
  branchName?: string;
  branchCreated?: boolean;
  stateUpdated?: boolean;
  currentBranch?: string;
  defaultBranch?: string;
  warnings?: string[];
  needsDecision?: boolean;
  decisionReason?: string;
  gitStatus?: string;
  error?: string;
}

async function runGit(
  pi: ExtensionAPI,
  args: string[],
  signal: AbortSignal | undefined,
): Promise<{ ok: boolean; output?: string; error?: string }> {
  const result = await pi.exec("git", args, { signal });
  if (result.code === 0) return { ok: true, output: result.stdout.trim() };
  const stderr = result.stderr?.trim();
  const stdout = result.stdout?.trim();
  return {
    ok: false,
    error: stderr || stdout || `git ${args.join(" ")} failed (${result.code})`,
  };
}

async function resolveDecision(
  ctx: ExtensionContext,
  mode: StartDecisionMode,
  override: boolean | undefined,
  promptTitle: string,
  promptBody: string,
): Promise<boolean | undefined> {
  if (typeof override === "boolean") return override;
  if (mode === "true") return true;
  if (mode === "false") return false;
  if (!ctx.hasUI) return undefined;
  return await ctx.ui.confirm(promptTitle, promptBody);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function fallbackBranchName(issue: SerializedIssue): string {
  return `${issue.identifier.toLowerCase()}-${slugify(issue.title)}`;
}

async function getDefaultBranch(
  pi: ExtensionAPI,
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  const remoteHead = await runGit(
    pi,
    ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    signal,
  );
  if (remoteHead.ok && remoteHead.output?.startsWith("origin/")) {
    return remoteHead.output.slice("origin/".length);
  }

  const hasMain = await runGit(
    pi,
    ["show-ref", "--verify", "--quiet", "refs/heads/main"],
    signal,
  );
  if (hasMain.ok) return "main";

  const hasMaster = await runGit(
    pi,
    ["show-ref", "--verify", "--quiet", "refs/heads/master"],
    signal,
  );
  if (hasMaster.ok) return "master";

  return undefined;
}

async function resolveInProgressStateId(
  issue: SerializedIssue,
  teamId: string | undefined,
  getTeamStates: () => Promise<Array<{ id: string; name: string }>>,
): Promise<{ stateId?: string; error?: string }> {
  if (!teamId) return { error: "Issue team is missing." };

  const states = await getTeamStates();
  const byName = states.find(
    (state) => state.name.toLowerCase() === "in progress",
  );
  if (byName) return { stateId: byName.id };

  const started = states.find(
    (state) => state.name.toLowerCase() === "started",
  );
  if (started) return { stateId: started.id };

  return {
    error: `Could not find a started state for team ${issue.team}. Tried 'In Progress' and 'Started'.`,
  };
}

export async function runIssueStart(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  params: IssueStartParams,
  signal: AbortSignal | undefined,
): Promise<{ text: string; details: IssueStartDetails }> {
  const client = getLinearClient();
  if (!client) {
    return {
      text: LINEAR_CREDENTIALS_ERROR,
      details: { error: LINEAR_CREDENTIALS_ERROR },
    };
  }

  const config = configLoader.getConfig();
  const updateState = await resolveDecision(
    ctx,
    config.startUpdateState,
    params.updateState,
    "Issue start: update state",
    `Move ${params.id} to In Progress?`,
  );
  const createBranch = await resolveDecision(
    ctx,
    config.startCreateBranch,
    params.createBranch,
    "Issue start: create branch",
    `Create local branch for ${params.id}?`,
  );

  if (updateState === undefined || createBranch === undefined) {
    return {
      text: "Decision required. Set updateState/createBranch explicitly, or run in interactive mode to answer prompts.",
      details: {
        needsDecision: true,
        decisionReason:
          "Default is ask for one or more decisions (updateState/createBranch).",
      },
    };
  }

  const issueEntity = await client.issue(params.id);
  const issue = await serializeIssue(issueEntity);
  const warnings: string[] = [];

  const insideRepo = await runGit(
    pi,
    ["rev-parse", "--is-inside-work-tree"],
    signal,
  );
  const shouldCheckGit = createBranch || insideRepo.ok;
  let currentBranch: string | undefined;
  let defaultBranch: string | undefined;
  const branchName = issue.branchName ?? fallbackBranchName(issue);

  if (shouldCheckGit && insideRepo.ok) {
    const dirty = await runGit(pi, ["status", "--porcelain"], signal);
    if ((dirty.output ?? "").trim().length > 0 && !params.allowDirty) {
      if (!ctx.hasUI) {
        return {
          text: "Git working tree is dirty. Re-run with allowDirty=true, or run in interactive mode to confirm.",
          details: {
            issue,
            branchName,
            needsDecision: true,
            decisionReason:
              "Dirty git status; explicit user confirmation required.",
            gitStatus: dirty.output,
          },
        };
      }

      const proceed = await ctx.ui.confirm(
        "Dirty git status",
        "Working tree has uncommitted changes. Continue anyway?",
      );
      if (!proceed) {
        return {
          text: "Canceled by user.",
          details: {
            issue,
            branchName,
            needsDecision: true,
            decisionReason: "User canceled due to dirty git status.",
            gitStatus: dirty.output,
          },
        };
      }
    }

    currentBranch = (
      await runGit(pi, ["rev-parse", "--abbrev-ref", "HEAD"], signal)
    ).output;
    defaultBranch = await getDefaultBranch(pi, signal);
    if (currentBranch && defaultBranch && currentBranch !== defaultBranch) {
      warnings.push(
        `Current branch is ${currentBranch}, not default ${defaultBranch}. Branch will still be created from current HEAD.`,
      );
    }

    if (createBranch) {
      const created = await runGit(pi, ["switch", "-c", branchName], signal);
      if (!created.ok) {
        return {
          text: `Failed to create branch ${branchName}: ${created.error}`,
          details: {
            issue,
            branchName,
            currentBranch,
            defaultBranch,
            warnings,
            error: created.error,
          },
        };
      }
      currentBranch = branchName;
    }
  } else if (createBranch) {
    return {
      text: "Not in a git repository. Cannot create branch.",
      details: {
        issue,
        branchName,
        error: "Not in a git repository.",
      },
    };
  }

  let stateUpdated = false;
  if (updateState) {
    const currentState = await issueEntity.state;
    const currentStateName = currentState?.name?.toLowerCase();
    if (currentStateName !== "in progress" && currentStateName !== "started") {
      const team = await issueEntity.team;
      const resolved = await resolveInProgressStateId(
        issue,
        team?.id,
        async () => {
          if (!team) return [];
          const states = await team.states();
          return states.nodes.map((state) => ({
            id: state.id,
            name: state.name,
          }));
        },
      );

      if (resolved.error) {
        warnings.push(resolved.error);
      } else if (resolved.stateId) {
        await client.updateIssue(issue.id, { stateId: resolved.stateId });
        stateUpdated = true;
      }
    }
  }

  const summary = [
    `Started from ${issue.identifier}: ${issue.title}`,
    `Branch: ${branchName}${createBranch ? " (created)" : " (not created)"}`,
    `State updated: ${stateUpdated ? "yes" : "no"}`,
  ];
  if (warnings.length > 0) summary.push(`Warnings: ${warnings.join(" | ")}`);

  return {
    text: summary.join("\n"),
    details: {
      issue,
      branchName,
      branchCreated: createBranch,
      stateUpdated,
      currentBranch,
      defaultBranch,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
  };
}
