import './ui/styles.css'
import { App } from './game/app'

const canvas = document.getElementById('stage') as HTMLCanvasElement | null
const ui = document.getElementById('ui') as HTMLElement | null

if (!canvas || !ui) {
  throw new Error('Racine introuvable : #stage / #ui manquants dans index.html')
}

// Exposed for debugging in the console: `__game.profile`, `__game.start(false)`.
;(window as unknown as { __game: App }).__game = new App(canvas, ui)
