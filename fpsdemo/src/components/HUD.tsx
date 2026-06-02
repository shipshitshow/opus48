import { useState } from 'react'
import type { HUDState } from '../game/types'
import type { ScoreEntry, Settings } from '../game/storage'

interface Props {
  state: HUDState
  scores: ScoreEntry[]
  settings: Settings
  onLock: () => void
  onRestart: () => void
  onToggleMusic: () => void
  onToggleSfx: () => void
  onClearScores: () => void
  onStartMultiplayer: (name: string, room: string) => void
  onLeaveRoom: () => void
}

function randomRoom(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `ARENA-${s}`
}

function MultiplayerPanel({ onStart }: { onStart: (name: string, room: string) => void }) {
  const [name, setName] = useState(() => localStorage.getItem('fps-arena.name') || '')
  const [room, setRoom] = useState('')
  const join = () => {
    const n = name.trim() || 'Player'
    const r = (room.trim() || randomRoom()).toUpperCase()
    localStorage.setItem('fps-arena.name', n)
    onStart(n, r)
  }
  return (
    <div className="mp-panel" onClick={(e) => e.stopPropagation()}>
      <div className="mp-title">⚔ Multiplayer — PvP Arena</div>
      <div className="mp-row">
        <input
          className="mp-input"
          placeholder="Your name"
          maxLength={16}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="mp-input"
          placeholder="Room code (blank = random)"
          maxLength={20}
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') join()
          }}
        />
      </div>
      <button type="button" className="btn mp-join" onClick={join}>
        ⚔ Join Room
      </button>
      <div className="mp-note">Share the room code so friends can join the same arena.</div>
    </div>
  )
}

