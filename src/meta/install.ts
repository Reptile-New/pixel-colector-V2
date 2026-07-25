interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * "Add to home screen" support.
 *
 * Two very different worlds:
 *  - Chromium (Android/desktop) fires `beforeinstallprompt`, which we stash and
 *    replay on a real user gesture — one tap, done.
 *  - iOS Safari has no such API at all: installing is a manual Share → "Sur
 *    l'écran d'accueil". All we can do is detect the situation and say so.
 *
 * Anyone who is already running standalone sees nothing.
 */
export class InstallPrompt {
  private deferred: BeforeInstallPromptEvent | null = null
  private onChange: (() => void) | null = null
  installed = false

  constructor() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault() // stop the browser's own mini-infobar; we place the CTA ourselves
      this.deferred = e as BeforeInstallPromptEvent
      this.onChange?.()
    })
    window.addEventListener('appinstalled', () => {
      this.installed = true
      this.deferred = null
      this.onChange?.()
    })
  }

  subscribe(fn: () => void): void {
    this.onChange = fn
  }

  /** Already launched from the home screen: nothing to offer. */
  get isStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    )
  }

  get isIos(): boolean {
    const ua = navigator.userAgent
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  }

  /** Show the CTA? True when we can prompt, or on iOS where we can only explain. */
  get canOffer(): boolean {
    if (this.installed || this.isStandalone) return false
    if (this.deferred) return true
    // Only Safari can install on iOS — inside Chrome/Firefox for iOS the option
    // does not exist, so promising it would be a lie.
    return this.isIos && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)
  }

  /** Returns a message to show when the platform cannot be prompted directly. */
  async run(): Promise<string | null> {
    if (this.deferred) {
      const e = this.deferred
      this.deferred = null
      await e.prompt()
      const { outcome } = await e.userChoice
      this.onChange?.()
      return outcome === 'accepted' ? null : 'Installation annulée'
    }
    if (this.isIos) return 'APPUIE SUR ⬆︎ PARTAGER, PUIS « SUR L\'ÉCRAN D\'ACCUEIL »'
    return 'UTILISE LE MENU DE TON NAVIGATEUR POUR INSTALLER'
  }
}
