#!/usr/bin/env node
/**
 * Probes the actual context window limit of Apple Foundation Models by sending
 * progressively larger prompts until ExceededContextWindowSizeError is thrown.
 *
 * Key finding: Apple documents the limit as 4,096 tokens total per session
 * (input + output + session overhead). The usable input space therefore varies
 * depending on how long the model's reply is, which makes the failure point
 * appear to shift between runs (~2,500–3,000 input words in practice).
 *
 * Run with: node scripts/probe-context.mjs
 */

import { SystemLanguageModel, LanguageModelSession } from "tsfm-sdk";

const model = new SystemLanguageModel();
const { available, reason } = await model.waitUntilAvailable();

if (!available) {
  console.error(`Model unavailable: ${reason}`);
  process.exit(1);
}

// contextSize is exposed in newer Apple SDK versions (macOS 26.4+).
// tsfm-sdk 0.3.1 does not yet wrap it, so this will be absent for now.
if ("contextSize" in model) {
  console.log(`model.contextSize = ${model.contextSize} tokens`);
} else {
  console.log("model.contextSize not available in this tsfm-sdk version.");
}

// "hello " is typically 1 token in most tokenizers. We repeat it to approximate
// a known token count, though Apple's internal tokenizer may differ slightly.
const WORD = "hello ";
const STEPS = [500, 1000, 1500, 2000, 2500, 2700, 2800, 2900, 3000, 3200, 3500];

console.log("");
for (const targetWords of STEPS) {
  const prompt = WORD.repeat(targetWords);

  process.stdout.write(`  ~${targetWords} words (${prompt.length} chars) ... `);

  const session = new LanguageModelSession();
  try {
    const reply = await session.respond(prompt);
    console.log(`OK  reply: "${reply.slice(0, 50).replace(/\n/g, " ")}"`);
  } catch (err) {
    const prev = STEPS[STEPS.indexOf(targetWords) - 1] ?? 0;
    console.log(`FAIL — ${err.message ?? err}`);
    session.dispose();
    model.dispose();
    console.log(`\nFailed at ~${targetWords} words. Passed at ~${prev} words.`);
    console.log("Remember: the failure point shifts with output length.");
    process.exit(0);
  }
  session.dispose();
}

model.dispose();
console.log("\nAll steps passed — limit is above the highest tested value.");
