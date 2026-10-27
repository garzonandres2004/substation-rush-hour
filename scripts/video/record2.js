// High resolution scripted capture of the page (2x pixels via CDP screencast) plus an event log
// (chapters, captions, zoom targets) that compose.py turns into the final video.
// Usage: node record2.js <url> <outDir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [url, outDir] = process.argv.slice(2);
const W = 1600,
  H = 900,
  DPR = 2;
fs.mkdirSync(path.join(outDir, 'frames'), { recursive: true });

const CURSOR = `
(() => {
  const st = document.createElement('style');
  st.textContent = \`
  #cur { position: fixed; left: 0; top: 0; width: 24px; height: 24px; border-radius: 50%; z-index: 10000; pointer-events: none;
    background: rgba(29,78,216,0.30); border: 2.5px solid #1d4ed8; box-shadow: 0 2px 8px rgba(16,27,45,0.25);
    transform: translate(800px, 450px); transition: transform .75s cubic-bezier(.45,0,.2,1), background .15s; }
  #cur.down { background: rgba(29,78,216,0.85); }
  #ring { position: fixed; left: 0; top: 0; width: 24px; height: 24px; border-radius: 50%; z-index: 9999; pointer-events: none;
    border: 3px solid #1d4ed8; opacity: 0; }
  #ring.go { animation: ring .6s ease-out; }
  @keyframes ring { from { opacity: .8; transform: var(--p) scale(1); } to { opacity: 0; transform: var(--p) scale(3); } }
  \`;
  document.head.appendChild(st);
  for (const id of ['cur', 'ring']) { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); }
})();`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  const events = [];
  const now = () => Date.now() / 1000;
  const log = (type, data) => events.push({ t: now(), type, ...data });
  const wait = ms => page.waitForTimeout(ms);

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addScriptTag({ content: CURSOR });

  const cdp = await ctx.newCDPSession(page);
  let n = 0;
  const frames = [];
  cdp.on('Page.screencastFrame', async f => {
    const file = `frames/${String(n++).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(outDir, file), Buffer.from(f.data, 'base64'));
    frames.push({ t: f.metadata.timestamp, file });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId });
    } catch {}
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: W * DPR,
    maxHeight: H * DPR,
    everyNthFrame: 1,
  });

  const chapter = name => log('chapter', { name });
  const caption = (text, ms = 0) => {
    log('caption', { text });
    return ms ? wait(ms) : null;
  };
  const zoomNone = () => log('zoom', { rect: null });
  const zoomTo = async (sel, minW = 820, pad = 36) => {
    const b = await page.locator(sel).first().boundingBox();
    let w = Math.max(b.width + 2 * pad, minW),
      h = Math.max(b.height + 2 * pad, (w * 9) / 16);
    w = Math.max(w, (h * 16) / 9);
    if (w > W) {
      w = W;
      h = H;
    }
    let x = b.x + b.width / 2 - w / 2,
      y = b.y + b.height / 2 - h / 2;
    x = Math.min(Math.max(0, x), W - w);
    y = Math.min(Math.max(0, y), H - h);
    log('zoom', { rect: [x, y, w, h] });
  };
  const moveTo = async (sel, opts = {}) => {
    const box = await page.locator(sel).first().boundingBox();
    const x = box.x + (opts.fx ?? 0.5) * box.width,
      y = box.y + (opts.fy ?? 0.5) * box.height;
    await page.evaluate(
      ([x, y]) => {
        document.getElementById('cur').style.transform = `translate(${x - 12}px, ${y - 12}px)`;
      },
      [x, y],
    );
    await wait(800);
    await page.mouse.move(x, y);
    return { x, y };
  };
  const click = async sel => {
    const { x, y } = await moveTo(sel);
    await page.evaluate(
      ([x, y]) => {
        document.getElementById('cur').classList.add('down');
        const r = document.getElementById('ring');
        r.style.setProperty('--p', `translate(${x - 12}px, ${y - 12}px)`);
        r.classList.remove('go');
        void r.offsetWidth;
        r.classList.add('go');
      },
      [x, y],
    );
    await page.locator(sel).first().click();
    await wait(200);
    await page.evaluate(() => document.getElementById('cur').classList.remove('down'));
  };
  const scrollTo = async (sel, offset, ms = 1300) => {
    await page.evaluate(
      ([s, o]) =>
        window.scrollTo({
          top: document.querySelector(s).getBoundingClientRect().top + window.scrollY - o,
          behavior: 'smooth',
        }),
      [sel, offset],
    );
    await wait(ms);
  };

  const t = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.summary a')].map(a => ({
      was: a.querySelector('.was').textContent,
      now: a.querySelector('.now').textContent,
    }));
    return { headline: document.getElementById('route-h').textContent, cards };
  });

  await wait(500);
  // Replay the hero animation so it plays on camera, right after the intro card.
  await page.evaluate(() => {
    const s = document.querySelector('.summary');
    s.replaceWith(s.cloneNode(true));
  });
  log('start', {});
  zoomNone();

  chapter('Three findings');
  await caption('Three findings, each graded on what actually happened', 2600);
  await zoomTo('.summary a:nth-child(1)', 900);
  await moveTo('.summary a:nth-child(1) .now', { fx: 0.5, fy: 1.35 });
  await caption(
    `With a 10 MW, 4 hour Station this substation can take <b>${t.cards[0].was} → ${t.cards[0].now} MW</b> of new load`,
    3000,
  );
  await zoomTo('.summary a:nth-child(2)', 900);
  await moveTo('.summary a:nth-child(2) .now', { fx: 0.5, fy: 1.35 });
  await caption(
    `Days our own charging overloaded the substation: <b>${t.cards[1].was} → ${t.cards[1].now}</b> with a real time guard`,
    3000,
  );
  await zoomTo('.summary a:nth-child(3)', 900);
  await moveTo('.summary a:nth-child(3) .now', { fx: 0.5, fy: 1.35 });
  await caption(
    `Minutes over the limit inside the hour: <b>${t.cards[2].was} → ${t.cards[2].now}</b> with a flywheel plus the battery`,
    3000,
  );

  chapter("Tomorrow's traffic");
  zoomNone();
  await caption('', 0);
  await scrollTo('.controls', 80);
  await zoomTo('.route', 1200, 20);
  await caption(
    `Tomorrow's Utah grid traffic, from EIA demand, solar and wind and CAISO prices. <b>${t.headline}</b>`,
    300,
  );
  for (const h of [8, 12, 15, 17, 18, 21]) {
    await moveTo(`.road .cell:nth-child(${h + 1})`);
    await wait(300);
  }
  await wait(1200);

  chapter('The plan');
  zoomNone();
  await caption('', 0);
  await scrollTo('.grid', 66);
  await caption('The battery charges in free flowing hours, never above the limit, and discharges into the jam', 300);
  await moveTo('.charts .scroll', { fx: 0.85, fy: 0.45 });
  await wait(1600);
  await zoomTo('.steps', 760, 24);
  await moveTo('.steps li:nth-child(1)');
  await wait(1200);
  await moveTo('.steps li:last-child');
  await wait(800);
  await caption(
    'Exact math decides every step. AI only writes the plain English reason, and code checks every number in it',
    3400,
  );

  chapter('Price versus traffic');
  zoomNone();
  await caption('', 0);
  await scrollTo('.controls', 80, 1100);
  await zoomTo('.controls', 900);
  await click('.seg[aria-label="Strategy"] button:nth-child(2)');
  await caption('Follows price only: the same battery charges at the cheapest hours and ignores grid traffic', 1800);
  await click('.seg[aria-label="Scenario"] button:nth-child(2)');
  await caption('Now cut the substation’s capacity 10 percent', 1000);
  zoomNone();
  await scrollTo('.grid', 66, 1200);
  await zoomTo('.charts', 980, 10);
  await caption('Price only charges through the crunch: red is load above the limit', 2600);
  zoomNone();
  await scrollTo('.controls', 80, 1100);
  await click('.seg[aria-label="Strategy"] button:nth-child(1)');
  await scrollTo('.grid', 66, 1200);
  await zoomTo('.charts', 980, 10);
  await caption('Stays out of traffic: the battery holds the substation at its limit all afternoon', 3000);
  zoomNone();
  await scrollTo('.controls', 80, 1000);
  await click('.seg[aria-label="Scenario"] button:nth-child(1)');
  await wait(300);

  chapter('30 real days');
  await caption('', 0);
  await click('.secnav a[href="#ev-h"]');
  await wait(1300);
  await zoomTo('.evidence .tablewrap', 1100, 16);
  await caption(
    `Each day planned the night before, graded on real demand. Planning alone: <b>${t.cards[1].was} days over the limit</b>. With the guard: <b>${t.cards[1].now}</b>`,
    1200,
  );
  await moveTo('tr.best th');
  await wait(2600);

  chapter('Capacity unlocked');
  zoomNone();
  await caption('', 0);
  await click('.secnav a[href="#cap-h"]');
  await wait(1300);
  await zoomTo('.capacity .bars', 1000, 30);
  await caption(
    `<b>${t.cards[0].now} MW</b> of new always on load with a 10 MW, 4 hour Station, <b>${t.cards[0].was} MW</b> without it`,
    2800,
  );
  await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }));
  await wait(800);
  await zoomTo('.sizer', 1000, 30);
  const s = await moveTo('#nl');
  await page.mouse.down();
  await page.evaluate(() => {
    document.getElementById('cur').style.transition = 'none';
  });
  for (let i = 0; i <= 14; i++) {
    const x = s.x + i * 20;
    await page.mouse.move(x, s.y);
    await page.evaluate(
      ([x, y]) => {
        document.getElementById('cur').style.transform = `translate(${x - 12}px, ${y - 12}px)`;
      },
      [x, s.y],
    );
    await wait(90);
  }
  await page.mouse.up();
  await page.evaluate(() => {
    document.getElementById('cur').style.transition = '';
  });
  await caption('Pick a new load, get the Station it needs: a sizing tool for before a sale', 2800);

  chapter('Inside the hour');
  zoomNone();
  await caption('', 0);
  await click('.secnav a[href="#in-h"]');
  await wait(1200);
  await page.evaluate(() => window.scrollBy({ top: 330, behavior: 'smooth' }));
  await wait(900);
  await zoomTo('.inside .scroll', 1300, 10);
  await caption(
    `AI load swings minute by minute. Hourly plan only: <b>${t.cards[2].was} minutes</b> over the limit. A 3 MW flywheel plus the battery: <b>${t.cards[2].now}</b>`,
    4600,
  );

  chapter('Where it fits');
  zoomNone();
  await caption('', 0);
  await click('.secnav a[href="#tor-h"]');
  await wait(1300);
  await caption('On a Torus Station: size it before a sale, plan the night before, replan and guard every hour', 3800);
  log('end', {});
  await wait(300);

  await cdp.send('Page.stopScreencast');
  await wait(300);
  fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify({ frames, events, W, H, DPR }, null, 1));
  await browser.close();
  console.log('frames', frames.length, 'events', events.length);
})();
