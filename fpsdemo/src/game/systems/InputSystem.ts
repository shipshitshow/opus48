import type { GameContext } from '../context'
import type { GameSystems } from '../systems'
import { JUMP_VELOCITY, WEAPON_ORDER } from '../constants'

export class InputSystem {
  lockRetry = 0

  constructor(private ctx: GameContext, private sys: GameSystems) {}

  // ------------------------------------------------------------------- events

  bindEvents() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('mousedown', this.onMouseDown)
    document.addEventListener('mouseup', this.onMouseUp)
    document.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('resize', this.onResize)
    this.ctx.controls.addEventListener('lock', this.onLock)
    this.ctx.controls.addEventListener('unlock', this.onUnlock)
  }

  removeListeners() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('mousedown', this.onMouseDown)
    document.removeEventListener('mouseup', this.onMouseUp)
    document.removeEventListener('contextmenu', this.onContextMenu)
    window.removeEventListener('resize', this.onResize)
    this.ctx.controls.removeEventListener('lock', this.onLock)
    this.ctx.controls.removeEventListener('unlock', this.onUnlock)
  }

  onContextMenu = (e: Event) => {
    if (this.ctx.status === 'playing') e.preventDefault() // right-click = melee, no menu
  }

  onKeyDown = (e: KeyboardEvent) => {
    // While paused, Esc resumes the game (re-acquires pointer lock).
    if (this.ctx.status === 'paused' && e.code === 'Escape') {
      e.preventDefault()
      this.requestLock()
      return
    }
    if (this.ctx.status !== 'playing') return
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.ctx.move.forward = true
        break
      case 'KeyS':
      case 'ArrowDown':
        this.ctx.move.back = true
        break
      case 'KeyA':
      case 'ArrowLeft':
        this.ctx.move.left = true
        break
      case 'KeyD':
      case 'ArrowRight':
        this.ctx.move.right = true
        break
      case 'Space':
        e.preventDefault()
        if (this.ctx.canJump) {
          this.ctx.velocity.y = JUMP_VELOCITY
          this.ctx.canJump = false
        }
        break
      case 'KeyR':
        this.sys.weapon.startReload()
        break
      case 'KeyF':
      case 'KeyV':
        this.sys.weapon.tryMelee()
        break
      case 'Digit1':
        this.sys.weapon.switchWeapon(WEAPON_ORDER[0])
        break
      case 'Digit2':
        this.sys.weapon.switchWeapon(WEAPON_ORDER[1])
        break
      case 'Digit3':
        this.sys.weapon.switchWeapon(WEAPON_ORDER[2])
        break
      case 'Digit4':
        this.sys.weapon.switchWeapon(WEAPON_ORDER[3])
        break
    }
  }

  onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.ctx.move.forward = false
        break
      case 'KeyS':
      case 'ArrowDown':
        this.ctx.move.back = false
        break
      case 'KeyA':
      case 'ArrowLeft':
        this.ctx.move.left = false
        break
      case 'KeyD':
      case 'ArrowRight':
        this.ctx.move.right = false
        break
    }
  }

  onMouseDown = (e: MouseEvent) => {
    if (!this.ctx.controls.isLocked || this.ctx.status !== 'playing') return
    if (e.button === 2) {
      this.sys.weapon.tryMelee() // right-click = melee
      return
    }
    if (e.button !== 0) return
    this.ctx.firing = true
    this.ctx.triggerQueued = true
  }

  onMouseUp = (e: MouseEvent) => {
    if (e.button !== 0) return
    this.ctx.firing = false
  }

  onResize = () => {
    if (this.ctx.disposed) return
    const w = this.ctx.container.clientWidth
    const h = this.ctx.container.clientHeight
    this.ctx.camera.aspect = w / h
    this.ctx.camera.updateProjectionMatrix()
    this.ctx.renderer.setSize(w, h)
  }

  onLock = () => {
    if (this.ctx.status === 'pointerlock-needed' || this.ctx.status === 'paused') {
      this.ctx.status = 'playing'
      this.sys.hud.emit()
    }
  }

  onUnlock = () => {
    if (this.ctx.status === 'playing') {
      this.ctx.status = 'paused'
      this.ctx.firing = false
      this.ctx.move.forward = this.ctx.move.back = this.ctx.move.left = this.ctx.move.right = false
      this.sys.hud.emit()
    }
  }

  requestLock() {
    if (this.ctx.status !== 'pointerlock-needed' && this.ctx.status !== 'paused') return
    this.lockPointer()
  }

  lockPointer(allowRetry = true) {
    try {
      const res: unknown = this.ctx.renderer.domElement.requestPointerLock()
      if (res && typeof (res as Promise<void>).catch === 'function') {
        ;(res as Promise<void>).catch(() => this.scheduleLockRetry(allowRetry))
      }
    } catch {
      // Browsers impose a short cooldown after Esc exits pointer lock, during
      // which requestPointerLock fails. Retry once after the cooldown clears.
      this.scheduleLockRetry(allowRetry)
    }
  }

  scheduleLockRetry(allowRetry: boolean) {
    if (!allowRetry || this.ctx.status !== 'paused') return
    window.clearTimeout(this.lockRetry)
    this.lockRetry = window.setTimeout(() => {
      if (this.ctx.status === 'paused') this.lockPointer(false)
    }, 1300)
  }
}
