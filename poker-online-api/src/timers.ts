import type { Server } from 'socket.io'
import { applyAction, startHand } from './game/gameEngine.js'
import type { RoomManager } from './game/room.js'
import { broadcastGameState, broadcastRoomsList } from './broadcast.js'

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>()
const nextHandTimers = new Map<string, ReturnType<typeof setTimeout>>()

const NEXT_HAND_DELAY_MS = 5000

export function clearTurnTimer(roomId: string): void {
  const t = turnTimers.get(roomId)
  if (t !== undefined) {
    clearTimeout(t)
    turnTimers.delete(roomId)
  }
}

export function clearNextHandTimer(roomId: string, manager: RoomManager): void {
  const t = nextHandTimers.get(roomId)
  if (t !== undefined) {
    clearTimeout(t)
    nextHandTimers.delete(roomId)
  }
  const room = manager.getRoom(roomId)
  if (room) room.autoStartAt = undefined
}

export function hasNextHandTimer(roomId: string): boolean {
  return nextHandTimers.has(roomId)
}

export function setNextHandTimer(io: Server, roomId: string, manager: RoomManager): void {
  clearNextHandTimer(roomId, manager)
  const room = manager.getRoom(roomId)
  if (!room || room.bettingRound !== 'showdown') return

  room.autoStartAt = Date.now() + NEXT_HAND_DELAY_MS
  const t = setTimeout(() => {
    nextHandTimers.delete(roomId)
    const r = manager.getRoom(roomId)
    if (!r || r.bettingRound !== 'showdown') return
    r.autoStartAt = undefined
    try {
      startHand(r)
      broadcastGameState(io, roomId, manager)
      setTurnTimer(io, roomId, manager)
      broadcastRoomsList(io, manager)
    } catch {
      // Not enough players with chips — broadcast so clients clear the countdown ring
      broadcastGameState(io, roomId, manager)
    }
  }, NEXT_HAND_DELAY_MS)
  nextHandTimers.set(roomId, t)
}

export function setTurnTimer(io: Server, roomId: string, manager: RoomManager): void {
  clearTurnTimer(roomId)
  const room = manager.getRoom(roomId)
  if (!room || room.status !== 'playing' || room.bettingRound === 'showdown' || !room.currentTurnPlayerId) return
  if (room.turnTimeoutMs === 0) return

  const playerId = room.currentTurnPlayerId
  const t = setTimeout(() => {
    turnTimers.delete(roomId)
    const r = manager.getRoom(roomId)
    if (!r || r.currentTurnPlayerId !== playerId) return
    try {
      applyAction(r, playerId, { type: 'fold' })
      if (r.bettingRound === 'showdown') {
        setNextHandTimer(io, roomId, manager)
      } else {
        setTurnTimer(io, roomId, manager)
      }
      broadcastGameState(io, roomId, manager)
    } catch {
      // hand may have ended between timer set and fire
    }
  }, room.turnTimeoutMs)
  turnTimers.set(roomId, t)
}
