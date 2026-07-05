export const RECONNECT_TIMEOUT_MS = 60_000

export const socketToPlayer = new Map<string, { roomId: string; playerId: string }>()
export const sessionTokens = new Map<string, { roomId: string; playerId: string }>()
export const playerToToken = new Map<string, string>()
export const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function playerKey(roomId: string, playerId: string): string {
  return `${roomId}:${playerId}`
}

export function cancelReconnectTimer(token: string): void {
  const t = reconnectTimers.get(token)
  if (t !== undefined) {
    clearTimeout(t)
    reconnectTimers.delete(token)
  }
}

export function deleteSession(token: string, roomId: string, playerId: string): void {
  cancelReconnectTimer(token)
  sessionTokens.delete(token)
  playerToToken.delete(playerKey(roomId, playerId))
}
