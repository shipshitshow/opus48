import { useEffect, useState } from 'react'
import type { HUDState } from '../game/types'
import type { ScoreEntry, Settings, ShopState } from '../game/storage'
import { SHOP_UPGRADES, shopCost } from '../game/survivors'

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
  onStartCampaign: () => void
  onStartSurvivors: () => void
  onPickUpgrade: (id: string) => void
  onMenu: () => void
  shop: ShopState
  lastRunGold: number
  onBuyShop: (id: string) => void
}

function Shop({ shop, onBuy }: { shop: ShopState; onBuy: (id: string) => void }) {
  return (
    <div className="shop-panel" onClick={(e) => e.stopPropagation()}>
      <div className="shop-head">
        <span className="shop-title">🛒 Survivors Upgrade Shop</span>
        <span className="shop-gold">💰 {shop.gold.toLocaleString()}</span>
      </div>
      <div className="shop-grid">
        {SHOP_UPGRADES.map((u) => {
          const tier = shop.tiers[u.id] ?? 0
          const maxed = tier >= u.max
          const cost = shopCost(u, tier)
          const afford = shop.gold >= cost
          return (
            <div key={u.id} className={`shop-item${maxed ? ' maxed' : ''}`}>
              <div className="shop-icon">{u.icon}</div>
              <div className="shop-info">
                <div className="shop-name">
                  {u.name} <span className="shop-tier">{tier}/{u.max}</span>
                </div>
                <div className="shop-desc">{u.desc}</div>
              </div>
              <button
                type="button"
                className="shop-buy"
                disabled={maxed || !afford}
                onClick={() => onBuy(u.id)}
              >
                {maxed ? 'MAX' : `💰 ${cost}`}
              </button>
            </div>
          )
        })}
      </div>
      <div className="shop-note">Permanent — applies to every Survivors run. Earn gold by surviving.</div>
    </div>
  )
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

function SurvivorsHud({ state }: { state: HUDState }) {
  const frac = state.xpToNext > 0 ? state.xp / state.xpToNext : 0
  return (
    <>
      <div className="xp-wrap" aria-hidden>
        <div className="xp-level">LV {state.level}</div>
        <div className="xp-bar">
          <div className="xp-fill" style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} />
        </div>
        <div className="xp-num">
          {state.xp}/{state.xpToNext}
        </div>
      </div>
      {state.build.length > 0 && (
        <div className="build-strip" aria-hidden>
          {state.build.map((b) => (
            <span key={b.id} className="build-chip" title={b.name}>
              {b.icon}
              <b>{b.level}</b>
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function LevelUpDraft({ state, onPick }: { state: HUDState; onPick: (id: string) => void }) {
  return (
    <div className="overlay levelup">
      <div className="title-badge">Level {state.level} — choose an upgrade</div>
      <h2 className="levelup-title">LEVEL UP!</h2>
      <div className="cards">
        {state.choices.map((c) => (
          <button key={c.id} type="button" className="card" onClick={() => onPick(c.id)}>
            <div className="card-icon">{c.icon}</div>
            <div className="card-name">{c.name}</div>
            <div className="card-lvl">{c.level === 0 ? 'NEW' : `Lv ${c.level} → ${c.level + 1}`}</div>
            <div className="card-desc">{c.desc}</div>
          </button>
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
    survivors,
  } = state

  type MenuScreen = 'home' | 'modes' | 'survivor' | 'multiplayer' | 'shop' | 'settings' | 'leaderboard'
  const [menuScreen, setMenuScreen] = useState<MenuScreen>('home')
  // Reset to the root menu whenever the menu is (re)shown.
  useEffect(() => {
    if (status === 'pointerlock-needed') setMenuScreen('home')
  }, [status])
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
      {playing && survivors && <SurvivorsHud state={state} />}

      <div className="hud-corner hud-top">
        <div>
          <div className="stat-label">Time</div>
          <div className="stat-value big">{formatTime(time)}</div>
        </div>
        {!multiplayer && !survivors && (
          <div>
            <div className="stat-label">Wave</div>
            <div className={`stat-value${bossActive ? ' boss' : ''}`}>
              {bossActive ? 'BOSS' : `${wave}/${totalWaves}`}
            </div>
          </div>
        )}
        {survivors && (
          <div>
            <div className="stat-label">Level</div>
            <div className="stat-value">{state.level}</div>
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
        {survivors ? (
          <div className="ammo-line">
            <span className="ammo-mag inf">∞</span>
          </div>
        ) : (
          <div className="ammo-line">
            <span className={`ammo-mag${ammo === 0 ? ' empty' : ''}`}>{ammo}</span>
            <span className="ammo-reserve">/ {reserve}</span>
          </div>
        )}
        {!survivors &&
          (reloading ? (
            <div className="reload-status">
              <div className="reload-bar">
                <div className="reload-bar-fill" style={{ width: `${reloadProgress * 100}%` }} />
              </div>
              <span>Reloading…</span>
            </div>
          ) : (
            ammo === 0 && <div className="reload-hint">Press R to reload</div>
          ))}
        <div className="melee-hint">🔪 R-Click / F</div>
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
      {status === 'levelup' && <LevelUpDraft state={state} onPick={onPickUpgrade} />}

      {status === 'pointerlock-needed' && (
        <div className="overlay menu">
          <h1>FPS ARENA</h1>

          {menuScreen === 'home' && (
            <div className="menu-screen">
              <div className="big-choices">
                <button type="button" className="big-btn" onClick={() => setMenuScreen('modes')}>
                  <div className="bb-icon">🎮</div>
                  <div className="bb-name">Modes</div>
                  <div className="bb-sub">Campaign · Survivors · Multiplayer</div>
                </button>
                <button type="button" className="big-btn" onClick={() => setMenuScreen('leaderboard')}>
                  <div className="bb-icon">🏆</div>
                  <div className="bb-name">Leaderboard</div>
                  <div className="bb-sub">Top runs</div>
                </button>
                <button type="button" className="big-btn" onClick={() => setMenuScreen('settings')}>
                  <div className="bb-icon">⚙️</div>
                  <div className="bb-name">Settings</div>
                  <div className="bb-sub">Music · SFX</div>
                </button>
              </div>
            </div>
          )}

          {menuScreen === 'modes' && (
            <div className="menu-screen">
              <button type="button" className="back-btn" onClick={() => setMenuScreen('home')}>← Back</button>
              <div className="menu-heading">Choose a Mode</div>
              <div className="mode-cards">
                <button type="button" className="mode-card campaign" onClick={onStartCampaign}>
                  <div className="mc-icon">🎯</div>
                  <div className="mc-name">Campaign</div>
                  <div className="mc-desc">Survive {totalWaves} waves of bots, grab weapon &amp; power-up drops, then beat the boss.</div>
                </button>
                <button type="button" className="mode-card survivors" onClick={() => setMenuScreen('survivor')}>
                  <div className="mc-icon">🧛</div>
                  <div className="mc-name">Survivors</div>
                  <div className="mc-desc">Endless escalating swarms. Kill, level up, and draft upgrades into broken combos.</div>
                </button>
                <button type="button" className="mode-card mp" onClick={() => setMenuScreen('multiplayer')}>
                  <div className="mc-icon">⚔</div>
                  <div className="mc-name">Multiplayer</div>
                  <div className="mc-desc">PvP arena rooms. Share a code and fight friends online.</div>
                </button>
              </div>
              <div className="controls-mini">
                <kbd>WASD</kbd> Move · <kbd>Mouse</kbd> Look · <kbd>L-Click</kbd> Fire · <kbd>R-Click</kbd>/<kbd>F</kbd> Melee ·{' '}
                <kbd>1–4</kbd> Weapon · <kbd>Space</kbd> Jump · <kbd>R</kbd> Reload · <kbd>Esc</kbd> Pause
              </div>
            </div>
          )}

          {menuScreen === 'survivor' && (
            <div className="menu-screen">
              <button type="button" className="back-btn" onClick={() => setMenuScreen('modes')}>← Back</button>
              <div className="menu-heading">🧛 Survivors</div>
              <div className="big-choices">
                <button type="button" className="big-btn play" onClick={onStartSurvivors}>
                  <div className="bb-icon">▶</div>
                  <div className="bb-name">Play</div>
                  <div className="bb-sub">Start a run</div>
                </button>
                <button type="button" className="big-btn" onClick={() => setMenuScreen('shop')}>
                  <div className="bb-icon">🛒</div>
                  <div className="bb-name">Shop</div>
                  <div className="bb-sub">💰 {shop.gold.toLocaleString()} gold</div>
                </button>
              </div>
            </div>
          )}

          {menuScreen === 'shop' && (
            <div className="menu-screen">
              <button type="button" className="back-btn" onClick={() => setMenuScreen('survivor')}>← Back</button>
              <Shop shop={shop} onBuy={onBuyShop} />
            </div>
          )}

          {menuScreen === 'multiplayer' && (
            <div className="menu-screen">
              <button type="button" className="back-btn" onClick={() => setMenuScreen('modes')}>← Back</button>
              <MultiplayerPanel onStart={onStartMultiplayer} />
            </div>
          )}

          {menuScreen === 'settings' && (
            <div className="menu-screen">
              <button type="button" className="back-btn" onClick={() => setMenuScreen('home')}>← Back</button>
              <div className="menu-heading">⚙️ Settings</div>
              <SettingsRow settings={settings} onToggleMusic={onToggleMusic} onToggleSfx={onToggleSfx} />
            </div>
          )}

          {menuScreen === 'leaderboard' && (
            <div className="menu-screen">
              <button type="button" className="back-btn" onClick={() => setMenuScreen('home')}>← Back</button>
              <div className="menu-heading">🏆 Leaderboard</div>
              <Leaderboard scores={scores} onClear={onClearScores} />
            </div>
          )}
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
          {survivors && lastRunGold > 0 && (
            <div className="gold-earned">💰 +{lastRunGold.toLocaleString()} gold earned · spend it in the Shop</div>
          )}
          <Leaderboard scores={scores} highlight={currentRun} onClear={onClearScores} />
          <div className="gameover-buttons">
            <button className="btn" onClick={onRestart} type="button">
              ⟳ Play Again
            </button>
            <button className="btn ghost" onClick={onMenu} type="button">
              ☰ Main Menu
            </button>
          </div>
          <SettingsRow settings={settings} onToggleMusic={onToggleMusic} onToggleSfx={onToggleSfx} />
        </div>
      )}
    </div>
  )
}
