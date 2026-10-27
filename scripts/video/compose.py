"""Compose the captured frames into a polished 1080p video: framed browser window on a navy
background, smooth auto zoom, chapter pill, captions under the window, progress bar, intro and outro.
Usage: python3 compose.py <capDir> <fontsDir> <out.mp4>"""
import bisect, json, re, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

cap_dir, fonts, out = sys.argv[1:4]
tl = json.load(open(f'{cap_dir}/timeline.json'))
frames, events = tl['frames'], tl['events']
VW, VH, DPR = tl['W'], tl['H'], tl['DPR']
ft = [f['t'] for f in frames]

OW, OH, FPS = 1920, 1080, 30
CW, CH = 1488, 837            # page area inside the window (16:9)
BAR = 40                      # browser chrome height
WX, WY = (OW - CW) // 2, 38   # window top left
RAD = 16
NAVY, INK = (13, 22, 38), (16, 27, 45)
BLUE, SOFT = (29, 78, 216), (143, 176, 255)

F = lambda name, size: ImageFont.truetype(f'{fonts}/{name}.ttf', size)
f_cap, f_capb = F('Barlow-600', 33), F('Barlow-600', 33)
f_arrow = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 28)
font_for = lambda w: f_arrow if w == '→' else f_cap
f_url, f_chip = F('Barlow-400', 19), F('Barlow-600', 18)
f_title, f_sub, f_small = F('BarlowCondensed-700', 124), F('Barlow-400', 34), F('Barlow-400', 24)

def ev(kind):
    return [e for e in events if e['type'] == kind]
t_start = ev('start')[0]['t']
t_end = ev('end')[0]['t'] + 0.4
chapters = ev('chapter')
zooms = ev('zoom')
caps = ev('caption')
INTRO, OUTRO, XF = 3.6, 5.0, 0.6
body = t_end - t_start
total = INTRO + body + OUTRO

