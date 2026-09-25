export const ISSUE_RELATION_TYPES = [
  "blocks",
  "duplicate",
  "related",
  "similar",
] as const;

export type IssueRelationTypeValue = (typeof ISSUE_RELATION_TYPES)[number];

export function normalizeIssueRelationType(type: string): {
  type?: IssueRelationTypeValue;
  reverse: boolean;
} {
  const normalized = type.trim().toLowerCase();
  if (["blocked_by", "blocked-by", "blockedby"].includes(normalized)) {
    return { type: "blocks", reverse: true };
  }

  if (ISSUE_RELATION_TYPES.includes(normalized as IssueRelationTypeValue)) {
    return { type: normalized as IssueRelationTypeValue, reverse: false };
  }

  return { reverse: false };
}
