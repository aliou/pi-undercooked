export interface SerializedLinearDocument {
  id: string;
  title: string;
  content?: string;
  url: string;
  slugId: string;
  createdAt: string;
  updatedAt: string;
  creator?: string;
  issueId?: string;
  projectId?: string;
}