function Scoreboard({ board, room, connected }: { board: HUDState['scoreboard']; room: string; connected: boolean }) {
  return (
    <div className="scoreboard-hud">
      <div className="sb-head">
        <span>⚔ {room || '—'}</span>
        <span className={connected ? 'sb-on' : 'sb-off'}>{connected ? '● live' : '○ …'}</span>
      </div>
      {board.map((p) => (
        <div key={p.id} className={`sb-row${p.you ? ' you' : ''}`}>
          <span className="sb-name">{p.name}{p.you ? ' (you)' : ''}</span>
          <span className="sb-hp">{p.health}</span>
          <span className="sb-kills">{p.kills}</span>
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
  return (
    <div className="crosshair" aria-hidden>
      <span className="v t" />
      <span className="v b" />
      <span className="h l" />
      <span className="h r" />
      <span className="dot" />
    </div>
  )
}

function HitMarker({ seq, variant }: { seq: number; variant: 'hit' | 'kill' | 'head' }) {
  if (seq <= 0) return null
  return (
    <div key={`${variant}-${seq}`} className={`hitmarker show ${variant}`} aria-hidden>
      <span className="v t" />
      <span className="v b" />
      <span className="h l" />
      <span className="h r" />
    </div>
  )
}

const RING_R = 22
const RING_C = 2 * Math.PI * RING_R

function ReloadRing({ progress }: { progress: number }) {
  return (
    <svg className="reload-ring" viewBox="0 0 52 52" width="52" height="52" aria-hidden>
      <circle className="reload-track" cx="26" cy="26" r={RING_R} />
      <circle
        className="reload-prog"
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
}: {
  settings: Settings
  onToggleMusic: () => void
  onToggleSfx: () => void
}) {
  return (
    <div className="settings-row" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`toggle ${settings.music ? 'on' : 'off'}`} onClick={onToggleMusic}>
        ♪ Music: <b>{settings.music ? 'On' : 'Off'}</b>
      </button>
      <button type="button" className={`toggle ${settings.sfx ? 'on' : 'off'}`} onClick={onToggleSfx}>
        🔊 SFX: <b>{settings.sfx ? 'On' : 'Off'}</b>
      </button>
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
  return (
    <div className="leaderboard" onClick={(e) => e.stopPropagation()}>
      <div className="lb-head">
        <span className="lb-title">🏆 Leaderboard</span>
        {onClear && scores.length > 0 && (
          <button type="button" className="lb-clear" onClick={onClear}>
            clear
          </button>
        )}
      </div>
      {scores.length === 0 ? (
        <div className="lb-empty">No runs yet — set the first record.</div>
      ) : (
        <table className="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Score</th>
              <th>Kills</th>
              <th>HS</th>
              <th>Time</th>
              <th>Result</th>
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
                <tr key={s.date + '-' + i} className={me ? 'me' : ''}>
                  <td>{i + 1}</td>
                  <td>{s.score.toLocaleString()}</td>
                  <td>{s.kills}</td>
                  <td>{s.headshots}</td>
                  <td>{formatTime(s.time)}</td>
                  <td className={s.outcome === 'win' ? 'win' : 'lose'}>{s.outcome === 'win' ? 'WIN' : 'KO'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
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
    multiplayer,
    connected,
    room,
    scoreboard,
  } = state

  const healthFrac = playerHealth / maxPlayerHealth
  const playing = status === 'playing'
  const bossLabel = bossShielded ? 'SHIELDED' : bossEnraged ? 'ENRAGED' : 'BOSS'
  const currentRun: ScoreEntry | null =
    status === 'gameover' && outcome
      ? { score, kills, headshots, time, outcome, date: scores.find((s) => s.score === score && s.kills === kills && s.time === time)?.date ?? 0 }
      : null

  return (
    <div className="hud">
      {playing && <Crosshair />}
      {playing && reloading && <ReloadRing progress={reloadProgress} />}
      <HitMarker seq={hitMarkerSeq} variant="hit" />
      <HitMarker seq={headshotSeq} variant="head" />
      <HitMarker seq={killSeq} variant="kill" />
      {damageSeq > 0 && <div key={`d-${damageSeq}`} className="damage-flash show" aria-hidden />}

      {bannerSeq > 0 && status !== 'gameover' && (
        <div key={`b-${bannerSeq}`} className="banner" aria-hidden>
          {banner}
        </div>
      )}
      {toastSeq > 0 && playing && (
        <div key={`t-${toastSeq}`} className={`toast${toast.includes('HEADSHOT') ? ' headshot' : ''}`} aria-hidden>
          {toast}
        </div>
      )}

      {playing && damageBoost > 0 && (
        <div className="boost-badge" aria-hidden>
          ⚡ 2× DAMAGE · {damageBoost}s
        </div>
      )}

      {playing && multiplayer && <Scoreboard board={scoreboard} room={room} connected={connected} />}

      <div className="hud-corner hud-top">
        <div>
          <div className="stat-label">Time</div>
          <div className="stat-value big">{formatTime(time)}</div>
        </div>
        {!multiplayer && (
          <div>
            <div className="stat-label">Wave</div>
            <div className={`stat-value${bossActive ? ' boss' : ''}`}>
              {bossActive ? 'BOSS' : `${wave}/${totalWaves}`}
            </div>
          </div>
        )}
        {!multiplayer && (
          <div>
            <div className="stat-label">Score</div>
            <div className="stat-value">{score.toLocaleString()}</div>
          </div>
        )}
        <div>
          <div className="stat-label">{multiplayer ? 'Frags' : 'Kills'}</div>
          <div className="stat-value">{kills}</div>
        </div>
        <div>
          <div className="stat-label">HS</div>
          <div className="stat-value">{headshots}</div>
        </div>
        {!multiplayer && (
          <div>
            <div className="stat-label">Enemies</div>
            <div className="stat-value">{enemiesAlive}</div>
          </div>
        )}
      </div>

      {bossActive && (
        <div className="boss-bar-wrap">
          <div className={`boss-bar-label${bossShielded ? ' shielded' : ''}${bossEnraged ? ' enraged' : ''}`}>
            ◆ {bossLabel} ◆
          </div>
          <div className="boss-bar">
            <div
              className={`boss-bar-fill${bossShielded ? ' shielded' : ''}`}
              style={{ width: `${Math.max(0, bossHealthFrac) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="hud-corner hud-bottom-left">
        <div className="stat-label">Health</div>
        <div className="health-row">
          <div className="health-bar">
            <div
              className="health-fill"
              style={{ width: `${Math.max(0, healthFrac) * 100}%`, background: healthColor(healthFrac) }}
            />
          </div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {playerHealth}
          </div>
        </div>
      </div>

      <div className="hud-corner hud-bottom-right">
        <div className="weapon-name">{weapon}</div>
        <div className="ammo-line">
          <span className={`ammo-mag${ammo === 0 ? ' empty' : ''}`}>{ammo}</span>
          <span className="ammo-reserve">/ {reserve}</span>
        </div>
        {reloading ? (
          <div className="reload-status">
            <div className="reload-bar">
              <div className="reload-bar-fill" style={{ width: `${reloadProgress * 100}%` }} />
            </div>
            <span>Reloading…</span>
          </div>
        ) : (
          ammo === 0 && <div className="reload-hint">Press R to reload</div>
        )}
        {weapons.length > 1 && (
          <div className="weapon-strip">
            {weapons.map((w) => (
              <span key={w.id} className={`wchip${w.active ? ' active' : ''}`}>
                <b>{w.key}</b> {w.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Overlays */}
      {status === 'pointerlock-needed' && (
        <div className="overlay" onClick={onLock}>
          <div className="title-badge">First-Person Shooter</div>
          <h1>FPS ARENA</h1>
          <p className="subtitle">
            Survive {totalWaves} waves, grab weapon &amp; power-up drops, then beat the boss.
          </p>
          <div className="overlay-columns" onClick={(e) => e.stopPropagation()}>
            <div className="controls-grid">
              <span className="k"><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></span>
              <span className="d">Move</span>
              <span className="k"><kbd>Mouse</kbd></span>
              <span className="d">Look</span>
              <span className="k"><kbd>L-Click</kbd></span>
              <span className="d">Fire · headshots ×2.2</span>
              <span className="k"><kbd>1</kbd>–<kbd>4</kbd></span>
              <span className="d">Switch weapon</span>
              <span className="k"><kbd>Space</kbd></span>
              <span className="d">Jump</span>
              <span className="k"><kbd>R</kbd></span>
              <span className="d">Reload</span>
              <span className="k"><kbd>Esc</kbd></span>
              <span className="d">Pause</span>
            </div>
            <Leaderboard scores={scores} onClear={onClearScores} />
          </div>
          <MultiplayerPanel onStart={onStartMultiplayer} />
          <SettingsRow settings={settings} onToggleMusic={onToggleMusic} onToggleSfx={onToggleSfx} />
          <p className="hint">▶ Click anywhere to play solo (campaign)</p>
        </div>
      )}

      {status === 'paused' && (
        <div className="overlay" onClick={onLock}>
          <h2>Paused</h2>
          {multiplayer ? (
            <p>Room {room} · Frags {kills}</p>
          ) : (
            <p>
              Score {score.toLocaleString()} · Kills {kills} · {bossActive ? 'BOSS' : `Wave ${wave}/${totalWaves}`}
            </p>
          )}
          <SettingsRow settings={settings} onToggleMusic={onToggleMusic} onToggleSfx={onToggleSfx} />
          {multiplayer && (
            <button
              type="button"
              className="btn leave-btn"
              onClick={(e) => {
                e.stopPropagation()
                onLeaveRoom()
              }}
            >
              ⤺ Leave Room
            </button>
          )}
          <p className="hint">▶ Click to resume</p>
        </div>
      )}

      {status === 'gameover' && (
        <div className="overlay gameover">
          <div className="title-badge">
            {outcome === 'win' ? 'Boss defeated — you cleared the arena' : 'You were overrun'}
          </div>
          <h1 className={outcome === 'win' ? 'win' : 'lose'}>{outcome === 'win' ? 'VICTORY' : 'GAME OVER'}</h1>
          <div className="result-stats">
            <div>
              <div className="stat-label">Score</div>
              <div className="stat-value">{score.toLocaleString()}</div>
            </div>
            <div>
              <div className="stat-label">Kills</div>
              <div className="stat-value">{kills}</div>
            </div>
            <div>
              <div className="stat-label">Headshots</div>
              <div className="stat-value">{headshots}</div>
            </div>
            <div>
              <div className="stat-label">Time</div>
              <div className="stat-value">{formatTime(time)}</div>
            </div>
          </div>
          <Leaderboard scores={scores} highlight={currentRun} onClear={onClearScores} />
          <button className="btn" onClick={onRestart} type="button">
            ⟳ Play Again
          </button>
          <SettingsRow settings={settings} onToggleMusic={onToggleMusic} onToggleSfx={onToggleSfx} />
        </div>
      )}
    </div>
  )
}
