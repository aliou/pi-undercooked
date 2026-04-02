import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type { ToolExecution } from "../types";

interface ToolCallBlockProps {
  tool: ToolExecution;
}

const PREVIEW_LINES = 10;

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // keep raw text
    }
  }
  return text;
}

interface NavResult {
  finalUrl: string;
  title?: string;
  tabId?: number;
}

interface ScreenshotResult {
  data: string;
  format: "jpeg" | "png";
}

function asNavResult(v: unknown): NavResult | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  if (typeof obj.finalUrl !== "string") return null;
  return {
    finalUrl: obj.finalUrl,
    title: typeof obj.title === "string" ? obj.title : undefined,
    tabId: typeof obj.tabId === "number" ? obj.tabId : undefined,
  };
}

function asScreenshotResult(v: unknown): ScreenshotResult | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  if (typeof obj.data !== "string" || !obj.data) return null;
  if (obj.format !== "jpeg" && obj.format !== "png") return null;
  return { data: obj.data, format: obj.format };
}

function NavCard({ nav }: { nav: NavResult }) {
  let hostname = nav.finalUrl;
  try {
    hostname = new URL(nav.finalUrl).hostname;
  } catch {
    // keep raw url
  }
  return (
    <div className="px-2.5 py-2 border-t border-zinc-200 dark:border-zinc-700">
      <div className="mb-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
        Navigation result
      </div>
      <div className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-800">
        {nav.title && (
          <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {nav.title}
          </div>
        )}
        <div className="text-zinc-500 dark:text-zinc-400 truncate">
          {hostname}
        </div>
        <a
          href={nav.finalUrl}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 dark:text-blue-400 truncate block hover:underline"
        >
          {nav.finalUrl}
        </a>
        {nav.tabId !== undefined && (
          <div className="text-zinc-400 dark:text-zinc-500 text-[10px] mt-0.5">
            Tab {nav.tabId}
          </div>
        )}
      </div>
    </div>
  );
}

function ImagePreview({ screenshot }: { screenshot: ScreenshotResult }) {
  const src = `data:image/${screenshot.format};base64,${screenshot.data}`;
  return (
    <div className="px-2.5 py-2 border-t border-zinc-200 dark:border-zinc-700">
      <div className="mb-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
        Screenshot
      </div>
      <img
        src={src}
        alt="Screenshot"
        className="rounded border border-zinc-200 dark:border-zinc-700 max-w-full"
      />
    </div>
  );
}

function ResultBody({
  label,
  text,
  className,
}: {
  label: string;
  text: string;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);

  const parsed = useMemo(() => tryParseJson(text), [text]);

  const nav = useMemo(() => asNavResult(parsed), [parsed]);
  const screenshot = useMemo(() => asScreenshotResult(parsed), [parsed]);

  const display = useMemo(() => {
    return typeof parsed === "string"
      ? parsed
      : JSON.stringify(parsed, null, 2);
  }, [parsed]);

  const lines = useMemo(() => display.split("\n"), [display]);
  const isLong = lines.length > PREVIEW_LINES;
  const visible =
    isLong && !showAll ? lines.slice(0, PREVIEW_LINES).join("\n") : display;

  if (nav) {
    return <NavCard nav={nav} />;
  }

  if (screenshot) {
    return <ImagePreview screenshot={screenshot} />;
  }

  return (
    <div className="px-2.5 py-2 border-t border-zinc-200 dark:border-zinc-700">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
          {label}
        </div>
        {isLong ? (
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            {showAll ? (
              <>
                <CaretUp size={12} />
                Show less
              </>
            ) : (
              <>
                <CaretDown size={12} />
                Show all
              </>
            )}
          </button>
        ) : null}
      </div>
      <pre
        className={`whitespace-pre-wrap break-words font-mono text-[11px] ${className ?? ""}`}
      >
        {visible}
      </pre>
    </div>
  );
}

export function ToolCallBlock({ tool }: ToolCallBlockProps) {
  const statusEl =
    tool.status === "running" ? (
      <span className="text-amber-600">...</span>
    ) : tool.status === "done" ? (
      <span className="text-emerald-600">done</span>
    ) : (
      <span className="text-rose-600">error</span>
    );

  return (
    <details>
      <summary className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 list-none dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">
        {statusEl}
        <span className="font-mono text-xs">{tool.toolName}</span>
        {tool.summary && (
          <span className="ml-auto text-xs text-zinc-500 truncate dark:text-zinc-400">
            {tool.summary}
          </span>
        )}
      </summary>

      <div className="mt-1 rounded-md border border-zinc-200 bg-white text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
        <div className="px-2.5 py-2">
          <div className="text-[11px] font-medium text-zinc-600 mb-1 dark:text-zinc-400">
            Arguments
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px]">
            {JSON.stringify(tool.args, null, 2)}
          </pre>
        </div>

        {tool.status === "running" && tool.partialOutput && (
          <ResultBody label="Output (streaming)" text={tool.partialOutput} />
        )}

        {tool.result && <ResultBody label="Output" text={tool.result} />}

        {tool.error && (
          <ResultBody
            label="Error"
            text={tool.error}
            className="text-rose-600"
          />
        )}
      </div>
    </details>
  );
}
