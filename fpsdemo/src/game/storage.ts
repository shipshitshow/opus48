// localStorage-backed leaderboard + audio settings (no backend required).

export interface ScoreEntry {
  score: number
  kills: number
  headshots: number
  time: number
  outcome: 'win' | 'dead'
  date: number
}

const SCORES_KEY = 'fps-arena.scores.v1'
const SETTINGS_KEY = 'fps-arena.settings.v1'
const MAX_SCORES = 10

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(SCORES_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/** Adds an entry, keeps the top {@link MAX_SCORES} by score, returns the new list. */
export function saveScore(entry: ScoreEntry): ScoreEntry[] {
  const list = loadScores()
  list.push(entry)
  list.sort((a, b) => b.score - a.score || b.kills - a.kills)
  const top = list.slice(0, MAX_SCORES)
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(top))
  } catch {
    /* ignore quota / private-mode errors */
  }
  return top
}

export function clearScores(): ScoreEntry[] {
  try {
    localStorage.removeItem(SCORES_KEY)
  } catch {
    /* ignore */
  }
  return []
}

export interface Settings {
  music: boolean
  sfx: boolean
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const s = JSON.parse(raw)
      return { music: s.music !== false, sfx: s.sfx !== false }
    }
  } catch {
    /* ignore */
  }
  return { music: true, sfx: true }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}
