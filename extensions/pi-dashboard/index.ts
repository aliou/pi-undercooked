import type {
	ExtensionAPI,
	ExtensionContext,
	SessionInfo,
} from "@mariozechner/pi-coding-agent";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { Key, Text, visibleWidth } from "@mariozechner/pi-tui";
import { wrapInRoundedBorder } from "./border";

const DASHBOARD_WIDGET_ID = "dashboard";
const COLLAPSED_SESSION_LIMIT = 5;
const EXPANDED_SESSION_LIMIT = 20;

type DashboardContext = Pick<
	ExtensionContext,
	"hasUI" | "ui" | "cwd" | "sessionManager"
>;

export default function dashboard(pi: ExtensionAPI): void {
	let activeSessions: SessionInfo[] | undefined;
	let expanded = false;

	pi.registerShortcut(Key.ctrlShift("x"), {
		description: "Expand or collapse dashboard sessions",
		handler: (ctx) => {
			if (!activeSessions) return;
			expanded = !expanded;
			showDashboardWidget(ctx, activeSessions, expanded);
		},
	});

	pi.on("session_start", async (event, ctx) => {
		if (event.reason !== "startup") return;
		if (!ctx.hasUI) return;

		const currentSessionId = ctx.sessionManager.getSessionId();
		const sessions = await SessionManager.list(ctx.cwd);
		const recentSessions = sessions.filter(
			(session) => session.id !== currentSessionId,
		);

		activeSessions = recentSessions;
		expanded = false;
		showDashboardWidget(ctx, activeSessions, expanded);
	});

	pi.on("agent_start", async (_event, ctx) => {
		activeSessions = undefined;
		clearDashboardWidget(ctx);
	});
}

function showDashboardWidget(
	ctx: DashboardContext,
	sessions: SessionInfo[],
	expanded: boolean,
): void {
	ctx.ui.setWidget(
		DASHBOARD_WIDGET_ID,
		(_tui, theme) => ({
			render(width: number) {
				const contentWidth = Math.max(1, width - 4);
				const limit = expanded
					? EXPANDED_SESSION_LIMIT
					: COLLAPSED_SESSION_LIMIT;
				const lines: string[] = [];

				if (sessions.length === 0) {
					lines.push(
						theme.fg("muted", "No previous sessions in this directory."),
					);
				} else {
					lines.push(
						theme.fg(
							"dim",
							`Showing ${Math.min(sessions.length, limit)} of ${sessions.length}`,
						),
					);
					lines.push("");
					lines.push(
						...formatSessionTree(sessions.slice(0, limit), contentWidth, theme),
					);
				}

				const text = lines.flatMap((line) =>
					new Text(line, 0, 0).render(contentWidth),
				);
				return wrapInRoundedBorder(
					text.map((line) => ` ${line} `),
					{
						width,
						color: (text) => theme.fg("accent", text),
						title: theme.fg(
							"customMessageLabel",
							"\x1b[1mrecent sessions\x1b[22m",
						),
						hint: theme.fg(
							"dim",
							expanded ? "ctrl+shift+x collapse" : "ctrl+shift+x expand",
						),
					},
				);
			},
			handleInput() {},
			invalidate() {},
		}),
		{ placement: "aboveEditor" },
	);
}

function clearDashboardWidget(ctx: DashboardContext): void {
	ctx.ui.setWidget(DASHBOARD_WIDGET_ID, undefined);
}

function formatSessionTree(
	sessions: SessionInfo[],
	contentWidth: number,
	theme: { fg(color: string, text: string): string },
): string[] {
	const sessionsByPath = new Map(
		sessions.map((session) => [session.path, session]),
	);
	const childrenByParent = new Map<string, SessionInfo[]>();
	const roots: SessionInfo[] = [];

	for (const session of sessions) {
		const parentPath = session.parentSessionPath;
		if (parentPath && sessionsByPath.has(parentPath)) {
			const children = childrenByParent.get(parentPath) ?? [];
			children.push(session);
			childrenByParent.set(parentPath, children);
			continue;
		}

		roots.push(session);
	}

	const lines: string[] = [];
	const appendSession = (session: SessionInfo, prefix: string): void => {
		lines.push(formatSessionLine(session, prefix, contentWidth, theme));

		const children = childrenByParent.get(session.path) ?? [];
		for (const child of children) {
			appendSession(child, `${prefix}  `);
		}
	};

	for (const root of roots) appendSession(root, "");
	return lines;
}

function formatSessionLine(
	session: SessionInfo,
	prefix: string,
	contentWidth: number,
	theme: { fg(color: string, text: string): string },
): string {
	const title = session.name?.trim() || "(untitled session)";
	const modified = getSessionDate(session);
	const age = modified ? formatRelativeTime(modified) : "unknown";
	const branch = prefix ? "└─ " : "- ";
	const marker = theme.fg("muted", `${prefix}${branch}`);
	const suffix = theme.fg("dim", `(${age})`);
	const titleWidth = Math.max(
		1,
		contentWidth - visibleWidth(`${prefix}${branch}`) - visibleWidth(age) - 3,
	);

	return `${marker}${truncate(title, titleWidth)} ${suffix}`;
}

function getSessionDate(session: SessionInfo): Date | undefined {
	const date = session.modified ?? session.created;
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatRelativeTime(date: Date): string {
	const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
	if (seconds < 60) return "just now";

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;

	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;

	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;

	const years = Math.floor(days / 365);
	return `${years}y ago`;
}

function truncate(text: string, maxWidth: number): string {
	if (visibleWidth(text) <= maxWidth) return text;
	if (maxWidth <= 1) return "…";

	let output = "";
	for (const char of text) {
		if (visibleWidth(`${output}${char}…`) > maxWidth) break;
		output += char;
	}
	return `${output}…`;
}
