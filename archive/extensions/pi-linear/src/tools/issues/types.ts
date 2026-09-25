/**
 * Plain JSON representation of an Issue for tool results.
 * The SDK's Issue class has lazy async getters that can't be serialized,
 * so we resolve them into this shape before returning from execute().
 */
export interface SerializedIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: string;
  assignee?: string;
  delegate?: string;
  priority: number;
  priorityLabel: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  estimate?: number;
  labels: string[];
  project?: string;
  team: string;
  parentId?: string;
  milestone?: string;
  branchName?: string;
}

export interface SerializedComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  userName?: string;
  reactionCount: number;
  url: string;
}

export interface SerializedAttachment {
  id: string;
  title: string;
  subtitle?: string;
  sourceType?: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  creatorId?: string;
  creatorName?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface SerializedIssueRelation {
  id: string;
  type: string;
  relatedIssueId?: string;
  relatedIssueIdentifier?: string;
  relatedIssueTitle?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SerializedDocument {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  creatorId?: string;
  creatorName?: string;
  issueId?: string;
  projectId?: string;
}
