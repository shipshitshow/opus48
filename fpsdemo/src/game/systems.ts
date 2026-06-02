// The system registry. Each system receives (GameContext, GameSystems) and
// calls its siblings through `this.sys.<name>`. Type-only imports keep this a
// pure compile-time contract (no runtime import cycle).
import type { RenderSystem } from './render/RenderSystem'
import type { ArenaSystem } from './render/ArenaSystem'
import type { PlayerSystem } from './entities/PlayerSystem'
import type { WeaponSystem } from './entities/WeaponSystem'
import type { ProjectilesSystem } from './entities/ProjectilesSystem'
import type { PickupsSystem } from './entities/PickupsSystem'
import type { FxSystem } from './entities/FxSystem'
import type { PveDirectorSystem } from './modes/PveDirectorSystem'
import type { SurvivorsSystem } from './modes/SurvivorsSystem'
import type { MultiplayerSystem } from './modes/MultiplayerSystem'
import type { InputSystem } from './systems/InputSystem'
import type { HudSystem } from './systems/HudSystem'
import type { GameOverSystem } from './modes/GameOverSystem'

export interface GameSystems {
  render: RenderSystem
  arena: ArenaSystem
  player: PlayerSystem
  weapon: WeaponSystem
  projectiles: ProjectilesSystem
  pickups: PickupsSystem
  fx: FxSystem
  pve: PveDirectorSystem
  survivors: SurvivorsSystem
  multiplayer: MultiplayerSystem
  input: InputSystem
  hud: HudSystem
  gameOver: GameOverSystem
}
