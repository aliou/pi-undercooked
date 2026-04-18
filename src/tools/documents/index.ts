import { StringEnum } from "@mariozechner/pi-ai";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { getLinearClient, LINEAR_CREDENTIALS_ERROR } from "../../client";
import { createDocument } from "./actions/create";
import { deleteDocument } from "./actions/delete";
import { listDocuments } from "./actions/list";
import { showDocument } from "./actions/show";
import { updateDocument } from "./actions/update";
import type { SerializedLinearDocument } from "./types";

const DocumentsParams = Type.Object({
  action: StringEnum(["list", "show", "create", "update", "delete"], {
    description: "Document action to perform.",
  }),
  id: Type.Optional(Type.String({ description: "Document ID." })),
  issueId: Type.Optional(
    Type.String({ description: "Issue ID for scoping or linking." }),
  ),
  projectId: Type.Optional(
    Type.String({ description: "Project ID for scoping or linking." }),
  ),
  title: Type.Optional(Type.String({ description: "Document title." })),
  content: Type.Optional(
    Type.String({ description: "Document markdown content." }),
  ),
  limit: Type.Optional(
    Type.Number({ description: "Maximum documents to return." }),
  ),
});

type DocumentsParamsType = { action: string; [key: string]: unknown };

interface DocumentsDetails {
  action: string;
  document?: SerializedLinearDocument;
  documents?: SerializedLinearDocument[];
  deleted?: boolean;
  error?: string;
}

export function registerDocumentsTool(pi: ExtensionAPI) {
  pi.registerTool<typeof DocumentsParams, DocumentsDetails>({
    name: "linear_documents",
    label: "Linear: Documents",
    description: "Manage Linear documents.",
    promptSnippet:
      "Use linear_documents to list, show, create, update, or delete Linear documents. Documents can be scoped to a project or issue.",
    promptGuidelines: [
      "Supply projectId or issueId to linear_documents to scope list/create.",
      "Supply id for linear_documents show/update/delete.",
    ],
    parameters: DocumentsParams,
    async execute(
      _toolCallId: string,
      params: DocumentsParamsType,
      _signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<DocumentsDetails> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<DocumentsDetails>> {
      const client = getLinearClient();
      if (!client) {
        return {
          content: [{ type: "text", text: LINEAR_CREDENTIALS_ERROR }],
          details: { action: params.action, error: LINEAR_CREDENTIALS_ERROR },
        };
      }

      onUpdate?.({
        content: [
          { type: "text", text: `Running documents.${params.action}...` },
        ],
        details: { action: params.action },
      });

      let details: DocumentsDetails;
      let text = "";
      switch (params.action) {
        case "list": {
          const result = await listDocuments(client, {
            limit: typeof params.limit === "number" ? params.limit : undefined,
            issueId:
              typeof params.issueId === "string" ? params.issueId : undefined,
            projectId:
              typeof params.projectId === "string"
                ? params.projectId
                : undefined,
          });
          details = result.error
            ? { action: params.action, error: result.error }
            : { action: params.action, documents: result.documents };
          text = result.documents
            ? `Listed ${result.documents.length} documents.\n${result.documents.map((document) => `- ${document.title} | ${document.url}`).join("\n")}`
            : "";
          break;
        }
        case "show": {
          const result = await showDocument(client, {
            id: typeof params.id === "string" ? params.id : undefined,
          });
          details = result.error
            ? { action: params.action, error: result.error }
            : { action: params.action, document: result.document };
          if (result.document) {
            text = [
              `Document ${result.document.title}`,
              `URL: ${result.document.url}`,
              result.document.content ?? "",
            ]
              .filter(Boolean)
              .join("\n\n");
          }
          break;
        }
        case "create": {
          const result = await createDocument(client, {
            title: typeof params.title === "string" ? params.title : undefined,
            content:
              typeof params.content === "string" ? params.content : undefined,
            issueId:
              typeof params.issueId === "string" ? params.issueId : undefined,
            projectId:
              typeof params.projectId === "string"
                ? params.projectId
                : undefined,
          });
          details = result.error
            ? { action: params.action, error: result.error }
            : { action: params.action, document: result.document };
          if (result.document) {
            text = JSON.stringify(
              {
                id: result.document.id,
                title: result.document.title,
                url: result.document.url,
                issueId: result.document.issueId,
                projectId: result.document.projectId,
                content: result.document.content,
              },
              null,
              2,
            );
          }
          break;
        }
        case "update": {
          const result = await updateDocument(client, {
            id: typeof params.id === "string" ? params.id : undefined,
            title: typeof params.title === "string" ? params.title : undefined,
            content:
              typeof params.content === "string" ? params.content : undefined,
            issueId:
              typeof params.issueId === "string" ? params.issueId : undefined,
            projectId:
              typeof params.projectId === "string"
                ? params.projectId
                : undefined,
          });
          details = result.error
            ? { action: params.action, error: result.error }
            : { action: params.action, document: result.document };
          if (result.document) {
            text = JSON.stringify(
              {
                id: result.document.id,
                title: result.document.title,
                url: result.document.url,
                issueId: result.document.issueId,
                projectId: result.document.projectId,
                content: result.document.content,
              },
              null,
              2,
            );
          }
          break;
        }
        case "delete": {
          const result = await deleteDocument(client, {
            id: typeof params.id === "string" ? params.id : undefined,
          });
          details = result.error
            ? { action: params.action, error: result.error }
            : { action: params.action, deleted: result.deleted };
          if (result.deleted)
            text = `Deleted document ${String(params.id ?? "")}.`;
          break;
        }
        default:
          details = {
            action: params.action,
            error: `Unknown action: ${params.action}`,
          };
      }

      if (details.error) {
        return {
          content: [{ type: "text", text: `Error: ${details.error}` }],
          details,
        };
      }

      return { content: [{ type: "text", text: text || "Done." }], details };
    },
    renderCall(args: DocumentsParamsType, theme: Theme) {
      return new Text(
        `${theme.fg("accent", "Linear Documents")} ${String(args.action ?? "")}`,
        0,
        0,
      );
    },
    renderResult(result) {
      const text = result.content[0];
      return new Text(
        text?.type === "text" && text.text ? text.text : "Done.",
        0,
        0,
      );
    },
  });
}
