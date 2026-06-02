import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { HUDState } from '../game/types'
import type { ScoreEntry, Settings, ShopState } from '../game/storage'
import { SHOP_UPGRADES, shopCost } from '../game/data/survivors'
import { MAP_PICKER } from '../game/data/maps'
import { PLAYER_AVATAR_OPTIONS, normalizePlayerAvatar, type PlayerAvatarId } from '../net/playerAvatars'
import playerHeavyPreview from '../assets/sprites/player-heavy-front.webp'
import playerMedicPreview from '../assets/sprites/player-medic-front.webp'
import playerRangerPreview from '../assets/sprites/player-ranger-front.webp'
import playerScoutPreview from '../assets/sprites/player-scout-front.webp'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'

interface Props {
  state: HUDState
  scores: ScoreEntry[]
  settings: Settings
  onLock: () => void
  onRestart: () => void
  onToggleMusic: () => void
  onToggleSfx: () => void
  onClearScores: () => void
  onStartMultiplayer: (name: string, room: string, avatar: PlayerAvatarId) => void
  onLeaveRoom: () => void
  onStartCampaign: (mapId?: string) => void
  onStartSurvivors: () => void
  onPickUpgrade: (id: string) => void
  onMenu: () => void
  shop: ShopState
  lastRunGold: number
  onBuyShop: (id: string) => void
  initialRoom: string
}

// ----------------------------------------------------------------- shared utility class strings
const OVERLAY =
  'absolute inset-0 z-20 flex flex-col items-center justify-center text-center bg-[rgba(8,12,22,0.74)] backdrop-blur-md pointer-events-auto cursor-pointer'
const HUD_CORNER =
  'absolute px-4 py-3 bg-[rgba(10,16,28,0.55)] border border-white/10 rounded-[10px] backdrop-blur-[4px] [font-variant-numeric:tabular-nums]'
const STAT_LABEL = 'text-[11px] tracking-[0.12em] uppercase opacity-60'
const STAT_VALUE = 'text-[22px] font-bold leading-[1.1]'
const MENU_HEADING = 'text-[22px] font-extrabold tracking-[0.04em] mt-1 mb-3'
const STAT_SUB = 'text-[11px] font-bold tracking-[0.04em] opacity-70 mt-px uppercase'
const AVATAR_PREVIEWS: Record<PlayerAvatarId, string> = {
  ranger: playerRangerPreview,
  heavy: playerHeavyPreview,
  scout: playerScoutPreview,
  medic: playerMedicPreview,
}

