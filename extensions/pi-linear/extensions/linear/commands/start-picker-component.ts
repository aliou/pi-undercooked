import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { SerializedIssue } from "../../../src/tools/issues/types";
import {
  createPanelPadder,
  renderPanelRule,
  renderPanelTitleLine,
} from "./panel";

interface PickerFilters {
  mineOnly: boolean;
  includeCompleted: boolean;
}

interface PickerLoadResult {
  issues: SerializedIssue[];
  error?: string;
}

export class StartIssuePickerComponent implements Component {
  private tui: { requestRender: () => void };
  private theme: Theme;
  private onClose: (issueId?: string) => void;
  private load: (filters: PickerFilters) => Promise<PickerLoadResult>;

  private issues: SerializedIssue[] = [];
  private selectedIndex = 0;
  private query = "";
  private searchMode = false;
  private loading = false;
  private error?: string;
  private filters: PickerFilters = {
    mineOnly: false,
    includeCompleted: false,
  };

  private cachedWidth = 0;
  private cachedLines: string[] = [];

  constructor(
    tui: { requestRender: () => void },
    theme: Theme,
    onClose: (issueId?: string) => void,
    load: (filters: PickerFilters) => Promise<PickerLoadResult>,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.onClose = onClose;
    this.load = load;
    void this.reload();
  }

  private async reload() {
    this.loading = true;
    this.error = undefined;
    this.invalidate();
    this.tui.requestRender();

    const result = await this.load(this.filters);
    this.loading = false;
    this.error = result.error;
    this.issues = result.issues;
    this.selectedIndex = Math.min(
      this.selectedIndex,
      Math.max(0, this.filteredIssues().length - 1),
    );
    this.invalidate();
    this.tui.requestRender();
  }

  private filteredIssues(): SerializedIssue[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.issues;
    return this.issues.filter((issue) => {
      const haystack =
        `${issue.identifier} ${issue.title} ${issue.state} ${issue.assignee ?? ""} ${issue.project ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  private toggleMineOnly() {
    this.filters.mineOnly = !this.filters.mineOnly;
    this.selectedIndex = 0;
    void this.reload();
  }

  private toggleIncludeCompleted() {
    this.filters.includeCompleted = !this.filters.includeCompleted;
    this.selectedIndex = 0;
    void this.reload();
  }

  handleInput(data: string): boolean {
    const visible = this.filteredIssues();

    if (this.searchMode) {
      if (matchesKey(data, "escape") || matchesKey(data, "return")) {
        this.searchMode = false;
        this.invalidate();
        this.tui.requestRender();
        return true;
      }

      if (matchesKey(data, "backspace")) {
        if (this.query.length > 0) {
          this.query = this.query.slice(0, -1);
          this.selectedIndex = 0;
          this.invalidate();
          this.tui.requestRender();
        }
        return true;
      }

      if (data.length === 1 && data >= " " && data !== "\x7f") {
        this.query += data;
        this.selectedIndex = 0;
        this.invalidate();
        this.tui.requestRender();
      }
      return true;
    }

    if (data === "/") {
      this.searchMode = true;
      this.invalidate();
      this.tui.requestRender();
      return true;
    }

    if (matchesKey(data, "down") || data === "j") {
      if (visible.length > 0) {
        this.selectedIndex = Math.min(
          this.selectedIndex + 1,
          visible.length - 1,
        );
        this.invalidate();
        this.tui.requestRender();
      }
      return true;
    }

    if (matchesKey(data, "up") || data === "k") {
      if (visible.length > 0) {
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.invalidate();
        this.tui.requestRender();
      }
      return true;
    }

    if (matchesKey(data, "return")) {
      const selected = visible[this.selectedIndex];
      this.onClose(selected?.identifier);
      return true;
    }

    if (matchesKey(data, "escape") || data === "q" || data === "Q") {
      this.onClose();
      return true;
    }

    if (data === "m" || data === "M") {
      this.toggleMineOnly();
      return true;
    }

    if (data === "c" || data === "C") {
      this.toggleIncludeCompleted();
      return true;
    }

    return true;
  }

  invalidate(): void {
    this.cachedWidth = 0;
    this.cachedLines = [];
  }

  render(width: number): string[] {
    if (width === this.cachedWidth && this.cachedLines.length > 0) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const innerWidth = width - 2;
    const theme = this.theme;
    const dim = (s: string) => theme.fg("dim", s);
    const accent = (s: string) => theme.fg("accent", s);

    const basePadLine = createPanelPadder(width);
    const padLine = (content: string): string =>
      basePadLine(
        visibleWidth(content) > innerWidth
          ? truncateToWidth(content, innerWidth)
          : content,
      );

    lines.push(renderPanelTitleLine("Linear Start: Pick issue", width, theme));

    const chips = [
      this.filters.mineOnly ? accent("mine") : dim("mine"),
      this.filters.includeCompleted ? accent("completed") : dim("completed"),
    ].join(dim(" | "));

    const modeLabel = this.searchMode ? accent("SEARCH") : dim("NAV");
    const filterPrefix = this.searchMode ? accent("/") : dim("/");
    lines.push(
      padLine(
        `${dim("Mode:")} ${modeLabel}  ${dim("Filter:")} ${filterPrefix}${this.query || dim("(press / to search)")}`,
      ),
    );
    lines.push(padLine(`${dim("Toggles:")} ${chips}`));
    lines.push(renderPanelRule(width, theme));

    if (this.loading) {
      lines.push(padLine(dim("Loading issues...")));
    } else if (this.error) {
      lines.push(padLine(theme.fg("error", this.error)));
    } else {
      const visible = this.filteredIssues();
      if (visible.length === 0) {
        lines.push(padLine(dim("No issues match current filters.")));
      } else {
        const maxRows = 12;
        const start = Math.max(0, this.selectedIndex - Math.floor(maxRows / 2));
        const end = Math.min(visible.length, start + maxRows);

        for (let i = start; i < end; i++) {
          const issue = visible[i];
          if (!issue) continue;
          const selected = i === this.selectedIndex;
          const prefix = selected ? accent(">") : " ";
          const id = selected ? accent(issue.identifier) : issue.identifier;
          const meta = dim(
            ` ${issue.state}${issue.assignee ? ` • ${issue.assignee}` : ""}`,
          );
          lines.push(padLine(`${prefix} ${id} ${issue.title}${meta}`));
        }
      }
    }

    lines.push(renderPanelRule(width, theme));
    lines.push(
      padLine(
        this.searchMode
          ? `${dim("type")} search  ${dim("enter/esc")} exit search`
          : `${dim("/")} search  ${dim("j/k")} move  ${dim("enter")} select  ${dim("m")} mine  ${dim("c")} completed  ${dim("q")} cancel`,
      ),
    );

    this.cachedWidth = width;
    this.cachedLines = lines;
    return this.cachedLines;
  }
}
