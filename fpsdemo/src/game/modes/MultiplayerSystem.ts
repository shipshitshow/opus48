import * as THREE from 'three'
import { audio } from '../../audio/AudioEngine'
import { NetClient, type HitMessage, type RemotePlayerInfo } from '../../net/NetClient'
import type { PlayerAvatarId } from '../../net/playerAvatars'
import { RemoteAvatar } from '../../net/RemoteAvatar'
import { PLAYER_HEIGHT, WEAPONS } from '../constants'
import { DEFAULT_MAP_ID, getMap } from '../data/maps'
import type { GameContext } from '../context'
import type { GameSystems } from '../systems'

export class MultiplayerSystem {
  // Multiplayer
  net: NetClient | null = null
  connected = false
  roomName = ''
  playerName = 'Player'
  playerAvatar: PlayerAvatarId = 'ranger'
  remotePlayers = new Map<string, RemoteAvatar>()
  _euler = new THREE.Euler(0, 0, 0, 'YXZ')

  constructor(private ctx: GameContext, private sys: GameSystems) {}

  startMultiplayer(room: string, name: string, avatar: PlayerAvatarId = 'ranger') {
    this.leaveMultiplayer(false) // tear down any prior session/avatars first
    this.ctx.campaignStage = 0
    this.sys.arena.buildArena(getMap(DEFAULT_MAP_ID)) // PvP always uses the default arena
    this.sys.player.resetPlayer()
    this.ctx.multiplayer = true
    this.connected = false
    this.roomName = room
    this.playerName = name || 'Player'
    this.playerAvatar = avatar
    this.ctx.kills = 0

    // Disable the PvE campaign.
    for (const e of this.ctx.enemies) e.kill()
    this.sys.pve.waveActive = false
    this.sys.pve.bossActive = false
    this.sys.pve.bossEnemy = null
    this.sys.pve.waveBreakTimer = 1e9
    this.sys.projectiles.clearProjectiles()
    while (this.sys.pickups.pickups.length) this.sys.pickups.removePickup(this.sys.pickups.pickups.length - 1)

    this.net = new NetClient({
      onStatus: (c) => {
        this.connected = c
        this.sys.hud.emit()
      },
      onWelcome: (selfId, players) => {
        for (const p of players) {
          if (p.id === selfId) this.ctx.camera.position.set(p.x, PLAYER_HEIGHT, p.z)
          else this.addRemote(p)
        }
        this.sys.hud.emit()
      },
      onJoin: (p) => {
        this.addRemote(p)
        this.sys.hud.emit()
      },
      onLeave: (id) => {
        this.removeRemote(id)
        this.sys.hud.emit()
      },
      onState: (id, x, y, z, yaw, weapon, health) => {
        const r = this.remotePlayers.get(id)
        if (r) {
          r.setTarget(x, y, z, yaw)
          if (typeof health === 'number') r.setHealth(health)
        }
      },
      onName: (id, nm, remoteAvatar, slot) => {
        const r = this.remotePlayers.get(id)
        if (r) {
          r.setMeta(nm, r.kills, remoteAvatar, slot)
          this.sys.hud.emit()
        }
      },
      onHit: (msg) => this.onNetHit(msg),
    })
    this.net.connect(room, this.playerName, this.playerAvatar)

    this.ctx.status = 'pointerlock-needed'
    this.sys.hud.emit()
    this.sys.input.requestLock()
  }

  /** Leave the room. If toMenu, return to the solo start menu. */
  leaveMultiplayer(toMenu = true) {
    if (this.net) {
      this.net.disconnect()
      this.net = null
    }
    for (const r of this.remotePlayers.values()) {
      this.ctx.scene.remove(r.group)
      this.ctx.raycastTargets = this.ctx.raycastTargets.filter((o) => !r.hitMeshes.includes(o as THREE.Mesh))
      r.dispose()
    }
    this.remotePlayers.clear()
    this.ctx.multiplayer = false
    this.connected = false
    this.roomName = ''
    if (toMenu) {
      this.sys.player.resetPlayer()
      this.sys.pve.startWaveSystem()
      this.ctx.status = 'pointerlock-needed'
      this.sys.hud.emit()
    }
  }

  addRemote(info: RemotePlayerInfo) {
    if (!this.net || info.id === this.net.selfId || this.remotePlayers.has(info.id)) return
    const avatar = new RemoteAvatar(info)
    this.ctx.scene.add(avatar.group)
    this.ctx.raycastTargets.push(...avatar.hitMeshes)
    this.remotePlayers.set(info.id, avatar)
  }

  removeRemote(id: string) {
    const r = this.remotePlayers.get(id)
    if (!r) return
    this.ctx.scene.remove(r.group)
    this.ctx.raycastTargets = this.ctx.raycastTargets.filter((o) => !r.hitMeshes.includes(o as THREE.Mesh))
    r.dispose()
    this.remotePlayers.delete(id)
  }

  onNetHit(msg: HitMessage) {
    const selfId = this.net?.selfId
    if (msg.target === selfId) {
      this.ctx.health = msg.health
      this.sys.hud.damageSeq++
      audio.sfx('hurt')
      if (msg.killed && msg.respawn) {
        this.ctx.camera.position.set(msg.respawn.x, PLAYER_HEIGHT, msg.respawn.z)
        this.ctx.velocity.set(0, 0, 0)
        this.sys.hud.showToast(`☠ Fragged by ${msg.byName}`)
      }
    } else {
      const r = this.remotePlayers.get(msg.target)
      if (r) {
        r.setHealth(msg.health)
        if (msg.killed && msg.respawn) {
          r.group.position.set(msg.respawn.x, 0, msg.respawn.z)
          r.setTarget(msg.respawn.x, PLAYER_HEIGHT, msg.respawn.z, 0)
        }
      }
    }
    if (msg.by === selfId) {
      this.ctx.kills = msg.killerKills
      if (msg.killed) {
        this.sys.hud.killSeq++
        this.sys.hud.showToast('FRAG!')
        audio.sfx('kill')
      }
    } else {
      const rk = this.remotePlayers.get(msg.by)
      if (rk) rk.setMeta(rk.name, msg.killerKills)
    }
    this.sys.hud.emit()
  }

  updateMultiplayer(delta: number) {
    const quat = this.ctx.camera.quaternion
    for (const r of this.remotePlayers.values()) r.update(delta, quat, this.ctx.camera.position)
    if (this.net) {
      this._euler.setFromQuaternion(quat, 'YXZ')
      this.net.sendState(
        this.ctx.camera.position.x,
        this.ctx.camera.position.y,
        this.ctx.camera.position.z,
        this._euler.y,
        WEAPONS[this.ctx.activeWeapon].name,
        Math.round(this.ctx.health),
      )
    }
  }

  buildScoreboard() {
    const board = [
      { id: 'self', name: this.playerName, kills: this.ctx.kills, health: Math.round(this.ctx.health), you: true },
      ...[...this.remotePlayers.values()].map((r) => ({
        id: r.id,
        name: r.name,
        kills: r.kills,
        health: Math.round(r.health),
        you: false,
      })),
    ]
    board.sort((a, b) => b.kills - a.kills)
    return board
  }
}
