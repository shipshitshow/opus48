import PartySocket from 'partysocket'

export interface RemotePlayerInfo {
  id: string
  name: string
  x: number
  y: number
  z: number
  yaw: number
  weapon: string
  health: number
  kills: number
}

export interface HitMessage {
  target: string
  by: string
  byName: string
  health: number
  killed: boolean
  killerKills: number
  respawn: { x: number; y: number; z: number } | null
}

export interface NetEvents {
  onWelcome: (selfId: string, players: RemotePlayerInfo[]) => void
  onJoin: (p: RemotePlayerInfo) => void
  onLeave: (id: string) => void
  onState: (id: string, x: number, y: number, z: number, yaw: number, weapon: string, health: number) => void
  onName: (id: string, name: string) => void
  onHit: (msg: HitMessage) => void
  onStatus: (connected: boolean) => void
}

/** Default PartyKit host: local `partykit dev` in dev, env-configured in prod. */
export const PARTYKIT_HOST: string =
  (import.meta.env.VITE_PARTYKIT_HOST as string | undefined) || (import.meta.env.DEV ? 'localhost:1999' : '')

export class NetClient {
  socket: PartySocket | null = null
  selfId = ''
  private events: NetEvents
  private lastSent = 0

  constructor(events: NetEvents) {
    this.events = events
  }

  connect(room: string, name: string, host: string = PARTYKIT_HOST) {
    this.socket = new PartySocket({ host, room, party: 'main' })
    this.socket.addEventListener('open', () => {
      this.events.onStatus(true)
      this.rawSend({ t: 'join', name })
    })
    this.socket.addEventListener('close', () => this.events.onStatus(false))
    this.socket.addEventListener('message', (e: MessageEvent) => this.onMessage(e.data as string))
  }

  private onMessage(data: string) {
    let m: { t?: string; [k: string]: unknown }
    try {
      m = JSON.parse(data)
    } catch {
      return
    }
    switch (m.t) {
      case 'welcome':
        this.selfId = String(m.id)
        this.events.onWelcome(this.selfId, (m.players as RemotePlayerInfo[]) ?? [])
        break
      case 'join':
        this.events.onJoin(m.player as RemotePlayerInfo)
        break
      case 'leave':
        this.events.onLeave(String(m.id))
        break
      case 'state':
        this.events.onState(
          String(m.id),
          Number(m.x),
          Number(m.y),
          Number(m.z),
          Number(m.yaw),
          String(m.weapon ?? 'Rifle'),
          Number(m.health ?? 100),
        )
        break
      case 'name':
        this.events.onName(String(m.id), String(m.name))
        break
      case 'hit':
        this.events.onHit(m as unknown as HitMessage)
        break
    }
  }

  /** Throttled to ~22 Hz; safe to call every frame. */
  sendState(x: number, y: number, z: number, yaw: number, weapon: string, health: number) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - this.lastSent < 45) return
    this.lastSent = now
    this.rawSend({ t: 'state', x, y, z, yaw, weapon, health })
  }

  sendHit(target: string, dmg: number) {
    this.rawSend({ t: 'hit', target, dmg })
  }

  private rawSend(obj: unknown) {
    if (this.socket && this.socket.readyState === 1) this.socket.send(JSON.stringify(obj))
  }

  disconnect() {
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }
}
