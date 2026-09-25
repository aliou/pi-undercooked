/**
 * Plain JSON representation of a Project for tool results.
 * The SDK's Project class has lazy async getters that can't be serialized,
 * so we resolve them into this shape before returning from execute().
 */
export interface SerializedProject {
  id: string;
  name: string;
  description: string;
  state: string;
  icon?: string;
  color: string;
  progress: number;
  priority: number;
  priorityLabel: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  startDate?: string;
  targetDate?: string;
  lead?: string;
  teams: string[];
  content?: string;
  issueCount: number;
  links: Array<{ label: string; url: string }>;
  documents: Array<{ title: string; url: string }>;
}
