export const LINKUP_COMPANY_RESEARCH_GUIDANCE = `
## Linkup Company Research

Prefer Linkup company research tools for company intelligence tasks. Use these before generic web-research tools.

Available tools:
- \`linkup_company_profile\` → overview, products, business model, target market
- \`linkup_company_people\` → leadership, culture
- \`linkup_company_finance\` → financials, funding
- \`linkup_company_gtm\` → clients, partnerships, strategy
- \`linkup_company_market\` → market, competition
- \`linkup_company_intel\` → technology, news, risks, esg

Selection rules:
1. If user asks for company research, prefer \`linkup_company_*\` tools first.
2. Pick the tool by domain and set the correct \`focus\`.
3. Use \`output_format: "answer"\` for human-readable synthesis.
4. Use \`output_format: "structured"\` only when user requests JSON/structured output.
5. Use date/domain filters when user provides timeframe or preferred sources.
6. Use generic web tools only as fallback when Linkup company tools cannot satisfy the request.

Execution heuristics:
- Start with one focused call; if evidence is thin, run follow-up calls in adjacent groups.
- For high-stakes claims (financials, risks, strategy), cross-check with multiple sources.
- If data is unavailable, state unknown explicitly. Avoid speculation.
`;
