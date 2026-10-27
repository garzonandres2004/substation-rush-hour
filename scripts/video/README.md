# Demo video tools

How the backup demo video was made (version 2: framed window, auto zoom, chapters, captions).
Built for a Linux cloud workspace with Playwright Chromium, ffmpeg, Python Pillow and fontTools.

1. Build and serve the site: `npx next build && npx next start -p 3316`
2. Make Barlow TTF fonts from the installed @fontsource packages (Pillow needs TTF):

   ```
   pip install fonttools brotli pillow
   python3 -c "from fontTools.ttLib import TTFont as T
   for s,d in [('barlow/files/barlow-latin-400-normal.woff2','Barlow-400.ttf'),('barlow/files/barlow-latin-600-normal.woff2','Barlow-600.ttf'),('barlow-condensed/files/barlow-condensed-latin-700-normal.woff2','BarlowCondensed-700.ttf')]:
       f=T('node_modules/@fontsource/'+s); f.flavor=None; f.save('fonts/'+d)"
   ```
3. Record (about 90 s, 2x pixel density, logs chapters, captions and zoom targets):
   `node scripts/video/record2.js http://localhost:3316 cap`
4. Compose to 1080p MP4 (about 90 s of processing):
   `python3 scripts/video/compose.py cap fonts demo.mp4`

Captions read the numbers from the page while recording, so re-record after the daily refresh if
the jam hours or headline numbers change. The arrow glyph comes from DejaVu Sans Bold
(`/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`); change that path on a Mac.
