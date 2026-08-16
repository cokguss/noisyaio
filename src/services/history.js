/**
 * Riwayat unduhan — disimpan di localStorage per browser.
 * Link unduhan tidak disimpan karena token-nya cepat kedaluwarsa;
 * yang disimpan cukup metadata + link sumber untuk diulang.
 */

const KEY = 'noisy-history'
const MAX_ITEMS = 50

export function getHistory() {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ITEMS)))
  } catch {
    /* penyimpanan penuh / private mode — abaikan */
  }
}

export function addHistory(entry) {
  const list = getHistory()
  // Hindari duplikat: entri dengan link sumber sama di-refresh waktunya.
  const rest = list.filter((e) => e.sourceUrl !== entry.sourceUrl)
  save([{ ...entry, at: Date.now() }, ...rest])
}

export function removeHistory(id) {
  save(getHistory().filter((e) => e.id !== id))
}

export function clearHistory() {
  save([])
}
