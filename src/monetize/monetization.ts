/**
 * Monetisation layer.
 *
 * Everything here sits behind an interface so the game never imports an ad SDK.
 * Swapping `MockAdProvider` for AdMob / Unity Ads / AdSense H5 is a one-line
 * change in `main.ts` and touches no gameplay code.
 *
 * Product rules encoded here (see docs/MONETIZATION.md for the reasoning):
 *  1. No ad ever interrupts a run.
 *  2. Rewarded ads are always opt-in and always give something the player wants
 *     *right now* (continue, double bits).
 *  3. Nothing purchasable changes game balance.
 */

export type RewardPlacement = 'continue' | 'doubleBits' | 'extraDaily'

export interface AdProvider {
  readonly name: string
  isRewardedReady(): boolean
  /** Resolves true if the reward was earned (ad watched to completion). */
  showRewarded(placement: RewardPlacement): Promise<boolean>
  showInterstitial(): Promise<void>
}

export type Sku = 'no_ads' | 'collector_pass' | 'skin_gold' | 'bits_small' | 'bits_large'

export interface IapProduct {
  readonly sku: Sku
  readonly name: string
  readonly desc: string
  readonly price: string
}

export interface IapProvider {
  readonly name: string
  products(): readonly IapProduct[]
  purchase(sku: Sku): Promise<boolean>
  restore(): Promise<Sku[]>
}

export const PRODUCTS: readonly IapProduct[] = [
  {
    sku: 'no_ads', name: 'SANS PUBLICITÉ', price: '3,99 €',
    desc: 'Supprime les interstitiels. Les pubs à récompense restent disponibles si tu les veux. Inclut le skin COLLECTOR et un essai quotidien supplémentaire.',
  },
  {
    sku: 'collector_pass', name: 'PASS COLLECTOR', price: '5,99 € / saison',
    desc: 'Piste de récompenses cosmétiques saisonnière, +25 % de bits, 3 spécimens exclusifs. Aucun avantage de gameplay.',
  },
  {
    sku: 'skin_gold', name: 'SKIN COLLECTOR', price: '1,99 €',
    desc: 'Curseur doré et traînée dédiée. Purement cosmétique.',
  },
]

/** Development / offline provider. Shows a real, honest placeholder panel so the
 *  whole flow (timing, friction, reward) can be play-tested before any SDK exists. */
export class MockAdProvider implements AdProvider {
  readonly name = 'mock'
  private busy = false

  isRewardedReady(): boolean {
    return !this.busy
  }

  showRewarded(placement: RewardPlacement): Promise<boolean> {
    return this.panel(`PUB À RÉCOMPENSE — ${placement}`, 5, true)
  }

  showInterstitial(): Promise<void> {
    return this.panel('INTERSTITIEL', 4, false).then(() => undefined)
  }

  private panel(title: string, seconds: number, rewarded: boolean): Promise<boolean> {
    if (this.busy) return Promise.resolve(false)
    this.busy = true
    return new Promise((resolve) => {
      const el = document.createElement('div')
      el.className = 'ad-overlay'
      el.innerHTML = `
        <div class="ad-box">
          <div class="ad-tag">EMPLACEMENT PUBLICITAIRE (MOCK)</div>
          <div class="ad-title">${title}</div>
          <div class="ad-note">Ici s'afficherait la créative du réseau publicitaire.<br>Aucun SDK n'est intégré dans cette build.</div>
          <button class="ad-skip" disabled>PATIENTE <span>${seconds}</span></button>
        </div>`
      document.body.appendChild(el)
      const btn = el.querySelector('.ad-skip') as HTMLButtonElement
      const span = btn.querySelector('span') as HTMLSpanElement
      let left = seconds
      const tick = window.setInterval(() => {
        left -= 1
        span.textContent = String(Math.max(left, 0))
        if (left <= 0) {
          clearInterval(tick)
          btn.disabled = false
          btn.textContent = rewarded ? 'RÉCUPÉRER LA RÉCOMPENSE' : 'FERMER'
          btn.focus()
        }
      }, 1000)
      btn.addEventListener('click', () => {
        if (btn.disabled) return
        clearInterval(tick)
        el.remove()
        this.busy = false
        resolve(true)
      })
    })
  }
}

/** Development IAP provider: grants instantly, persists through the profile. */
export class MockIapProvider implements IapProvider {
  readonly name = 'mock'
  products(): readonly IapProduct[] {
    return PRODUCTS
  }
  async purchase(): Promise<boolean> {
    return confirm(
      'ACHAT SIMULÉ\n\nAucun paiement réel n\'est effectué : cette build ne contient pas de SDK de facturation.\n\nValider pour simuler un achat réussi ?',
    )
  }
  async restore(): Promise<Sku[]> {
    return []
  }
}

export class Monetization {
  constructor(
    readonly ads: AdProvider,
    readonly iap: IapProvider,
  ) {}

  /** One interstitial every 3 finished runs, never before run 3, never for payers. */
  shouldShowInterstitial(runsSinceAd: number, totalRuns: number, noAds: boolean): boolean {
    if (noAds) return false
    if (totalRuns < 3) return false // let a new player fall in love first
    return runsSinceAd >= 3
  }
}