function roomShareUrl(room: string): string {
  return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`
}

function CopyLinkButton({ room }: { room: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    const url = roomShareUrl(room)
    const done = () => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
    try {
      navigator.clipboard?.writeText(url).then(done, done)
    } catch {
      done()
    }
  }
  return (
    <Button type="button" variant="default" onClick={copy}>
      {copied ? '✓ Copied!' : '🔗 Copy room link'}
    </Button>
  )
}

function Shop({ shop, onBuy }: { shop: ShopState; onBuy: (id: string) => void }) {
  return (
    <div
      className="pointer-events-auto w-[min(620px,88vw)] mt-[14px] bg-[rgba(255,209,102,0.05)] border border-[rgba(255,209,102,0.35)] rounded-xl px-4 py-[14px]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex justify-between items-center mb-[10px]">
        <span className="text-[14px] tracking-[0.08em] uppercase text-[#ffd166]">🛒 Survivors Upgrade Shop</span>
        <span className="text-[16px] font-extrabold text-[#ffd166]">💰 {shop.gold.toLocaleString()}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SHOP_UPGRADES.map((u) => {
          const tier = shop.tiers[u.id] ?? 0
          const maxed = tier >= u.max
          const cost = shopCost(u, tier)
          const afford = shop.gold >= cost
          return (
            <Card
              key={u.id}
              className={`flex items-center gap-[10px] bg-black/30 border-white/10 rounded-[9px] px-[10px] py-2 text-left${maxed ? ' opacity-70' : ''}`}
            >
              <div className="text-[24px]">{u.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold">
                  {u.name} <span className="text-[11px] opacity-60 font-semibold">{tier}/{u.max}</span>
                </div>
                <div className="text-[11px] opacity-65 leading-[1.3]">{u.desc}</div>
              </div>
              <button
                type="button"
                className="pointer-events-auto cursor-pointer text-[12px] font-extrabold whitespace-nowrap text-[#1a1206] bg-gradient-to-r from-[#ffd166] to-[#ffb02e] rounded-[7px] px-[10px] py-[7px] disabled:cursor-default disabled:bg-white/[0.12] disabled:bg-none disabled:text-[#8a93a6]"
                disabled={maxed || !afford}
                onClick={() => onBuy(u.id)}
              >
                {maxed ? 'MAX' : `💰 ${cost}`}
              </button>
            </Card>
          )
        })}
      </div>
      <div className="mt-[10px] text-[11px] opacity-60 text-center">
        Permanent — applies to every Survivors run. Earn gold by surviving.
      </div>
    </div>
  )
}

function randomRoom(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `ARENA-${s}`
}

function MultiplayerPanel({ onStart, initialRoom }: { onStart: (name: string, room: string, avatar: PlayerAvatarId) => void; initialRoom: string }) {
  const [name, setName] = useState(() => localStorage.getItem('fps-arena.name') || '')
  const [room, setRoom] = useState(initialRoom || '')
  const [avatar, setAvatar] = useState<PlayerAvatarId>(() => normalizePlayerAvatar(localStorage.getItem('fps-arena.avatar')))
  const join = () => {
    const n = name.trim() || 'Player'
    const r = (room.trim() || randomRoom()).toUpperCase()
    localStorage.setItem('fps-arena.name', n)
    localStorage.setItem('fps-arena.avatar', avatar)
    onStart(n, r, avatar)
  }
  const input =
    'pointer-events-auto text-[15px] text-fg bg-black/35 border border-white/20 rounded-lg px-3 py-[9px] min-w-[200px] focus:outline-none focus:border-accent'
  return (
    <div
      className="pointer-events-auto mt-4 w-[min(700px,88vw)] bg-[rgba(255,77,109,0.06)] border border-[rgba(255,77,109,0.35)] rounded-[10px] px-5 py-4 text-center"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[14px] tracking-[0.1em] uppercase text-[#ff8aa0] mb-[10px]">⚔ Multiplayer — PvP Arena</div>
      <div className="flex gap-[10px] justify-center flex-wrap">
        <input className={input} placeholder="Your name" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className={input}
          placeholder="Room code (blank = random)"
          maxLength={20}
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') join()
          }}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {PLAYER_AVATAR_OPTIONS.map((option) => {
          const selected = avatar === option.id
          return (
            <button
              key={option.id}
              type="button"
              className={`pointer-events-auto cursor-pointer flex min-h-[158px] flex-col items-center overflow-hidden rounded-lg border px-2.5 py-2.5 text-center transition-[border-color,background,transform,box-shadow] hover:-translate-y-px ${
                selected
                  ? 'border-accent bg-accent/15 shadow-[0_0_0_1px_rgba(0,216,255,0.18),0_10px_28px_-18px_rgba(0,216,255,0.9)]'
                  : 'border-white/15 bg-black/25 hover:bg-white/10'
              }`}
              onClick={() => setAvatar(option.id)}
              aria-pressed={selected}
            >
              <span
                className={`relative flex h-[108px] w-full items-end justify-center overflow-hidden rounded-md border bg-black/35 ${
                  selected ? 'border-accent/60' : 'border-white/10'
                }`}
              >
                <span className={`absolute bottom-[8px] h-[24px] w-[74px] rounded-full blur-[10px] ${selected ? 'bg-accent/45' : 'bg-white/10'}`} />
                <span className={`absolute bottom-[7px] h-[14px] w-[64px] rounded-full border ${selected ? 'border-accent/75' : 'border-white/15'}`} />
                <img
                  src={AVATAR_PREVIEWS[option.id]}
                  alt=""
                  className="relative z-[1] h-[104px] w-auto max-w-none object-contain [filter:drop-shadow(0_7px_7px_rgba(0,0,0,0.8))]"
                  draggable={false}
                />
                {selected && (
                  <span className="absolute right-2 top-2 z-[2] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-[12px] font-extrabold text-ink">
                    ✓
                  </span>
                )}
              </span>
              <span className="mt-2 min-w-0">
                <b className="block text-[13px] leading-tight">{option.name}</b>
                <small className="block text-[11px] opacity-65 leading-tight">{option.role}</small>
              </span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className="pointer-events-auto cursor-pointer mt-3 text-[18px] font-bold tracking-[0.04em] text-[#1a0608] bg-gradient-to-r from-[#ff4d6d] to-[#ff8a3c] rounded-[10px] px-[34px] py-[13px] shadow-[0_6px_22px_rgba(255,77,109,0.35)] transition-transform hover:-translate-y-px active:translate-y-px"
        onClick={join}
      >
        ⚔ Join Room
      </button>
      <div className="mt-2 text-[12px] opacity-60">Share the room code so friends can join the same arena.</div>
    </div>
  )
}

function Scoreboard({ board, room, connected }: { board: HUDState['scoreboard']; room: string; connected: boolean }) {
  return (
    <div className="absolute top-[96px] right-[18px] min-w-[190px] bg-[rgba(10,16,28,0.6)] border border-white/10 rounded-[10px] px-[10px] py-2 [font-variant-numeric:tabular-nums]">
      <div className="flex justify-between text-[12px] tracking-[0.06em] opacity-85 mb-[5px] pb-1 border-b border-white/10">
        <span>⚔ {room || '—'}</span>
        <span className={connected ? 'text-good' : 'text-warn'}>{connected ? '● live' : '○ …'}</span>
      </div>
      {board.map((p) => (
        <div key={p.id} className={`flex items-center gap-2 text-[13px] py-[2px]${p.you ? ' text-accent font-bold' : ''}`}>
          <span className="flex-1 truncate">{p.name}{p.you ? ' (you)' : ''}</span>
          <span className="w-[30px] text-right opacity-70">{p.health}</span>
          <span className="w-[24px] text-right font-extrabold">{p.kills}</span>
        </div>
      ))}
    </div>
  )
}

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function healthColor(frac: number): string {
  const hue = 120 * Math.max(0, Math.min(1, frac))
  return `hsl(${hue}, 70%, 48%)`
}

function Crosshair() {
  const bar = 'absolute bg-white/85 shadow-[0_0_2px_rgba(0,0,0,0.8)]'
  return (
    <div className="absolute top-1/2 left-1/2 w-[26px] h-[26px] -translate-x-1/2 -translate-y-1/2" aria-hidden>
      <span className={`${bar} left-1/2 w-[2px] h-[8px] -translate-x-1/2 top-0`} />
      <span className={`${bar} left-1/2 w-[2px] h-[8px] -translate-x-1/2 bottom-0`} />
      <span className={`${bar} top-1/2 h-[2px] w-[8px] -translate-y-1/2 left-0`} />
      <span className={`${bar} top-1/2 h-[2px] w-[8px] -translate-y-1/2 right-0`} />
      <span className="absolute top-1/2 left-1/2 w-[2px] h-[2px] rounded-full -translate-x-1/2 -translate-y-1/2 bg-accent" />
    </div>
  )
}

function HitMarker({ seq, variant }: { seq: number; variant: 'hit' | 'kill' | 'head' }) {
  if (seq <= 0) return null
  const anim = variant === 'kill' ? 'animate-hit-kill' : variant === 'head' ? 'animate-hit-head' : 'animate-hit'
  const color =
    variant === 'kill'
      ? 'bg-danger'
      : variant === 'head'
        ? 'bg-[#ffd166] shadow-[0_0_6px_rgba(255,209,102,0.9)]'
        : 'bg-white'
  const bar = `absolute ${color}`
  return (
    <div
      key={`${variant}-${seq}`}
      className={`absolute top-1/2 left-1/2 w-[30px] h-[30px] opacity-0 ${anim}`}
      aria-hidden
    >
      <span className={`${bar} left-1/2 w-[3px] h-[10px] -translate-x-1/2 top-0`} />
      <span className={`${bar} left-1/2 w-[3px] h-[10px] -translate-x-1/2 bottom-0`} />
      <span className={`${bar} top-1/2 h-[3px] w-[10px] -translate-y-1/2 left-0`} />
      <span className={`${bar} top-1/2 h-[3px] w-[10px] -translate-y-1/2 right-0`} />
    </div>
  )
}

const RING_R = 22
const RING_C = 2 * Math.PI * RING_R

function ReloadRing({ progress }: { progress: number }) {
  return (
    <svg
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90"
      viewBox="0 0 52 52"
      width="52"
      height="52"
      aria-hidden
    >
      <circle className="fill-none [stroke:rgba(255,255,255,0.18)] [stroke-width:3]" cx="26" cy="26" r={RING_R} />
      <circle
        className="fill-none stroke-warn [stroke-width:3] [stroke-linecap:round] [transition:stroke-dashoffset_0.1s_linear]"
        cx="26"
        cy="26"
        r={RING_R}
        style={{ strokeDasharray: RING_C, strokeDashoffset: RING_C * (1 - progress) }}
      />
    </svg>
  )
}

function SettingsRow({
  settings,
  onToggleMusic,
  onToggleSfx,
  className = 'mt-4',
}: {
  settings: Settings
  onToggleMusic: () => void
  onToggleSfx: () => void
  className?: string
}) {
  const row = 'flex items-center gap-[10px] text-[13px] bg-white/[0.08] border border-white/[0.16] rounded-lg px-[14px] py-[7px] tracking-[0.03em]'
  return (
    <div className={`flex gap-3 justify-center ${className}`} onClick={(e) => e.stopPropagation()}>
      <label className={row}>
        <span>♪ Music</span>
        <Switch checked={settings.music} onCheckedChange={onToggleMusic} aria-label="Toggle music" />
      </label>
      <label className={row}>
        <span>🔊 SFX</span>
        <Switch checked={settings.sfx} onCheckedChange={onToggleSfx} aria-label="Toggle sound effects" />
      </label>
    </div>
  )
}

function Leaderboard({
  scores,
  highlight,
  onClear,
}: {
  scores: ScoreEntry[]
  highlight?: ScoreEntry | null
  onClear?: () => void
}) {
  const th = 'text-[10px] tracking-[0.08em] uppercase opacity-50 text-right px-[6px] py-[2px] font-semibold'
  const td = 'text-[14px] text-right px-[6px] py-[3px]'
  return (
    <div
      className="pointer-events-auto min-w-[320px] bg-white/[0.04] border border-white/10 rounded-[10px] px-[14px] py-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[14px] tracking-[0.1em] uppercase opacity-85">🏆 Leaderboard</span>
        {onClear && scores.length > 0 && (
          <button
            type="button"
            className="pointer-events-auto cursor-pointer text-[11px] text-[#aab4c2] bg-transparent border border-white/[0.18] rounded-md px-2 py-[2px]"
            onClick={onClear}
          >
            clear
          </button>
        )}
      </div>
      {scores.length === 0 ? (
        <div className="text-[13px] opacity-60 py-2">No runs yet — set the first record.</div>
      ) : (
        <table className="w-full border-collapse [font-variant-numeric:tabular-nums]">
          <thead>
            <tr>
              <th className={`${th} !text-center`}>#</th>
              <th className={th}>Score</th>
              <th className={th}>Kills</th>
              <th className={th}>HS</th>
              <th className={th}>Time</th>
              <th className={th}>Result</th>
            </tr>
          </thead>
          <tbody>
            {scores.slice(0, 8).map((s, i) => {
              const me =
                highlight &&
                s.score === highlight.score &&
                s.kills === highlight.kills &&
                s.time === highlight.time &&
                s.date === highlight.date
              return (
                <tr key={s.date + '-' + i} className={me ? 'bg-[rgba(0,216,255,0.16)] outline outline-1 outline-[rgba(0,216,255,0.4)]' : ''}>
                  <td className={`${td} !text-center`}>{i + 1}</td>
                  <td className={td}>{s.score.toLocaleString()}</td>
                  <td className={td}>{s.kills}</td>
                  <td className={td}>{s.headshots}</td>
                  <td className={td}>{formatTime(s.time)}</td>
                  <td className={`${td} ${s.outcome === 'win' ? 'text-good font-bold' : 'text-[#aab4c2]'}`}>
                    {s.outcome === 'win' ? 'WIN' : 'KO'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function SurvivorsHud({ state }: { state: HUDState }) {
  const frac = state.xpToNext > 0 ? state.xp / state.xpToNext : 0
  return (
    <>
      <div className="absolute top-[92px] left-1/2 -translate-x-1/2 w-[min(560px,72vw)] flex items-center gap-[10px]" aria-hidden>
        <div className="text-[13px] font-extrabold text-[#b06bff] tracking-[0.06em] whitespace-nowrap">LV {state.level}</div>
        <div className="flex-1 h-3 bg-white/[0.12] border border-[rgba(176,107,255,0.4)] rounded-md overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#7a3cff] to-[#c79bff] shadow-[0_0_12px_rgba(140,80,255,0.8)] transition-[width] duration-150 ease-linear"
            style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }}
          />
        </div>
        <div className="text-[11px] opacity-65 [font-variant-numeric:tabular-nums] whitespace-nowrap">
          {state.xp}/{state.xpToNext}
        </div>
      </div>
      {state.build.length > 0 && (
        <div className="absolute top-[118px] left-1/2 -translate-x-1/2 flex gap-[6px] flex-wrap justify-center max-w-[70vw]" aria-hidden>
          {state.build.map((b) => (
            <span key={b.id} className="text-[16px] bg-black/40 border border-white/[0.14] rounded-lg px-[7px] py-[2px]" title={b.name}>
              {b.icon}
              <b className="text-[11px] text-accent ml-[2px] align-super">{b.level}</b>
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function LevelUpDraft({ state, onPick }: { state: HUDState; onPick: (id: string) => void }) {
  return (
    <div className={`${OVERLAY} !bg-[rgba(8,12,22,0.82)] cursor-default`}>
      <div className="tracking-[0.5em] text-[13px] opacity-60 uppercase mb-[10px]">Level {state.level} — choose an upgrade</div>
      <h2 className="text-[40px] mt-1 mb-5 bg-gradient-to-r from-[#b06bff] to-[#ff8af0] bg-clip-text text-transparent font-bold">
        LEVEL UP!
      </h2>
      <div className="flex gap-[18px] flex-wrap justify-center max-w-[92vw]">
        {state.choices.map((c) => (
          <Card
            asChild
            key={c.id}
            className="pointer-events-auto cursor-pointer w-[220px] min-h-[200px] border-[rgba(176,107,255,0.35)] rounded-[14px] px-4 py-5 text-fg text-center transition-[transform,border-color,background] hover:-translate-y-[3px] hover:border-[#c79bff] hover:bg-[rgba(176,107,255,0.12)]"
          >
            <button type="button" onClick={() => onPick(c.id)}>
              <div className="text-[46px] leading-none">{c.icon}</div>
              <div className="text-[19px] font-extrabold mt-[10px] mb-1">{c.name}</div>
              <div className="text-[12px] tracking-[0.08em] uppercase text-[#c79bff] mb-[10px]">
                {c.level === 0 ? 'NEW' : `Lv ${c.level} → ${c.level + 1}`}
              </div>
              <div className="text-[13px] opacity-80 leading-[1.4]">{c.desc}</div>
            </button>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function HUD({
  state,
  scores,
  settings,
  onLock,
  onRestart,
  onToggleMusic,
  onToggleSfx,
  onClearScores,
  onStartMultiplayer,
  onLeaveRoom,
  onStartCampaign,
  onStartSurvivors,
  onPickUpgrade,
  onMenu,
  shop,
  lastRunGold,
  onBuyShop,
  initialRoom,
}: Props) {
  const {
    status,
    playerHealth,
    maxPlayerHealth,
    ammo,
    reserve,
    reloading,
    reloadProgress,
    score,
    kills,
    headshots,
    enemiesAlive,
    time,
    wave,
    totalWaves,
    campaignStage,
    campaignTotalStages,
    mapName,
    bossActive,
    bossHealthFrac,
    bossShielded,
    bossEnraged,
    outcome,
    weapon,
    weapons,
    damageBoost,
    hitMarkerSeq,
    headshotSeq,
    killSeq,
    damageSeq,
    banner,
    bannerSeq,
    toast,
    toastSeq,
    damageNumbers,
    multiplayer,
    connected,
    room,
    scoreboard,
    survivors,
  } = state

  type MenuScreen = 'home' | 'modes' | 'campaign' | 'survivor' | 'multiplayer' | 'shop' | 'settings' | 'leaderboard'
  const [menuScreen, setMenuScreen] = useState<MenuScreen>(initialRoom ? 'multiplayer' : 'home')
  const [pausePanel, setPausePanel] = useState<'none' | 'settings' | 'controls'>('none')
  const firstMenuShow = useRef(true)
  // Reset to the root menu whenever the menu is (re)shown — but a shared
  // `?room=` link drops you straight on the join screen the first time.
  useEffect(() => {
    if (status === 'pointerlock-needed') {
      setMenuScreen(firstMenuShow.current && initialRoom ? 'multiplayer' : 'home')
      firstMenuShow.current = false
    }
  }, [status, initialRoom])
  // Always reopen the pause menu on its root screen.
  useEffect(() => {
    if (status !== 'paused') setPausePanel('none')
  }, [status])
  const healthFrac = playerHealth / maxPlayerHealth
  const playing = status === 'playing'
  const bossLabel = bossShielded ? 'SHIELDED' : bossEnraged ? 'ENRAGED' : 'BOSS'
  const currentRun: ScoreEntry | null =
    status === 'gameover' && outcome
      ? { score, kills, headshots, time, outcome, date: scores.find((s) => s.score === score && s.kills === kills && s.time === time)?.date ?? 0 }
      : null

  const menuScreenWrap = 'flex flex-col items-center gap-2 mt-[14px] w-full'

  return (
    // `hud-paused` freezes every in-flight HUD animation except the pause overlay's own UI (see styles.css).
    <div className={`absolute inset-0 pointer-events-none z-10${status === 'paused' ? ' hud-paused' : ''}`}>
      {playing && <Crosshair />}
      {playing && reloading && <ReloadRing progress={reloadProgress} />}
      <HitMarker seq={hitMarkerSeq} variant="hit" />
      <HitMarker seq={headshotSeq} variant="head" />
      <HitMarker seq={killSeq} variant="kill" />
      {damageSeq > 0 && (
        <div
          key={`d-${damageSeq}`}
          className="absolute inset-0 pointer-events-none opacity-0 animate-dmg bg-[radial-gradient(ellipse_at_center,rgba(255,0,40,0)_45%,rgba(255,0,40,0.45)_100%)]"
          aria-hidden
        />
      )}

      {bannerSeq > 0 && playing && (
        <div
          key={`b-${bannerSeq}`}
          className="absolute top-[26%] left-1/2 text-[64px] font-black tracking-[0.08em] text-white opacity-0 whitespace-nowrap animate-bannerpop [text-shadow:0_0_24px_rgba(0,216,255,0.7),0_4px_14px_rgba(0,0,0,0.6)]"
          aria-hidden
        >
          {banner}
        </div>
      )}
      {toastSeq > 0 && playing && (
        <div
          key={`t-${toastSeq}`}
          className={`absolute bottom-[23%] left-1/2 text-[24px] font-extrabold tracking-[0.05em] opacity-0 whitespace-nowrap animate-toastpop ${
            toast.includes('HEADSHOT')
              ? 'text-[#ffd166] [text-shadow:0_0_18px_rgba(255,209,102,0.9),0_2px_8px_rgba(0,0,0,0.6)]'
              : 'text-white [text-shadow:0_0_16px_rgba(0,216,255,0.7),0_2px_8px_rgba(0,0,0,0.6)]'
          }`}
          aria-hidden
        >
          {toast}
        </div>
      )}

      {playing &&
        damageNumbers.map((d) => (
          <div
            key={d.id}
            className={`absolute pointer-events-none font-extrabold whitespace-nowrap animate-dmgnum [text-shadow:0_2px_6px_rgba(0,0,0,0.8)] ${
              d.kind === 'head'
                ? 'text-[#ffd166] text-[28px]'
                : d.kind === 'crit'
                  ? 'text-[#ff7a3c] text-[26px]'
                  : 'text-white text-[20px]'
            }`}
            style={{ left: `${d.x}%`, top: `${d.y}%` }}
            aria-hidden
          >
            {d.amount}
            {d.kind === 'head' ? '!' : d.kind === 'crit' ? '✦' : ''}
          </div>
        ))}

      {playing && damageBoost > 0 && (
        <div
          className="absolute top-[130px] left-1/2 -translate-x-1/2 px-4 py-[6px] rounded-[18px] bg-[rgba(255,122,26,0.18)] border border-[rgba(255,122,26,0.6)] text-[#ffb56b] text-[13px] font-bold tracking-[0.08em] [text-shadow:0_0_10px_rgba(255,122,26,0.6)]"
          aria-hidden
        >
          ⚡ 2× DAMAGE · {damageBoost}s
        </div>
      )}

      {playing && multiplayer && <Scoreboard board={scoreboard} room={room} connected={connected} />}
      {playing && survivors && <SurvivorsHud state={state} />}

      <div className={`${HUD_CORNER} top-4 left-1/2 -translate-x-1/2 flex gap-[26px] items-center text-center`}>
        <div>
          <div className={STAT_LABEL}>Time</div>
          <div className={`${STAT_VALUE} text-[30px]`}>{formatTime(time)}</div>
        </div>
        {!multiplayer && !survivors && campaignTotalStages > 1 && (
          <div>
            <div className={STAT_LABEL}>Stage</div>
            <div className={STAT_VALUE}>
              {campaignStage}/{campaignTotalStages}
            </div>
            <div className={STAT_SUB}>{mapName}</div>
          </div>
        )}
        {!multiplayer && !survivors && (
          <div>
            <div className={STAT_LABEL}>Wave</div>
            <div className={`${STAT_VALUE}${bossActive ? ' text-danger tracking-[0.1em] animate-bosspulse' : ''}`}>
              {bossActive ? 'BOSS' : `${wave}/${totalWaves}`}
            </div>
          </div>
        )}
        {survivors && (
          <div>
            <div className={STAT_LABEL}>Level</div>
            <div className={STAT_VALUE}>{state.level}</div>
          </div>
        )}
        {!multiplayer && (
          <div>
            <div className={STAT_LABEL}>Score</div>
            <div className={STAT_VALUE}>{score.toLocaleString()}</div>
          </div>
        )}
        <div>
          <div className={STAT_LABEL}>{multiplayer ? 'Frags' : 'Kills'}</div>
          <div className={STAT_VALUE}>{kills}</div>
        </div>
        <div>
          <div className={STAT_LABEL}>HS</div>
          <div className={STAT_VALUE}>{headshots}</div>
        </div>
        {!multiplayer && (
          <div>
            <div className={STAT_LABEL}>Enemies</div>
            <div className={STAT_VALUE}>{enemiesAlive}</div>
          </div>
        )}
      </div>

      {bossActive && (
        <div className="absolute top-[96px] left-1/2 -translate-x-1/2 w-[min(620px,70vw)] text-center">
          <div
            className={`text-[13px] tracking-[0.35em] mb-[5px] ${
              bossShielded
                ? 'text-[#39c7ff] [text-shadow:0_0_12px_rgba(57,199,255,0.9)]'
                : bossEnraged
                  ? 'text-[#ff7a3c] [text-shadow:0_0_12px_rgba(255,122,60,0.9)]'
                  : 'text-danger [text-shadow:0_0_10px_rgba(255,77,109,0.7)]'
            }`}
          >
            ◆ {bossLabel} ◆
          </div>
          <div className="relative h-4 bg-white/[0.12] border border-[rgba(255,77,109,0.5)] rounded-lg overflow-hidden">
            <div
              className={`absolute inset-0 w-full transition-[width] duration-[120ms] ease-linear ${
                bossShielded
                  ? 'bg-gradient-to-r from-[#2aa9ff] to-[#7fe1ff] shadow-[0_0_16px_rgba(57,199,255,0.9)]'
                  : 'bg-gradient-to-r from-[#ff1f4f] to-[#ff7a3c] shadow-[0_0_14px_rgba(255,31,79,0.8)]'
              }`}
              style={{ width: `${Math.max(0, bossHealthFrac) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className={`${HUD_CORNER} left-[18px] bottom-[18px] min-w-[190px]`}>
        <div className={STAT_LABEL}>Health</div>
        <div className="flex items-center gap-[10px]">
          <div className="relative w-[150px] h-[14px] bg-white/[0.12] rounded-[7px] overflow-hidden">
            <div
              className="absolute inset-0 rounded-[7px] [transition:width_0.15s_linear,background_0.2s_linear]"
              style={{ width: `${Math.max(0, healthFrac) * 100}%`, background: healthColor(healthFrac) }}
            />
          </div>
          <div className={`${STAT_VALUE} !text-[18px]`}>{playerHealth}</div>
        </div>
      </div>

      <div className={`${HUD_CORNER} right-[18px] bottom-[18px] text-right min-w-[150px]`}>
        <div className="text-[13px] tracking-[0.12em] uppercase text-accent mb-[2px]">{weapon}</div>
        {survivors ? (
          <div className="flex items-baseline justify-end gap-[6px]">
            <span className="text-[30px] font-extrabold text-good">∞</span>
          </div>
        ) : (
          <div className="flex items-baseline justify-end gap-[6px]">
            <span className={`text-[30px] font-extrabold${ammo === 0 ? ' text-danger' : ''}`}>{ammo}</span>
            <span className="text-[16px] opacity-70">/ {reserve}</span>
          </div>
        )}
        {!survivors &&
          (reloading ? (
            <div className="mt-[6px] flex flex-col items-end gap-[3px] text-warn text-[12px] tracking-[0.08em] uppercase">
              <div className="w-[120px] h-[5px] bg-white/[0.15] rounded-[3px] overflow-hidden">
                <div className="h-full bg-warn rounded-[3px] transition-[width] duration-100 ease-linear" style={{ width: `${reloadProgress * 100}%` }} />
              </div>
              <span>Reloading…</span>
            </div>
          ) : (
            ammo === 0 && <div className="mt-[5px] text-danger text-[12px] tracking-[0.06em] uppercase animate-blink">Press R to reload</div>
          ))}
        <div className="mt-[6px] text-[11px] opacity-55 tracking-[0.04em]">🔪 R-Click / F</div>
        {weapons.length > 1 && (
          <div className="flex flex-wrap justify-end gap-[5px] mt-2 max-w-[220px]">
            {weapons.map((w) => (
              <span
                key={w.id}
                className={`text-[11px] px-[7px] py-[2px] rounded-[5px] border whitespace-nowrap ${
                  w.active ? 'opacity-100 bg-[rgba(0,216,255,0.18)] border-[rgba(0,216,255,0.55)]' : 'opacity-70 bg-white/[0.08] border-white/[0.12]'
                }`}
              >
                <b className="text-accent mr-[2px]">{w.key}</b> {w.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Overlays */}
      {status === 'levelup' && <LevelUpDraft state={state} onPick={onPickUpgrade} />}

      {status === 'pointerlock-needed' && (
        <div className={`${OVERLAY} cursor-default overflow-y-auto p-6`}>
          <h1 className="m-0 mb-[6px] text-[52px] tracking-[0.04em] bg-gradient-to-r from-accent to-[#6fe7ff] bg-clip-text text-transparent">
            FPS ARENA
          </h1>

          {menuScreen === 'home' && (
            <div className={menuScreenWrap}>
              <div className="flex flex-col gap-3 w-[min(460px,92vw)] mx-auto mt-2">
                <Button type="button" variant="stack" onClick={() => setMenuScreen('modes')}>
                  <span className="text-[30px] leading-none w-10 text-center shrink-0">🎮</span>
                  <span className="flex flex-col">
                    <b className="text-[19px] font-extrabold tracking-[0.02em]">Modes</b>
                    <small className="text-[13px] opacity-60 mt-[2px]">Campaign · Survivors · Multiplayer</small>
                  </span>
                </Button>
                <Button type="button" variant="stack" onClick={() => setMenuScreen('leaderboard')}>
                  <span className="text-[30px] leading-none w-10 text-center shrink-0">🏆</span>
                  <span className="flex flex-col">
                    <b className="text-[19px] font-extrabold tracking-[0.02em]">Leaderboard</b>
                    <small className="text-[13px] opacity-60 mt-[2px]">Top runs</small>
                  </span>
                </Button>
                <Button type="button" variant="stack" onClick={() => setMenuScreen('settings')}>
                  <span className="text-[30px] leading-none w-10 text-center shrink-0">⚙️</span>
                  <span className="flex flex-col">
                    <b className="text-[19px] font-extrabold tracking-[0.02em]">Settings</b>
                    <small className="text-[13px] opacity-60 mt-[2px]">Music · SFX</small>
                  </span>
                </Button>
              </div>
            </div>
          )}

          {menuScreen === 'modes' && (
            <div className={menuScreenWrap}>
              <div className={MENU_HEADING}>Choose a Mode</div>
              <div className="flex flex-col gap-3 w-[min(460px,92vw)] mx-auto mt-2">
                <Button type="button" variant="stack" className="hover:border-accent" onClick={() => setMenuScreen('campaign')}>
                  <span className="text-[30px] leading-none w-10 text-center shrink-0">🎯</span>
                  <span className="flex flex-col">
                    <b className="text-[19px] font-extrabold tracking-[0.02em]">Campaign</b>
                    <small className="text-[13px] opacity-60 mt-[2px]">Journey {MAP_PICKER.length} arenas — waves + a boss in each.</small>
                  </span>
                </Button>
                <Button type="button" variant="stack" className="hover:border-[#b06bff]" onClick={() => setMenuScreen('survivor')}>
                  <span className="text-[30px] leading-none w-10 text-center shrink-0">🧛</span>
                  <span className="flex flex-col">
                    <b className="text-[19px] font-extrabold tracking-[0.02em]">Survivors</b>
                    <small className="text-[13px] opacity-60 mt-[2px]">Endless swarms · level up · draft combos.</small>
                  </span>
                </Button>
                <Button type="button" variant="stack" className="hover:border-danger" onClick={() => setMenuScreen('multiplayer')}>
                  <span className="text-[30px] leading-none w-10 text-center shrink-0">⚔</span>
                  <span className="flex flex-col">
                    <b className="text-[19px] font-extrabold tracking-[0.02em]">Multiplayer</b>
                    <small className="text-[13px] opacity-60 mt-[2px]">PvP arena rooms — fight friends online.</small>
                  </span>
                </Button>
                <Button type="button" variant="back" onClick={() => setMenuScreen('home')}>← Back</Button>
              </div>
            </div>
          )}

          {menuScreen === 'campaign' && (
            <div className={menuScreenWrap}>
              <div className={MENU_HEADING}>🎯 Campaign</div>
              <p className="max-w-[min(560px,90vw)] mx-auto -mt-1 mb-[14px] text-[13.5px] leading-[1.5] text-center opacity-70">
                Pick your starting arena. The journey continues through the rest in order, ending at a final boss —
                your health, score, and arsenal carry over, and the enemies grow stronger each stage.
              </p>
              <div className="grid grid-cols-2 gap-3 w-[min(560px,92vw)] mx-auto">
                {MAP_PICKER.map((m) => (
                  <Card
                    asChild
                    key={m.id}
                    className="pointer-events-auto cursor-pointer flex flex-col items-start gap-1 text-left text-fg border-l-[3px] [border-left-color:var(--map-accent)] rounded-xl px-4 py-[14px] transition-[transform,border-color,background,box-shadow] hover:-translate-y-[2px] hover:bg-white/10 hover:[border-color:var(--map-accent)] hover:shadow-[0_6px_22px_-10px_var(--map-accent)]"
                    style={{ '--map-accent': m.accent } as CSSProperties}
                  >
                    <button type="button" onClick={() => onStartCampaign(m.id)}>
                      <span className="text-[26px] leading-none">{m.icon}</span>
                      <span className="text-[17px] font-extrabold tracking-[0.02em]">{m.name}</span>
                      <span className="text-[12px] opacity-60 leading-[1.35]">{m.subtitle}</span>
                      <span className="mt-1 text-[11.5px] font-extrabold tracking-[0.06em] uppercase [color:var(--map-accent)]">Start here ▸</span>
                    </button>
                  </Card>
                ))}
              </div>
              <Button type="button" variant="back" className="w-[min(260px,80vw)] self-center mt-[14px]" onClick={() => setMenuScreen('modes')}>← Back</Button>
            </div>
          )}

          {menuScreen === 'survivor' && (
            <div className={menuScreenWrap}>
              <div className={MENU_HEADING}>🧛 Survivors</div>
              <div className="flex flex-col gap-3 w-[min(460px,92vw)] mx-auto mt-2">
                <Button type="button" variant="stack" className="hover:border-[#b06bff]" onClick={onStartSurvivors}>
                  <span className="text-[30px] leading-none w-10 text-center shrink-0">▶</span>
                  <span className="flex flex-col">
                    <b className="text-[19px] font-extrabold tracking-[0.02em]">Play</b>
                    <small className="text-[13px] opacity-60 mt-[2px]">Start a run</small>
                  </span>
                </Button>
                <Button type="button" variant="stack" onClick={() => setMenuScreen('shop')}>
                  <span className="text-[30px] leading-none w-10 text-center shrink-0">🛒</span>
                  <span className="flex flex-col">
                    <b className="text-[19px] font-extrabold tracking-[0.02em]">Shop</b>
                    <small className="text-[13px] opacity-60 mt-[2px]">💰 {shop.gold.toLocaleString()} gold</small>
                  </span>
                </Button>
                <Button type="button" variant="back" onClick={() => setMenuScreen('modes')}>← Back</Button>
              </div>
            </div>
          )}

          {menuScreen === 'shop' && (
            <div className={menuScreenWrap}>
              <div className={MENU_HEADING}>🛒 Shop</div>
              <Shop shop={shop} onBuy={onBuyShop} />
              <Button type="button" variant="back" className="w-[min(260px,80vw)] self-center mt-[14px]" onClick={() => setMenuScreen('survivor')}>← Back</Button>
            </div>
          )}

          {menuScreen === 'multiplayer' && (
            <div className={menuScreenWrap}>
              <div className={MENU_HEADING}>⚔ Multiplayer</div>
              <MultiplayerPanel onStart={onStartMultiplayer} initialRoom={initialRoom} />
              <Button type="button" variant="back" className="w-[min(260px,80vw)] self-center mt-[14px]" onClick={() => setMenuScreen('modes')}>← Back</Button>
            </div>
          )}

          {menuScreen === 'settings' && (
            <div className={menuScreenWrap}>
              <div className={MENU_HEADING}>⚙️ Settings</div>
              <SettingsRow settings={settings} onToggleMusic={onToggleMusic} onToggleSfx={onToggleSfx} />
              <Button type="button" variant="back" className="w-[min(260px,80vw)] self-center mt-[14px]" onClick={() => setMenuScreen('home')}>← Back</Button>
            </div>
          )}

          {menuScreen === 'leaderboard' && (
            <div className={menuScreenWrap}>
              <div className={MENU_HEADING}>🏆 Leaderboard</div>
              <Leaderboard scores={scores} onClear={onClearScores} />
              <Button type="button" variant="back" className="w-[min(260px,80vw)] self-center mt-[14px]" onClick={() => setMenuScreen('home')}>← Back</Button>
            </div>
          )}
        </div>
      )}

      {status === 'paused' && (
        <div className={OVERLAY} onClick={onLock}>
          <h2 className="m-0 mb-[18px] text-[30px] font-bold">Paused</h2>
          {multiplayer ? (
            <>
              <p className="my-1 opacity-85 text-[16px]">
                Room <b>{room}</b> · {connected ? '● connected' : '○ connecting…'} · Frags {kills}
              </p>
              <div
                className="pause-ui pointer-events-auto my-[8px] w-[min(460px,86vw)] bg-[rgba(0,216,255,0.06)] border border-[rgba(0,216,255,0.3)] rounded-[10px] px-[14px] py-3 text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-[12px] opacity-70 mb-2">Invite a friend — share this link:</div>
                <input
                  className="pointer-events-auto w-full text-[13px] text-[#cbe9f5] bg-black/40 border border-white/[0.18] rounded-[7px] px-[10px] py-2 text-center"
                  readOnly
                  value={roomShareUrl(room)}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="flex gap-[10px] justify-center mt-[10px] flex-wrap">
                  <CopyLinkButton room={room} />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      onLeaveRoom()
                    }}
                  >
                    ⤺ Leave Room
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="my-1 opacity-85 text-[16px]">
              Score {score.toLocaleString()} · Kills {kills} · {bossActive ? 'BOSS' : `Wave ${wave}/${totalWaves}`}
            </p>
          )}
          <div className="pause-ui flex flex-col gap-[10px] mt-[22px] w-[min(340px,86vw)] pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            {pausePanel === 'none' && (
              <>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setPausePanel('settings')}>
                  ⚙️ Settings
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setPausePanel('controls')}>
                  🎮 Controls
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={onRestart}>
                  ↻ Restart Level
                </Button>
                <Button type="button" variant="default" className="w-full" onClick={onLock}>
                  ▶ Resume
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={onMenu}>
                  ⤺ Exit to Menu
                </Button>
              </>
            )}

            {pausePanel === 'settings' && (
              <>
                <div className="text-[16px] font-extrabold tracking-[0.04em] text-center mb-[2px]">⚙️ Settings</div>
                <SettingsRow settings={settings} onToggleMusic={onToggleMusic} onToggleSfx={onToggleSfx} className="mt-0" />
                <Button type="button" variant="ghost" className="w-full" onClick={() => setPausePanel('none')}>
                  ← Back
                </Button>
              </>
            )}

            {pausePanel === 'controls' && (
              <>
                <div className="text-[16px] font-extrabold tracking-[0.04em] text-center mb-[2px]">🎮 Controls</div>
                <div className="flex flex-col gap-2 px-[18px] py-[14px] bg-white/[0.04] border border-white/[0.12] rounded-[10px] text-[14px] [&>div]:flex [&>div]:items-center [&>div]:gap-[10px] [&_span]:shrink-0 [&_span]:w-[110px] [&_span]:text-right [&_span]:opacity-85">
                  <div><span><kbd>WASD</kbd></span> Move</div>
                  <div><span><kbd>Mouse</kbd></span> Look</div>
                  <div><span><kbd>L-Click</kbd></span> Fire</div>
                  <div><span><kbd>R-Click</kbd> / <kbd>F</kbd></span> Melee</div>
                  <div><span><kbd>1</kbd>–<kbd>4</kbd></span> Weapon</div>
                  <div><span><kbd>Space</kbd></span> Jump</div>
                  <div><span><kbd>R</kbd></span> Reload</div>
                  <div><span><kbd>Esc</kbd></span> Pause / Resume</div>
                </div>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setPausePanel('none')}>
                  ← Back
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {status === 'gameover' && (
        <div className={`${OVERLAY} cursor-default`}>
          <div className="tracking-[0.5em] text-[13px] opacity-60 uppercase mb-[10px]">
            {outcome === 'win' ? 'Boss defeated — you cleared the arena' : 'You were overrun'}
          </div>
          <h1
            className={`m-0 mb-[6px] text-[52px] tracking-[0.04em] bg-clip-text text-transparent bg-gradient-to-r ${
              outcome === 'win' ? 'from-good to-[#b6ff8a]' : 'from-danger to-[#ff9a3c]'
            }`}
          >
            {outcome === 'win' ? 'VICTORY' : 'GAME OVER'}
          </h1>
          <div className="flex gap-9 my-[14px] mb-[26px]">
            <div>
              <div className={STAT_LABEL}>Score</div>
              <div className={`${STAT_VALUE} !text-[34px]`}>{score.toLocaleString()}</div>
            </div>
            <div>
              <div className={STAT_LABEL}>Kills</div>
              <div className={`${STAT_VALUE} !text-[34px]`}>{kills}</div>
            </div>
            <div>
              <div className={STAT_LABEL}>Headshots</div>
              <div className={`${STAT_VALUE} !text-[34px]`}>{headshots}</div>
            </div>
            <div>
              <div className={STAT_LABEL}>Time</div>
              <div className={`${STAT_VALUE} !text-[34px]`}>{formatTime(time)}</div>
            </div>
          </div>
          {survivors && lastRunGold > 0 && (
            <div className="my-[6px] mb-[10px] text-[#ffd166] text-[16px] font-bold [text-shadow:0_0_12px_rgba(255,209,102,0.6)]">
              💰 +{lastRunGold.toLocaleString()} gold earned · spend it in the Shop
            </div>
          )}
          <Leaderboard scores={scores} highlight={currentRun} onClear={onClearScores} />
          <div className="flex gap-3 mt-4">
            <Button variant="default" onClick={onRestart} type="button">
              ⟳ Play Again
            </Button>
            <Button variant="ghost" onClick={onMenu} type="button">
              ☰ Main Menu
            </Button>
          </div>
          <SettingsRow settings={settings} onToggleMusic={onToggleMusic} onToggleSfx={onToggleSfx} />
        </div>
      )}
    </div>
  )
}
