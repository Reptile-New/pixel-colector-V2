import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

/**
 * Renders the app icons from a single source of truth (the markup below) instead
 * of committing opaque binaries. Run with `npm run icons` after changing the mark.
 * Requires playwright locally; the generated PNGs are committed so CI never needs it.
 */

const MARK = `
<style>
  html, body { margin: 0; }
  .icon {
    width: 512px; height: 512px;
    /* iOS masks icons to a rounded square and crops ~10%: keep the mark inset. */
    padding: 52px;
    box-sizing: border-box;
    background: #07070c;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    grid-template-rows: repeat(5, 1fr);
    place-items: center;
  }
  .p { width: 52px; height: 52px; }
  .core {
    width: 92px; height: 92px;
    background: #f4f7ff;
    box-shadow: 0 0 42px 12px rgba(127, 240, 255, 0.75);
    transform: rotate(45deg);
  }
</style>
<div class="icon">
  <div></div><div class="p" style="background:#4df9d6;box-shadow:0 0 26px 6px #0ff0c088"></div><div></div>
  <div class="p" style="background:#ffc247;box-shadow:0 0 26px 6px #ffa60a88"></div><div></div>

  <div></div><div></div><div></div><div></div><div></div>

  <div class="p" style="background:#ff5c9d;box-shadow:0 0 26px 6px #ff2e8688"></div><div></div>
  <div class="core"></div><div></div>
  <div class="p" style="background:#c4ff4d;box-shadow:0 0 26px 6px #9ae60a88"></div>

  <div></div><div></div><div></div><div></div><div></div>

  <div></div><div class="p" style="background:#a684ff;box-shadow:0 0 26px 6px #7d4dff88"></div><div></div>
  <div class="p" style="background:#4df9d6;box-shadow:0 0 26px 6px #0ff0c088"></div><div></div>
</div>`

const SIZES = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  // Maskable icons are cropped to an arbitrary shape by the launcher, so the
  // mark has to sit well inside the 80% safe zone.
  { name: 'icon-maskable-512.png', size: 512, pad: 112 },
]

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
mkdirSync('public', { recursive: true })

for (const { name, size, pad } of SIZES) {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 })
  await page.setContent(pad ? MARK.replace('padding: 52px;', `padding: ${pad}px;`) : MARK)
  const buf = await page.locator('.icon').screenshot()
  writeFileSync(`public/${name}`, buf)
  await page.close()
  console.log(`public/${name}  ${size}×${size}`)
}

await browser.close()
