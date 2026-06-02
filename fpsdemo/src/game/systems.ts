// The system registry scaffold. Concrete system files are not present yet, so
// keep these entries opaque until the extraction lands.
type PendingSystem = unknown

export interface GameSystems {
  render: PendingSystem
  arena: PendingSystem
  player: PendingSystem
  weapon: PendingSystem
  projectiles: PendingSystem
  pickups: PendingSystem
  fx: PendingSystem
  pve: PendingSystem
  survivors: PendingSystem
  multiplayer: PendingSystem
  input: PendingSystem
  hud: PendingSystem
  gameOver: PendingSystem
}
