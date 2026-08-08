/**
 * Plain JSON representation of a Team.
 */
export interface SerializedTeam {
  id: string;
  key: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  timezone: string;
  issueCount: number;
}
