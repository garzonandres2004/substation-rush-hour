import fs from 'node:fs';
import path from 'node:path';
import History, { type SavedDay } from '../../src/components/History';

export const metadata = { title: 'Today, tomorrow and past days · Substation Rush Hour' };

// Read every saved forecast at build time (the daily refresh rebuilds the site after saving one).
function savedDays(): SavedDay[] {
  const dir = path.join(process.cwd(), 'public/data/archive');
  try {
    const { dates } = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as { dates: string[] };
    return dates.map(d => JSON.parse(fs.readFileSync(path.join(dir, `${d}.json`), 'utf8')) as SavedDay);
  } catch {
    return [];
  }
}

export default function Page() {
  return <History saved={savedDays()} />;
}
