import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import {
  createPanelPadder,
  renderPanelRule,
  renderPanelTitleLine,
} from "./panel";

export interface BrowserListItem {
  id: string;
  title: string;
  meta?: string;
  search?: string;
}

export class BrowserTabListComponent implements Component {
  private tui: { requestRender: () => void };
  private theme: Theme;
  private title: string;
  private items: BrowserListItem[] = [];
  private onOpen: (item: BrowserListItem) => void;
  private loading = false;
  private error?: string;

  private index = 0;
  private query = "";
  private searchMode = false;

  constructor(
    tui: { requestRender: () => void },
    theme: Theme,
    title: string,
    itemsOrLoader: BrowserListItem[] | (() => Promise<BrowserListItem[]>),
    onOpen: (item: BrowserListItem) => void,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.title = title;
    this.onOpen = onOpen;

    if (Array.isArray(itemsOrLoader)) {
      this.items = itemsOrLoader;
    } else {
      this.loading = true;
      void itemsOrLoader()
        .then((items) => {
          this.items = items;
          this.loading = false;
          this.error = undefined;
          this.tui.requestRender();
        })
        .catch((error) => {
          this.loading = false;
          this.error = error instanceof Error ? error.message : String(error);
          this.tui.requestRender();
        });
    }
  }

  private visibleItems(): BrowserListItem[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.items;
    return this.items.filter((item) => {
      const haystack =
        `${item.id} ${item.title} ${item.meta ?? ""} ${item.search ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  handleInput(data: string): boolean {
    const items = this.visibleItems();

    if (this.searchMode) {
      if (matchesKey(data, "escape") || matchesKey(data, "return")) {
        this.searchMode = false;
        this.tui.requestRender();
        return true;
      }
      if (matchesKey(data, "backspace")) {
        if (this.query.length > 0) {
          this.query = this.query.slice(0, -1);
          this.index = 0;
          this.tui.requestRender();
        }
        return true;
      }
      if (data.length === 1 && data >= " " && data !== "\x7f") {
        this.query += data;
        this.index = 0;
        this.tui.requestRender();
      }
      return true;
    }

    if (data === "/") {
      this.searchMode = true;
      this.tui.requestRender();
      return true;
    }

    if (matchesKey(data, "down") || data === "j") {
      if (items.length > 0) {
        this.index = Math.min(this.index + 1, items.length - 1);
        this.tui.requestRender();
      }
      return true;
    }

    if (matchesKey(data, "up") || data === "k") {
      if (items.length > 0) {
        this.index = Math.max(this.index - 1, 0);
        this.tui.requestRender();
      }
      return true;
    }

    if (matchesKey(data, "return")) {
      const item = items[this.index];
      if (item) this.onOpen(item);
      return true;
    }

    return false;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const lines: string[] = [];
    const innerWidth = width - 2;
    const t = this.theme;
    const dim = (s: string) => t.fg("dim", s);
    const accent = (s: string) => t.fg("accent", s);

    const basePadLine = createPanelPadder(width);
    const padLine = (content: string): string =>
      basePadLine(
        visibleWidth(content) > innerWidth
          ? truncateToWidth(content, innerWidth)
          : content,
      );

    lines.push(renderPanelTitleLine(this.title, width, t));
    const modeLabel = this.searchMode ? accent("SEARCH") : dim("NAV");
    const filterPrefix = this.searchMode ? accent("/") : dim("/");
    lines.push(
      padLine(
        `${dim("Mode:")} ${modeLabel}  ${dim("Filter:")} ${filterPrefix}${this.query || dim("(press / to search)")}`,
      ),
    );
    lines.push(renderPanelRule(width, t));

    const maxRows = 12;
    let renderedRows = 0;

    if (this.loading) {
      lines.push(padLine(dim("Loading...")));
      renderedRows = 1;
    } else if (this.error) {
      lines.push(padLine(t.fg("error", this.error)));
      renderedRows = 1;
    } else {
      const items = this.visibleItems();
      if (items.length === 0) {
        lines.push(padLine(dim("No items.")));
        renderedRows = 1;
      } else {
        const start = Math.max(0, this.index - Math.floor(maxRows / 2));
        const end = Math.min(items.length, start + maxRows);

        for (let i = start; i < end; i++) {
          const item = items[i];
          if (!item) continue;
          const selected = i === this.index;
          const prefix = selected ? accent(">") : " ";
          const id = selected ? accent(item.id) : item.id;
          const meta = item.meta ? dim(` • ${item.meta}`) : "";
          lines.push(padLine(`${prefix} ${id} ${item.title}${meta}`));
          renderedRows++;
        }
      }
    }

    while (renderedRows < maxRows) {
      lines.push(padLine(""));
      renderedRows++;
    }

    lines.push(renderPanelRule(width, t));
    lines.push(
      padLine(
        this.searchMode
          ? `${dim("type")} search  ${dim("enter/esc")} exit search`
          : `${dim("/")} search  ${dim("j/k")} move  ${dim("enter")} open  ${dim("tab")} next tab`,
      ),
    );

    return lines;
  }
}
