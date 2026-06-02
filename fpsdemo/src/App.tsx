import { useCallback, useEffect, useRef, useState } from 'react'
import { Game } from './game/Game'
import type { HUDState } from './game/types'
import { HUD } from './components/HUD'
import { audio } from './audio/AudioEngine'
import {
  clearScores,
  loadScores,
  loadSettings,
  saveScore,
  saveSettings,
  type ScoreEntry,
  type Settings,
} from './game/storage'
import { MAGAZINE_SIZE, PLAYER_MAX_HEALTH, START_RESERVE, TOTAL_WAVES } from './game/constants'

const INITIAL_STATE: HUDState = {
  status: 'pointerlock-needed',
  playerHealth: PLAYER_MAX_HEALTH,
  maxPlayerHealth: PLAYER_MAX_HEALTH,
  ammo: MAGAZINE_SIZE,
  magazineSize: MAGAZINE_SIZE,
  reserve: START_RESERVE,
  reloading: false,
  reloadProgress: 0,
  score: 0,
  kills: 0,
  headshots: 0,
  enemiesAlive: 0,
  time: 0,
  wave: 1,
  totalWaves: TOTAL_WAVES,
  bossActive: false,
  bossHealthFrac: 0,
  outcome: null,
  weapon: 'Rifle',
  weapons: [{ id: 'rifle', name: 'Rifle', key: 1, active: true }],
  damageBoost: 0,
  bossShielded: false,
  bossEnraged: false,
  hitMarkerSeq: 0,
  headshotSeq: 0,
  killSeq: 0,
  damageSeq: 0,
  banner: '',
  bannerSeq: 0,
  toast: '',
  toastSeq: 0,
  multiplayer: false,
  connected: false,
  room: '',
  scoreboard: [],
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [hud, setHud] = useState<HUDState>(INITIAL_STATE)
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores())
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const savedRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    audio.setMusicEnabled(settings.music)
    audio.setSfxEnabled(settings.sfx)
    const game = new Game(container, setHud)
    gameRef.current = game
    game.start()
    if (import.meta.env.DEV) {
      ;(window as unknown as { __fpsGame?: Game; __fpsAudio?: typeof audio }).__fpsGame = game
      ;(window as unknown as { __fpsAudio?: typeof audio }).__fpsAudio = audio
    }
    return () => {
      game.dispose()
      gameRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Record a run on the leaderboard exactly once per game-over.
  useEffect(() => {
    if (hud.status === 'gameover' && hud.outcome && !savedRef.current) {
      savedRef.current = true
      setScores(
        saveScore({
          score: hud.score,
          kills: hud.kills,
          headshots: hud.headshots,
          time: hud.time,
          outcome: hud.outcome,
          date: Date.now(),
        }),
      )
    } else if (hud.status !== 'gameover') {
      savedRef.current = false
    }
  }, [hud.status, hud.outcome, hud.score, hud.kills, hud.headshots, hud.time])

  const handleLock = useCallback(() => {
    audio.unlock()
    gameRef.current?.requestLock()
  }, [])
  const handleRestart = useCallback(() => {
    audio.unlock()
    gameRef.current?.restart()
  }, [])
  const toggleMusic = useCallback(() => {
    setSettings((s) => {
      const next = { ...s, music: !s.music }
      saveSettings(next)
      audio.unlock()
      audio.setMusicEnabled(next.music)
      return next
    })
  }, [])
  const toggleSfx = useCallback(() => {
    setSettings((s) => {
      const next = { ...s, sfx: !s.sfx }
      saveSettings(next)
      audio.setSfxEnabled(next.sfx)
      if (next.sfx) {
        audio.unlock()
        audio.sfx('switch')
      }
      return next
    })
  }, [])
  const handleClearScores = useCallback(() => setScores(clearScores()), [])
  const handleStartMultiplayer = useCallback((name: string, room: string) => {
    audio.unlock()
    gameRef.current?.startMultiplayer(room, name)
  }, [])
  const handleLeaveRoom = useCallback(() => gameRef.current?.leaveMultiplayer(true), [])

  return (
    <div className="game-root" ref={containerRef}>
      <HUD
        state={hud}
        scores={scores}
        settings={settings}
        onLock={handleLock}
        onRestart={handleRestart}
        onToggleMusic={toggleMusic}
        onToggleSfx={toggleSfx}
        onClearScores={handleClearScores}
        onStartMultiplayer={handleStartMultiplayer}
        onLeaveRoom={handleLeaveRoom}
      />
    </div>
  )
}
