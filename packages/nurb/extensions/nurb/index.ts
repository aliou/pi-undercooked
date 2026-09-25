import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  buildArgs,
  checkArgs,
  compareArgs,
  ensureNurbBinary,
  exportArgs,
  inspectArgs,
  newArgs,
  renderArgs,
  runNurb,
  scanArgs,
  verifyArgs,
} from "./nurb";
import { ensureParts, renderTarget, requireParts } from "./project";
import { serveNurb } from "./serve";

const partParam = {
  part: Type.Optional(
    Type.String({
      description: "Part name (parts/<name>.py). Omit for all parts.",
    }),
  ),
};

const sectionParam = {
  section: Type.Optional(
    Type.String({
      description: "Cut plane, e.g. z, z:0.7, z:4mm (z measured from the bed).",
    }),
  ),
};

const formatParam = {
  formats: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Literal("3mf"),
        Type.Literal("stl"),
        Type.Literal("step"),
        Type.Literal("glb"),
      ]),
      {
        description:
          "Formats to write. Default: the project's standing formats.",
      },
    ),
  ),
};

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: {} };
}

export default function (pi: ExtensionAPI) {
  // Project tool: binary check, parts/ guard, run, stdout verbatim.
  // These touch shared project/build state, so they run sequentially.
  async function runChecked(
    cwd: string,
    args: string[],
    signal?: AbortSignal,
  ): Promise<string> {
    await ensureNurbBinary(pi, signal);
    requireParts(cwd);
    return runNurb(pi, args, cwd, signal);
  }

  // Project-free tool: binary check only. nurb's scan, rules and api all
  // work without a parts/ directory (scan and doctrine precede part design),
  // and none of them mutate project state, so they may run in parallel.
  async function runStandalone(
    cwd: string,
    args: string[],
    signal?: AbortSignal,
  ): Promise<string> {
    await ensureNurbBinary(pi, signal);
    return runNurb(pi, args, cwd, signal);
  }

  pi.registerTool({
    name: "nurb_serve",
    label: "nurb dev",
    description:
      "Watch parts and serve the viewer (nurb dev). The server process is handed to @aliou/pi-processes. Returns the URL to share with the user.",
    promptSnippet: "Start the nurb dev viewer server for the current project",
    parameters: Type.Object({}),
    executionMode: "sequential",
    async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
      await ensureNurbBinary(pi, signal);
      ensureParts(ctx.cwd);
      const text = await serveNurb(pi, ctx.cwd, signal);
      return textResult(text);
    },
  });

  pi.registerTool({
    name: "nurb_new",
    label: "nurb new",
    description:
      "Create a part (nurb new): writes parts/<name>.py from the template plus its card parts/<name>.md.",
    promptSnippet: "Create a new nurb part file",
    parameters: Type.Object({
      name: Type.String({
        description: "Part name, e.g. tray or lid_mount.",
        pattern: "^[A-Za-z][A-Za-z0-9_-]*$",
      }),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureNurbBinary(pi, signal);
      const text = await runNurb(pi, newArgs(params.name), ctx.cwd, signal);
      return textResult(text);
    },
  });

  pi.registerTool({
    name: "nurb_build",
    label: "nurb build",
    description:
      "Build parts once (nurb build): bounding boxes and build times.",
    promptSnippet: "Build nurb parts once",
    parameters: Type.Object(partParam),
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const text = await runChecked(ctx.cwd, buildArgs(params.part), signal);
      return textResult(text);
    },
  });

  pi.registerTool({
    name: "nurb_check",
    label: "nurb check",
    description: "Run the printability rules (nurb check).",
    promptSnippet: "Run nurb's printability checks on parts",
    parameters: Type.Object({
      ...partParam,
      strict: Type.Optional(
        Type.Boolean({ description: "Fail the tool on any finding." }),
      ),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const text = await runChecked(
        ctx.cwd,
        checkArgs(params.part, params.strict),
        signal,
      );
      return textResult(text);
    },
  });

  pi.registerTool({
    name: "nurb_inspect",
    label: "nurb inspect",
    description:
      "Measure a built part (nurb inspect): faces, normals, concave edges.",
    promptSnippet: "Measure a built nurb part's faces and edges",
    parameters: Type.Object({
      ...partParam,
      render: Type.Optional(
        Type.Boolean({
          description:
            "Write build/renders/<part>.finding-<n>.png per finding.",
        }),
      ),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const text = await runChecked(
        ctx.cwd,
        inspectArgs(params.part, params.render),
        signal,
      );
      return textResult(text);
    },
  });

  pi.registerTool({
    name: "nurb_export",
    label: "nurb export",
    description: "Write 3MF/STL/STEP/GLB to build/ (nurb export).",
    promptSnippet: "Export nurb parts to 3MF/STL/STEP/GLB",
    parameters: Type.Object({ ...partParam, ...formatParam }),
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const text = await runChecked(
        ctx.cwd,
        exportArgs(params.part, params.formats),
        signal,
      );
      return textResult(text);
    },
  });

  pi.registerTool({
    name: "nurb_render",
    label: "nurb render",
    description:
      "Write a PNG of a part to build/renders/ (nurb render). Returns the absolute PNG path so you can read the image.",
    promptSnippet: "Render a nurb part to a PNG",
    parameters: Type.Object({ ...partParam, ...sectionParam }),
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const stdout = await runChecked(
        ctx.cwd,
        renderArgs(params.part, params.section),
        signal,
      );
      const target = renderTarget(ctx.cwd, params.part);
      return textResult(`${stdout.trimEnd()}\nRender path: ${target}`);
    },
  });

  pi.registerTool({
    name: "nurb_scan",
    label: "nurb scan",
    description:
      "Measure a mesh in mm (nurb scan), a phone scan or a downloaded model. Takes a file, not a part name.",
    promptSnippet: "Measure a mesh file (STL/OBJ/GLB/PLY) in mm",
    parameters: Type.Object({
      file: Type.String({
        description: "Mesh file: STL, OBJ, GLB or triangulated PLY.",
      }),
      ...sectionParam,
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const text = await runStandalone(
        ctx.cwd,
        scanArgs(params.file, params.section),
        signal,
      );
      return textResult(text);
    },
  });

  pi.registerTool({
    name: "nurb_compare",
    label: "nurb compare",
    description:
      "Deviation from the part's target mesh, in both directions (nurb compare).",
    promptSnippet: "Compare a nurb part against its target mesh",
    parameters: Type.Object({
      ...partParam,
      against: Type.Optional(
        Type.String({
          description:
            "Mesh file to compare against instead of the card's declared target.",
        }),
      ),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const text = await runChecked(
        ctx.cwd,
        compareArgs(params.part, params.against),
        signal,
      );
      return textResult(text);
    },
  });

  pi.registerTool({
    name: "nurb_verify",
    label: "nurb verify",
    description: "Run the doctrine's verification list (nurb verify).",
    promptSnippet: "Run nurb's verification list on parts",
    parameters: Type.Object({
      ...partParam,
      report: Type.Optional(
        Type.Boolean({
          description: "Write build/renders/<part>.verify.md with renders.",
        }),
      ),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const text = await runChecked(
        ctx.cwd,
        verifyArgs(params.part, params.report),
        signal,
      );
      return textResult(text);
    },
  });

  pi.registerTool({
    name: "nurb_rules",
    label: "nurb rules",
    description:
      "Print the nurb design doctrine. Read it before designing a part.",
    promptSnippet: "Print the nurb design doctrine",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
      const text = await runStandalone(ctx.cwd, ["rules"], signal);
      return textResult(text);
    },
  });

  pi.registerTool({
    name: "nurb_api",
    label: "nurb api",
    description: "The vocabulary a part file gets, with signatures (nurb api).",
    promptSnippet: "Print the nurb part-file API vocabulary",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
      const text = await runStandalone(ctx.cwd, ["api"], signal);
      return textResult(text);
    },
  });
}
