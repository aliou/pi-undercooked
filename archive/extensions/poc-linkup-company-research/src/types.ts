export type LinkupDepth = "standard" | "deep" | "fast";

export type LinkupOutputType = "sourcedAnswer" | "structured";

export interface LinkupSource {
  name?: string;
  title?: string;
  url?: string;
  snippet?: string;
}

export interface LinkupSearchResponse {
  answer?: string;
  sources?: LinkupSource[];
  structuredOutput?: unknown;
  images?: Array<{ url?: string; alt?: string; title?: string }>;
}

export interface LinkupErrorResponse {
  error?: {
    message?: string;
  };
}

export interface CompanyResearchParams {
  company_name: string;
  focus: string;
  output_format?: "answer" | "structured";
  depth?: LinkupDepth;
  from_date?: string;
  to_date?: string;
  include_domains?: string;
  exclude_domains?: string;
  include_images?: boolean;
  max_results?: number;
}

export interface GroupedResearchDetails {
  group: string;
  focus: string;
  companyName: string;
  depth: LinkupDepth;
  outputFormat: "answer" | "structured";
  sourcesCount: number;
  isError?: boolean;
  error?: string;
}
