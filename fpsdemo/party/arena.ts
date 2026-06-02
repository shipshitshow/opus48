import type * as Party from 'partykit/server'

// Authoritative-ish PvP arena room. Clients own their own transform; the server
// owns health / kills / respawns so those can't desync between peers.

interface PlayerState {
  id: string
  name: string
  avatar: string
  slot: number
  x: number
  y: number
  z: number
  yaw: number
  weapon: string
  health: number
  kills: number
  alive: boolean
  joined: boolean
}

const SPAWN_MIN = 18
const SPAWN_MAX = 34

function spawnPoint(): { x: number; z: number } {
  const a = Math.random() * Math.PI * 2
  const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN)
  return { x: Math.cos(a) * r, z: Math.sin(a) * r }
}

function avatarId(value: unknown): string {
  const id = String(value ?? 'ranger')
  return ['ranger', 'heavy', 'scout', 'medic'].includes(id) ? id : 'ranger'
}

export default class Arena implements Party.Server {
  players = new Map<string, PlayerState>()

  constructor(readonly room: Party.Room) {}

  private nextSlot(): number {
    const used = new Set([...this.players.values()].map((p) => p.slot))
    for (let slot = 1; slot < 99; slot++) {
      if (!used.has(slot)) return slot
    }
    return used.size + 1
  }

  onConnect(conn: Party.Connection) {
    const sp = spawnPoint()
    const p: PlayerState = {
      id: conn.id,
      name: 'Player',
      avatar: 'ranger',
      slot: this.nextSlot(),
      x: sp.x,
      y: 1.8,
      z: sp.z,
      yaw: 0,
      weapon: 'Rifle',
      health: 100,
      kills: 0,
      alive: true,
      joined: false,
    }
    this.players.set(conn.id, p)
    const visiblePlayers = [...this.players.values()].filter((player) => player.id === conn.id || player.joined)
    conn.send(JSON.stringify({ t: 'welcome', id: conn.id, players: visiblePlayers }))
  }

  onMessage(raw: string, sender: Party.Connection) {
    let m: { t?: string; [k: string]: unknown }
    try {
      m = JSON.parse(raw)
    } catch {
      return
    }
    const p = this.players.get(sender.id)
    if (!p) return

    if (m.t === 'join') {
      p.name = String(m.name ?? 'Player').slice(0, 16) || 'Player'
      p.avatar = avatarId(m.avatar)
      const wasJoined = p.joined
      p.joined = true
      if (!wasJoined) this.room.broadcast(JSON.stringify({ t: 'join', player: p }), [sender.id])
      this.room.broadcast(JSON.stringify({ t: 'name', id: p.id, name: p.name, avatar: p.avatar, slot: p.slot }))
    } else if (m.t === 'state') {
      p.x = Number(m.x) || 0
      p.y = Number(m.y) || 1.8
      p.z = Number(m.z) || 0
      p.yaw = Number(m.yaw) || 0
      if (typeof m.weapon === 'string') p.weapon = m.weapon
      this.room.broadcast(
        JSON.stringify({ t: 'state', id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, weapon: p.weapon, health: p.health }),
        [sender.id],
      )
    } else if (m.t === 'hit') {
      const target = this.players.get(String(m.target))
      const dmg = Number(m.dmg) || 0
      if (!target || !target.alive || dmg <= 0 || target.id === p.id) return
      target.health = Math.max(0, target.health - dmg)
      let killed = false
      let respawn: { x: number; y: number; z: number } | null = null
      if (target.health <= 0) {
        killed = true
        p.kills += 1
        const s = spawnPoint()
        target.x = s.x
        target.y = 1.8
        target.z = s.z
        target.health = 100
        target.alive = true
        respawn = { x: target.x, y: target.y, z: target.z }
      }
      this.room.broadcast(
        JSON.stringify({
          t: 'hit',
          target: target.id,
          by: p.id,
          byName: p.name,
          health: target.health,
          killed,
          killerKills: p.kills,
          respawn,
        }),
      )
    }
  }

  onClose(conn: Party.Connection) {
    this.players.delete(conn.id)
    this.room.broadcast(JSON.stringify({ t: 'leave', id: conn.id }))
  }
}
