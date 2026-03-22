import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { listSchemes, listTargets, resolveXcodeLocation } from "../utils/xcode";

const schema = Type.Object({
  action: Type.Union(
    [
      Type.Literal("inspect"),
      Type.Literal("list_schemes"),
      Type.Literal("list_targets"),
      Type.Literal("resolve_uitest_scheme"),
      Type.Literal("doctor"),
    ],
    { description: "Project action to run" },
  ),
  projectPath: Type.Optional(
    Type.String({ description: "Path to .xcodeproj" }),
  ),
  workspacePath: Type.Optional(
    Type.String({ description: "Path to .xcworkspace" }),
  ),
  scheme: Type.Optional(Type.String({ description: "Scheme name" })),
});

type Params = Static<typeof schema>;

export const xcodeProjectTool: ToolDefinition = {
  name: "xcode_project",
  label: "Xcode Project",
  description:
    "Inspect project/workspace metadata and resolve schemes/targets.",
  promptSnippet:
    "Inspect an Xcode project or workspace and list schemes or targets.",
  promptGuidelines: [
    "Use this tool first to inspect the project or workspace when build configuration is unclear.",
    "Prefer listing schemes before building or testing if the user did not specify one clearly.",
    "Use this tool to resolve project metadata instead of guessing paths, schemes, or targets.",
  ],
  parameters: schema,
  async execute(_toolCallId, rawParams, signal, _onUpdate, ctx) {
    const params = rawParams as Params;

    const location = await resolveXcodeLocation(
      {
        projectPath: params.projectPath,
        workspacePath: params.workspacePath,
        scheme: params.scheme,
      },
      ctx.cwd,
      signal,
    );

    if (params.action === "list_schemes") {
      const schemes = await listSchemes(location, signal);
      const text =
        schemes.length > 0
          ? schemes.map((s) => `- ${s}`).join("\n")
          : "No schemes found.";
      return {
        content: [{ type: "text", text: `Schemes:\n${text}` }],
        details: { summary: `Found ${schemes.length} scheme(s)` },
      };
    }

    if (params.action === "list_targets") {
      const targets = await listTargets(location, signal);
      const text =
        targets.length > 0
          ? targets.map((t) => `- ${t}`).join("\n")
          : "No targets found.";
      return {
        content: [{ type: "text", text: `Targets:\n${text}` }],
        details: { summary: `Found ${targets.length} target(s)` },
      };
    }

    if (params.action === "resolve_uitest_scheme") {
      const schemes = await listSchemes(location, signal);
      const uiTest = schemes.find((s) => /ui\s*tests?/i.test(s));
      if (!uiTest) {
        throw new Error(
          "No UITest scheme detected. Expected scheme name including 'UITests'.",
        );
      }
      return {
        content: [{ type: "text", text: `Resolved UITest scheme: ${uiTest}` }],
        details: { summary: `Resolved UITest scheme ${uiTest}` },
      };
    }

    if (params.action === "doctor") {
      const schemes = await listSchemes(location, signal);
      const targets = await listTargets(location, signal);
      const issues: string[] = [];

      if (schemes.length === 0) issues.push("No schemes found.");
      if (targets.length === 0) issues.push("No targets found.");
      if (!schemes.some((s) => /ui\s*tests?/i.test(s)))
        issues.push("No UITest scheme detected.");

      const status =
        issues.length === 0
          ? "Project doctor: OK"
          : `Project doctor found ${issues.length} issue(s).`;
      const issueLines =
        issues.length === 0 ? "- none" : issues.map((i) => `- ${i}`).join("\n");
      return {
        content: [{ type: "text", text: `${status}\n${issueLines}` }],
        details: { summary: status },
      };
    }

    const schemes = await listSchemes(location, signal);
    const targets = await listTargets(location, signal);

    return {
      content: [
        {
          type: "text",
          text: `Project summary\n- schemes: ${schemes.length}\n- targets: ${targets.length}`,
        },
      ],
      details: {
        summary: `Project OK • ${schemes.length} schemes • ${targets.length} targets`,
      },
    };
  },
};
