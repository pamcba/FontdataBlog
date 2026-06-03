type CacheEntry = { rate: number; fetchedAt: number }

let cache: CacheEntry | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

export async function getUsdBrlRate(): Promise<number | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rate
  }
  try {
    const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { USDBRL: { bid: string } }
    const rate = parseFloat(data.USDBRL.bid)
    if (isNaN(rate)) return null
    cache = { rate, fetchedAt: Date.now() }
    return rate
  } catch {
    return null
  }
}
