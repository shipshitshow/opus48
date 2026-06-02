import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Game } from './game/Game'
import type { HUDState } from './game/types'
import { HUD } from './components/HUD'
import { audio } from './audio/AudioEngine'
import type { PlayerAvatarId } from './net/playerAvatars'
import {
  clearScores,
  loadScores,
  loadSettings,
  loadShop,
  saveScore,
  saveSettings,
  saveShop,
  type ScoreEntry,
  type Settings,
  type ShopState,
} from './game/storage'
import { SHOP_BY_ID, shopCost, runGold, type ShopId } from './game/data/survivors'
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
  campaignStage: 1,
  campaignTotalStages: 0,
  mapName: 'Foundry',
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
  damageNumbers: [],
  multiplayer: false,
  connected: false,
  room: '',
  scoreboard: [],
  survivors: false,
  level: 1,
  xp: 0,
  xpToNext: 6,
  build: [],
  choices: [],
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [hud, setHud] = useState<HUDState>(INITIAL_STATE)
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores())
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [shop, setShop] = useState<ShopState>(() => loadShop())
  const [lastRunGold, setLastRunGold] = useState(0)
  const savedRef = useRef(false)
  // A shared link like `?room=ARENA-AB12` lands the player on the join screen.
  const initialRoom = useMemo(
    () => (new URLSearchParams(window.location.search).get('room') || '').toUpperCase().slice(0, 24),
    [],
  )
  const setRoomInUrl = useCallback((room: string) => {
    const url = room ? `${window.location.pathname}?room=${encodeURIComponent(room)}` : window.location.pathname
    window.history.replaceState(null, '', url)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    audio.setMusicEnabled(settings.music)
    audio.setSfxEnabled(settings.sfx)
    const game = new Game(container, setHud)
    gameRef.current = game
    game.setShopUpgrades(shop.tiers)
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

  // Record a run on the leaderboard (and award Survivors gold) once per game-over.
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
      if (hud.survivors) {
        setShop((prev) => {
          const earned = runGold(hud.kills, hud.level, hud.time, prev.tiers.greed ?? 0)
          setLastRunGold(earned)
          const next = { ...prev, gold: prev.gold + earned }
          saveShop(next)
          return next
        })
      } else {
        setLastRunGold(0)
      }
    } else if (hud.status !== 'gameover') {
      savedRef.current = false
    }
  }, [hud.status, hud.outcome, hud.score, hud.kills, hud.headshots, hud.time, hud.survivors, hud.level])

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
  const handleStartMultiplayer = useCallback(
    (name: string, room: string, avatar: PlayerAvatarId) => {
      audio.unlock()
      setRoomInUrl(room)
      gameRef.current?.startMultiplayer(room, name, avatar)
    },
    [setRoomInUrl],
  )
  const handleLeaveRoom = useCallback(() => {
    setRoomInUrl('')
    gameRef.current?.leaveMultiplayer(true)
  }, [setRoomInUrl])
  const handleStartCampaign = useCallback((mapId?: string) => {
    audio.unlock()
    gameRef.current?.startCampaign(mapId)
  }, [])
  const handleStartSurvivors = useCallback(() => {
    audio.unlock()
    gameRef.current?.startSurvivors()
  }, [])
  const handlePickUpgrade = useCallback((id: string) => {
    audio.unlock()
    gameRef.current?.pickUpgrade(id)
  }, [])
  const handleMenu = useCallback(() => {
    setRoomInUrl('')
    gameRef.current?.returnToMenu()
  }, [setRoomInUrl])
  const handleBuyShop = useCallback((id: string) => {
    setShop((prev) => {
      const def = SHOP_BY_ID[id as ShopId]
      if (!def) return prev
      const tier = prev.tiers[id] ?? 0
      if (tier >= def.max) return prev
      const cost = shopCost(def, tier)
      if (prev.gold < cost) return prev
      const next: ShopState = { gold: prev.gold - cost, tiers: { ...prev.tiers, [id]: tier + 1 } }
      saveShop(next)
      gameRef.current?.setShopUpgrades(next.tiers)
      audio.unlock()
      audio.sfx('pickup')
      return next
    })
  }, [])

  return (
    <div className="game-root fixed inset-0 w-screen h-screen" ref={containerRef}>
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
        onStartCampaign={handleStartCampaign}
        onStartSurvivors={handleStartSurvivors}
        onPickUpgrade={handlePickUpgrade}
        onMenu={handleMenu}
        shop={shop}
        lastRunGold={lastRunGold}
        onBuyShop={handleBuyShop}
        initialRoom={initialRoom}
      />
    </div>
  )
}
