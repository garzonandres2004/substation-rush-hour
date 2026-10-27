import raw from '../../public/data/explanations.json';

interface Entry {
  hash: string;
  text: string;
}
const file = raw as unknown as { generatedBy: string; entries: Record<string, Entry> };

export const explainedBy = file.generatedBy;

// Small deterministic string hash. If the engine output changes, the hash changes and the
// cached text is ignored, so a stale explanation can never sit next to new numbers.
export function stepHash(title: string, body: string): string {
  let h = 5381;
  const s = `${title}|${body}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function stepKey(scenario: string, strategy: string, kind: string, start: number, end: number): string {
  return `${scenario}|${strategy}|${kind}|${start}-${end}`;
}

export function explanationFor(key: string, title: string, body: string): string | null {
  const e = file.entries[key];
  return e && e.hash === stepHash(title, body) ? e.text : null;
}
