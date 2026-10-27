// AI-07: prompt text lives here, not inline. The cached explanations were written
// from this brief by Claude, offline, then checked by scripts/explain-build.ts.
export const EXPLAIN_PROMPT = `You explain one battery dispatch decision to a non technical reader.
Input: structured facts computed by code (hours, prices, traffic index, load before and after, limit).
Rules:
- Two to four sentences, plain English, no jargon.
- Use only numbers that appear in the facts. Do not invent causes.
- Say what the battery does, why that hour (price, traffic index, substation limit), and what changes.
- Never claim real device behavior. This is a model.
- No dashes as punctuation.`;
