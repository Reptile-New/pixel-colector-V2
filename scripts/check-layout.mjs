import { chromium } from 'playwright'

/**
 * Contrôle de mise en page, à lancer sur une build servie depuis un sous-dossier :
 *
 *   npm run build && npx serve dist  (ou python3 -m http.server)
 *   BASE=http://localhost:4180/pixel-colector-v2/ node scripts/check-layout.mjs
 *
 * Il existe parce qu'une liste de sélecteurs CSS restée ouverte a fait hériter au
 * conteneur des toasts tout le style de l'écran de menu : une couche opaque de la
 * taille de l'écran, par-dessus le jeu, en z-index 30. Le CSS restait valide, le
 * typecheck passait, la build passait — et la moitié de l'écran était noire sur le
 * téléphone d'un joueur.
 *
 * D'où les invariants ci-dessous : les couches purement informatives ne doivent
 * jamais avoir de fond ni capturer les gestes, et l'écran doit couvrir la fenêtre
 * exactement.
 */

const BASE = process.env.BASE ?? 'http://localhost:4180/pixel-colector-v2/'
const VIEWPORTS = [
  { w: 360, h: 640, nom: 'petit Android' },
  { w: 375, h: 812, nom: 'iPhone X/11 Pro' },
  { w: 390, h: 844, nom: 'iPhone 12/13/14' },
  { w: 430, h: 932, nom: 'iPhone Pro Max' },
  { w: 932, h: 430, nom: 'paysage' },
  { w: 1440, h: 900, nom: 'bureau' },
]

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})

let echecs = 0
const ecrans = ['menu', 'album', 'upgrades', 'shop', 'settings', 'rivals', 'daily']

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } })
  const erreurs = []
  page.on('pageerror', (e) => erreurs.push(e.message))
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()))
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    window.__game.profile.seenIntro = true
    window.__game.profile.bits = 1_263_572
  })

  const problemes = []
  for (const ecran of ecrans) {
    await page.evaluate((e) => window.__game.ui.show(e), ecran)
    await page.waitForTimeout(120)
    const r = await page.evaluate(() => {
      const vue = { w: window.innerWidth, h: window.innerHeight }
      const bug = []

      // 1. Les couches informatives restent transparentes et laissent passer les gestes.
      for (const sel of ['#toasts', '.tuto']) {
        const el = document.querySelector(sel)
        if (!el) continue
        const cs = getComputedStyle(el)
        if (cs.backgroundImage !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)')
          bug.push(`${sel} a un fond (${cs.backgroundImage !== 'none' ? 'dégradé' : cs.backgroundColor})`)
        if (cs.pointerEvents !== 'none') bug.push(`${sel} capture les gestes`)
      }

      // 2. L'écran couvre exactement la fenêtre.
      const s = document.querySelector('.screen')
      if (s) {
        const b = s.getBoundingClientRect()
        if (Math.abs(b.x) > 1 || Math.abs(b.width - vue.w) > 1 || Math.abs(b.height - vue.h) > 1)
          bug.push(`.screen ${Math.round(b.x)},${Math.round(b.width)}×${Math.round(b.height)} au lieu de 0,${vue.w}×${vue.h}`)
      }

      // 3. Rien ne déborde horizontalement.
      if (document.documentElement.scrollWidth > vue.w + 1) bug.push('débordement horizontal')

      // 4. Tout bouton visible doit être atteignable (au moins partiellement à l'écran).
      for (const b of document.querySelectorAll('.screen button')) {
        const r = b.getBoundingClientRect()
        if (r.width === 0) continue
        if (r.right < 2 || r.left > vue.w - 2)
          bug.push(`bouton « ${b.textContent.trim().slice(0, 18)} » hors écran`)
      }
      return bug
    })
    if (r.length) problemes.push(`${ecran}: ${r.join(' | ')}`)
  }

  if (erreurs.length) problemes.push(`erreurs console: ${erreurs.join(' | ')}`)
  if (problemes.length) echecs++
  console.log(
    `${String(vp.w).padStart(4)}×${String(vp.h).padEnd(4)} ${vp.nom.padEnd(18)} ${
      problemes.length ? `✗\n    ${problemes.join('\n    ')}` : '✓'
    }`,
  )
  await page.close()
}

await browser.close()
console.log(echecs ? `\n${echecs} configuration(s) en échec` : '\nToutes les configurations passent')
process.exit(echecs ? 1 : 0)
