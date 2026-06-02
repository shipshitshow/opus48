export type PlayerAvatarId = 'ranger' | 'heavy' | 'scout' | 'medic'

export interface PlayerAvatarOption {
  id: PlayerAvatarId
  name: string
  role: string
}

export const PLAYER_AVATAR_OPTIONS: PlayerAvatarOption[] = [
  { id: 'ranger', name: 'Ranger', role: 'Balanced trooper' },
  { id: 'heavy', name: 'Bulwark', role: 'Heavy armor' },
  { id: 'scout', name: 'Vector', role: 'Slim scout' },
  { id: 'medic', name: 'Patch', role: 'Support rig' },
]

export const PLAYER_SLOT_COLORS = [0x35e0ff, 0xff4dcb, 0xffb02e, 0x39d353, 0x9b5cff, 0xff3b6b]

export function normalizePlayerAvatar(value: unknown): PlayerAvatarId {
  return PLAYER_AVATAR_OPTIONS.some((a) => a.id === value) ? (value as PlayerAvatarId) : 'ranger'
}

export function playerColorHex(slot: number | undefined, fallbackKey: string): number {
  if (typeof slot === 'number' && Number.isFinite(slot) && slot > 0) {
    return PLAYER_SLOT_COLORS[(slot - 1) % PLAYER_SLOT_COLORS.length]
  }

  let h = 0
  for (let i = 0; i < fallbackKey.length; i++) h = (h * 31 + fallbackKey.charCodeAt(i)) % PLAYER_SLOT_COLORS.length
  return PLAYER_SLOT_COLORS[h]
}
