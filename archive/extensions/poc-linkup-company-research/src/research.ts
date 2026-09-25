import type { CompanyResearchParams, LinkupDepth } from "./types";

export const GROUPS = {
  profile: ["overview", "products", "business_model", "target_market"] as const,
  people: ["leadership", "culture"] as const,
  finance: ["financials", "funding"] as const,
  gtm: ["clients", "partnerships", "strategy"] as const,
  market: ["market", "competition"] as const,
  intel: ["technology", "news", "risks", "esg"] as const,
} as const;

export const GROUP_DESCRIPTIONS: Record<string, string> = {
  profile: "Core company identity, products, and market fit.",
  people: "Leadership and company culture research.",
  finance: "Financial, funding, and valuation-oriented research.",
  gtm: "Customers, partnerships, and strategic execution.",
  market: "Market size, trends, and competitive landscape.",
  intel: "Technology, recent news, risk factors, and ESG signals.",
};

const FOCUS_PROMPTS: Record<string, string> = {
  overview:
    "Find official website, company description, HQ, employee size, and founded date. Include mission and key milestones.",
  products:
    "List products/services, target users, pricing model, and notable product updates.",
  business_model:
    "Explain how the company makes money: pricing model, revenue streams, GTM model, and monetization strategy.",
  target_market:
    "Identify ICP, key verticals, geographies, and customer segments.",
  leadership:
    "Identify CEO, founders, C-suite, board members, and recent key hires/departures.",
  culture:
    "Summarize employer brand, work model (remote/hybrid/on-site), and notable culture/people signals.",
  financials:
    "Find revenue signals, profitability status, growth metrics, and financial health indicators.",
  funding:
    "Find total funding, major rounds, notable investors, and latest valuation signals.",
  clients:
    "Identify notable customers, customer case studies, and traction indicators.",
  partnerships:
    "Identify strategic partnerships, key integrations, and ecosystem relationships.",
  strategy:
    "Describe growth strategy, expansion moves, M&A signals, and IPO/public market signals.",
  market:
    "Summarize industry context, TAM/SAM/SOM signals, trends, and regulatory dynamics.",
  competition:
    "Identify direct competitors, differentiators, and competitive positioning.",
  technology:
    "Summarize tech stack, technical differentiators, R&D focus, AI/ML capabilities, and notable OSS/patent signals.",
  news: "List recent material events (product, funding, partnerships, legal, leadership changes), with dates.",
  risks:
    "Assess key risk factors: competitive, regulatory, legal, concentration, technology, and financial risks.",
  esg: "Summarize ESG initiatives, controversies, and public reputation signals.",
};

export function buildPrompt(params: CompanyResearchParams) {
  const focusPrompt = FOCUS_PROMPTS[params.focus] ?? "Research this company.";

  const dateClause =
    params.from_date || params.to_date
      ? `Date window: ${params.from_date || "any"} to ${params.to_date || "today"}.`
      : "";

  return [
    `Research company: ${params.company_name}`,
    `Focus area: ${params.focus}`,
    focusPrompt,
    dateClause,
    "Return only factual information with clear sourcing.",
    "If information is missing, state unknown instead of inferring.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function getDefaultDepth(focus: string): LinkupDepth {
  if (
    [
      "overview",
      "financials",
      "funding",
      "clients",
      "partnerships",
      "competition",
      "market",
      "strategy",
      "risks",
      "technology",
    ].includes(focus)
  ) {
    return "deep";
  }
  return "standard";
}

export function getStructuredSchema(focus: string) {
  return {
    type: "object",
    properties: {
      company_name: { type: "string" },
      focus: { type: "string", enum: [focus] },
      summary: { type: "string" },
      key_points: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            value: { type: "string" },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
            },
          },
          required: ["title", "value"],
        },
      },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            url: { type: "string" },
          },
        },
      },
    },
    required: ["company_name", "focus", "summary"],
  };
}
