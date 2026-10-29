// Daily refresh trigger, called by Vercel Cron (schedules in vercel.json). Vercel runs its crons
// within the scheduled hour, unlike GitHub's schedule, which can start hours late or not at all.
// If the live page does not show tomorrow yet and no refresh is running, this starts the GitHub
// workflow (.github/workflows/daily-refresh.yml). The workflow skips itself if the page is fresh,
// so the GitHub schedule stays as a backup and nothing ever deploys twice.
// Needs Vercel environment variables: CRON_SECRET (Vercel sends it with each cron call) and
// GH_DISPATCH_TOKEN (fine-grained GitHub token, this repository only, Actions: read and write).
import { NextResponse } from 'next/server';
import { decide } from '../../../src/lib/refresh';

export const dynamic = 'force-dynamic';

const REPO = 'garzonandres2004/substation-rush-hour';
const WORKFLOW = 'daily-refresh.yml';

async function gh(path: string, token: string, init?: RequestInit) {
  return fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
}

async function pageDate(origin: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/data/report.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    const report = (await res.json()) as { date?: string };
    return typeof report.date === 'string' ? report.date : null;
  } catch {
    return null;
  }
}

async function runActive(token: string): Promise<boolean> {
  for (const status of ['queued', 'in_progress']) {
    const res = await gh(`/actions/workflows/${WORKFLOW}/runs?status=${status}&per_page=1`, token);
    if (res.ok && ((await res.json()) as { total_count: number }).total_count > 0) return true;
  }
  return false;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return NextResponse.json({ error: 'GH_DISPATCH_TOKEN is not set' }, { status: 500 });

  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const origin = host ? `https://${host}` : new URL(request.url).origin;
  const decision = decide(await pageDate(origin), await runActive(token), new Date());
  if (decision.action === 'skip') return NextResponse.json(decision);

  const res = await gh(`/actions/workflows/${WORKFLOW}/dispatches`, token, {
    method: 'POST',
    body: JSON.stringify({ ref: 'main', inputs: { force: false } }),
  });
  if (!res.ok) {
    return NextResponse.json(
      { ...decision, error: `GitHub answered ${res.status}`, detail: await res.text() },
      { status: 502 },
    );
  }
  return NextResponse.json({ ...decision, dispatched: true });
}