# ---------- static layers ----------
def background():
    bg = Image.new('RGB', (OW, OH), NAVY)
    glow = Image.new('L', (OW, OH), 0)
    ImageDraw.Draw(glow).ellipse((OW * 0.15, -OH * 0.5, OW * 0.85, OH * 0.75), fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    bg.paste(Image.new('RGB', (OW, OH), (30, 58, 138)), (0, 0), glow)
    return bg

def window_layer(chapter_idx):
    """Background + shadow + chrome bar with URL and chapter pill."""
    img = BG.copy()
    sh = Image.new('L', (OW, OH), 0)
    ImageDraw.Draw(sh).rounded_rectangle((WX, WY + 14, WX + CW, WY + BAR + CH + 14), RAD, fill=150)
    sh = sh.filter(ImageFilter.GaussianBlur(26))
    img.paste((0, 0, 0), (0, 0), sh)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((WX, WY, WX + CW, WY + BAR + CH), RAD, fill=(233, 235, 239))
    for i, c in enumerate([(237, 106, 94), (245, 191, 79), (98, 197, 84)]):
        d.ellipse((WX + 18 + i * 22, WY + 14, WX + 30 + i * 22, WY + 26), fill=c)
    uw = 420
    d.rounded_rectangle((OW // 2 - uw // 2, WY + 8, OW // 2 + uw // 2, WY + 32), 8, fill=(255, 255, 255))
    d.text((OW // 2, WY + 20), 'torus-green.vercel.app', font=f_url, fill=(70, 80, 96), anchor='mm')
    if chapter_idx is not None:
        label = f'{chapter_idx + 1} / {len(chapters)}   {chapters[chapter_idx]["name"]}'
        w = d.textlength(label, font=f_chip) + 28
        x1 = WX + CW - 14
        d.rounded_rectangle((x1 - w, WY + 8, x1, WY + 32), 12, fill=INK)
        d.text((x1 - w / 2, WY + 20), label, font=f_chip, fill=(255, 255, 255), anchor='mm')
    return img

BG = background()
LAYERS = {i: window_layer(i) for i in range(len(chapters))}
LAYERS[None] = window_layer(None)
MASK = Image.new('L', (CW, CH), 0)
ImageDraw.Draw(MASK).rounded_rectangle((0, -RAD, CW - 1, CH - 1), RAD, fill=255)

def card(lines):
    img = BG.copy()
    d = ImageDraw.Draw(img)
    y = OH // 2 - 120
    for text, font, color, gap in lines:
        d.text((OW // 2, y), text, font=font, fill=color, anchor='mm')
        y += gap
    return img
INTRO_IMG = card([('Substation Rush Hour', f_title, (243, 242, 238), 110),
                  ('Rush Hour for Electrons  ·  Torus bounty  ·  Hard Tech Week Utah', f_sub, (201, 211, 227), 52),
                  ('Real Utah grid data, refreshed every day', f_sub, SOFT, 0)])
OUTRO_IMG = card([('Substation Rush Hour', f_title, (243, 242, 238), 110),
                  ('torus-green.vercel.app', f_sub, SOFT, 50),
                  ('github.com/garzonandres2004/substation-rush-hour', f_sub, (201, 211, 227), 70),
                  ('Every number on the page is labeled real, modeled or assumed. No Torus integration or data.', f_small, (138, 148, 166), 0)])

# ---------- captions ----------
def runs(html):
    out = []
    for part in re.split(r'(<b>.*?</b>)', html):
        if not part:
            continue
        bold = part.startswith('<b>')
        for w in re.sub(r'</?b>', '', part).split(' '):
            if w:
                out.append((w, bold))
    return out

def caption_img(html):
    words = runs(html)
    img = Image.new('RGBA', (OW, 160), (0, 0, 0, 0))
    if not words:
        return img
    d = ImageDraw.Draw(img)
    sp = d.textlength(' ', font=f_cap)
    lines, cur, cw = [], [], 0
    for w, b in words:
        wl = d.textlength(w, font=font_for(w))
        if cur and cw + sp + wl > 1500:
            lines.append((cur, cw)); cur, cw = [], 0
        cw += (sp if cur else 0) + wl
        cur.append((w, b, wl))
    lines.append((cur, cw))
    lh = 44
    y = 80 - lh * len(lines) / 2 + lh / 2
    for ws, width in lines:
        x = OW / 2 - width / 2
        for w, b, wl in ws:
            d.text((x, y), w, font=font_for(w), fill=SOFT + (255,) if b else (243, 242, 238, 255), anchor='lm')
            x += wl + sp
        y += lh
    return img
CAP_IMGS = [caption_img(c['text']) for c in caps]

# ---------- zoom ----------
FULL = (0.0, 0.0, float(VW), float(VH))
def ease(x):
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2
def rect_at(t):
    cur, prev, t0 = FULL, FULL, -1e9
    for z in zooms:
        if z['t'] > t:
            break
        prev = rect_blend(prev, cur, t0, z['t'])
        cur, t0 = (tuple(z['rect']) if z['rect'] else FULL), z['t']
    return rect_blend(prev, cur, t0, t)
def rect_blend(a, b, t0, t, dur=0.9):
    k = ease(min(1.0, max(0.0, (t - t0) / dur)))
    return tuple(a[i] + (b[i] - a[i]) * k for i in range(4))

# ---------- render ----------
cache = {}
def page_frame(src_t, rect):
    i = max(0, bisect.bisect_right(ft, src_t) - 1)
    x, y, w, h = rect
    half = w >= CW * 0.98            # half resolution is enough when barely zoomed
    key = (frames[i]['file'], half)
    if key not in cache:
        cache.clear()
        im = Image.open(f'{cap_dir}/{frames[i]["file"]}')
        if half:
            im.draft('RGB', (VW, VH))
        cache[key] = im.convert('RGB')
    im = cache[key]
    s = im.width / VW
    return im.crop((int(x * s), int(y * s), int((x + w) * s), int((y + h) * s))).resize((CW, CH), Image.BICUBIC)

def chapter_at(t):
    idx = None
    for i, c in enumerate(chapters):
        if c['t'] <= t:
            idx = i
    return idx

def caption_at(t):
    idx = None
    for i, c in enumerate(caps):
        if c['t'] <= t:
            idx = i
    return idx

def composed(src_t, out_t):
    base = LAYERS[chapter_at(src_t)].copy()
    base.paste(page_frame(src_t, rect_at(src_t)), (WX, WY + BAR), MASK)
    ci = caption_at(src_t)
    if ci is not None:
        a = min(1.0, (src_t - caps[ci]['t']) / 0.3)
        layer = CAP_IMGS[ci]
        if a < 1:
            layer = layer.copy()
            layer.putalpha(layer.getchannel('A').point(lambda v: int(v * a)))
        base.paste(layer, (0, WY + BAR + CH + 4), layer)
    d = ImageDraw.Draw(base)
    d.rectangle((0, OH - 5, int(OW * out_t / total), OH), fill=BLUE)
    return base

ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{OW}x{OH}', '-r', str(FPS), '-i', '-',
                       '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
                      stdin=subprocess.PIPE)
N = int(total * FPS)
for k in range(N):
    ot = k / FPS
    if ot < INTRO:
        img = INTRO_IMG
    elif ot < INTRO + body:
        img = composed(t_start + ot - INTRO, ot)
        if ot < INTRO + XF:
            img = Image.blend(INTRO_IMG, img, (ot - INTRO) / XF)
    else:
        img = OUTRO_IMG
        if ot < INTRO + body + XF:
            img = Image.blend(composed(t_end, ot), OUTRO_IMG, (ot - INTRO - body) / XF)
    if ot > total - 0.6:
        img = Image.blend(img, Image.new('RGB', (OW, OH), (0, 0, 0)), (ot - (total - 0.6)) / 0.6)
    ff.stdin.write(img.tobytes())
    if k % 300 == 0:
        print(f'{k}/{N}', flush=True)
ff.stdin.close()
ff.wait()
print('done', round(total, 1), 's')
