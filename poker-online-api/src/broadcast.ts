import type { Server } from 'socket.io'
import type { RoomManager } from './game/room.js'
import { socketToPlayer } from './session.js'

export function broadcastRoomsList(io: Server, manager: RoomManager): void {
  io.emit('rooms_list', manager.listRooms())
}

export function broadcastGameState(io: Server, roomId: string, manager: RoomManager): void {
  const room = manager.getRoom(roomId)
  if (!room) return

  const basePlayers = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    chips: p.chips,
    currentBet: p.currentBet,
    hasFolded: p.hasFolded,
    isAllIn: p.isAllIn,
    isSpectating: p.isSpectating,
    rebuyCount: p.rebuyCount,
  }))

  const pot = room.players.reduce((sum, p) => sum + p.totalContributed, 0)

  const baseState = {
    roomId: room.id,
    status: room.status,
    bettingRound: room.bettingRound,
    communityCards: room.communityCards,
    currentBetLevel: room.currentBetLevel,
    pot,
    currentTurnPlayerId: room.currentTurnPlayerId,
    lastHandResult: room.lastHandResult,
    players: basePlayers,
    maxSeats: room.maxSeats,
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    turnTimeoutMs: room.turnTimeoutMs,
    defaultStartingChips: room.defaultStartingChips,
  }

  // Send personalized state to each socket in this room (hole cards only to owner)
  for (const [sid, info] of socketToPlayer.entries()) {
    if (info.roomId !== roomId) continue
    const ownPlayer = room.players.find((p) => p.id === info.playerId)
    const personalizedState = {
      ...baseState,
      players: basePlayers.map((p) => {
        if (p.id === info.playerId && ownPlayer) {
          return { ...p, holeCards: ownPlayer.holeCards }
        }
        return p
      }),
    }
    io.to(sid).emit('game_state', personalizedState)
  }
}
