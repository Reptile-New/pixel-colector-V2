import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Inlines the dist-single build into two artefacts:
 *   dist-single/pixel-collector.html  — a complete page, double-click to play
 *   dist-single/embed.html            — body content only, for hosts that supply
 *                                       their own <head>/<body> wrapper
 * Both are fully self-contained: no network request at runtime.
 */

const dir = 'dist-single'

const files = readdirSync(dir)
const jsName = files.find((f) => f.endsWith('.js'))
const cssName = files.find((f) => f.endsWith('.css'))
if (!jsName) throw new Error(`Bundle JS introuvable dans ${dir}`)

const js = readFileSync(join(dir, jsName), 'utf8')
const css = cssName ? readFileSync(join(dir, cssName), 'utf8') : ''

// The game mounts into these two nodes; keep them identical to index.html.
const BODY = `<div id="app">
  <canvas id="stage"></canvas>
  <div id="ui"></div>
</div>`

// </script> inside a string literal would close the tag early.
const safeJs = js.replaceAll('</script>', '<\\/script>')

const embed = `<style>
${css}
</style>

${BODY}

<script>
${safeJs}
</script>
`

const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#07070c">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>PIXEL COLLECTOR</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' fill='%2307070c'/><rect x='5' y='5' width='6' height='6' fill='%2340f8d0'/></svg>">
</head>
<body>
${embed}</body>
</html>
`

writeFileSync(join(dir, 'pixel-collector.html'), page)
writeFileSync(join(dir, 'embed.html'), embed)
for (const f of [jsName, cssName, 'index.html']) {
  if (f) rmSync(join(dir, f), { force: true })
}

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} ko`
console.log(`pixel-collector.html  ${kb(page)}`)
console.log(`embed.html            ${kb(embed)}`)
