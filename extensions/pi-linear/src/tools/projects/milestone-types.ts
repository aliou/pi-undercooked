export interface SerializedProjectMilestone {
  id: string;
  name: string;
  description?: string;
  targetDate?: string;
  projectId: string;
  projectName?: string;
  progress: number;
  sortOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedProjectRelation {
  id: string;
  type: string;
  anchorType: string;
  relatedAnchorType: string;
  projectId: string;
  relatedProjectId: string;
  relatedProjectName?: string;
  projectMilestoneId?: string;
  projectMilestoneName?: string;
  relatedProjectMilestoneId?: string;
  relatedProjectMilestoneName?: string;
  createdAt: string;
  updatedAt: string;
}
