import type { Server } from 'socket.io'
import type { RoomManager } from './game/room.js'
import { socketToPlayer } from './session.js'
import { evaluateHand, HandCategory } from './game/handEvaluator.js'

const HAND_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High Card',
  [HandCategory.Pair]: 'One Pair',
  [HandCategory.TwoPair]: 'Two Pair',
  [HandCategory.ThreeOfAKind]: 'Three of a Kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full House',
  [HandCategory.FourOfAKind]: 'Four of a Kind',
  [HandCategory.StraightFlush]: 'Straight Flush',
}

export function broadcastRoomsList(io: Server, manager: RoomManager): void {
  io.emit('rooms_list', manager.listRooms())
}

export function broadcastGameState(io: Server, roomId: string, manager: RoomManager): void {
  const room = manager.getRoom(roomId)
  if (!room) return

  // Serialize slots: null slots become null in the array.
  const baseSlots = room.slots.map((p) => {
    if (!p) return null
    return {
      id: p.id,
      name: p.name,
      seat: p.seat,
      chips: p.chips,
      currentBet: p.currentBet,
      hasFolded: p.hasFolded,
      isAllIn: p.isAllIn,
      isSpectating: p.isSpectating,
      rebuyCount: p.rebuyCount,
      isReady: p.isReady,
    }
  })

  const pot = room.slots.reduce((sum, p) => sum + (p?.totalContributed ?? 0), 0)

  const baseState = {
    roomId: room.id,
    status: room.status,
    bettingRound: room.bettingRound,
    communityCards: room.communityCards,
    currentBetLevel: room.currentBetLevel,
    pot,
    currentTurnPlayerId: room.currentTurnPlayerId,
    lastHandResult: room.lastHandResult,
    slots: baseSlots,
    maxSeats: room.maxSeats,
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    turnTimeoutMs: room.turnTimeoutMs,
    defaultStartingChips: room.defaultStartingChips,
    ownerId: room.ownerId,
    // dealerIndex is a slot index — look up directly in slots array.
    dealerPlayerId: room.slots[room.dealerIndex]?.id ?? null,
    autoStartAt: room.autoStartAt,
    name: room.name,
  }

  // Send personalized state to each socket in this room (hole cards only to owner).
  for (const [sid, info] of socketToPlayer.entries()) {
    if (info.roomId !== roomId) continue
    const ownPlayer = room.slots.find((p) => p?.id === info.playerId)
    const personalizedState = {
      ...baseState,
      slots: baseSlots.map((p) => {
        if (!p) return null
        if (p.id === info.playerId && ownPlayer) {
          let handRank: string | undefined
          if (room.bettingRound === 'showdown' && !ownPlayer.hasFolded && !ownPlayer.isSpectating && ownPlayer.holeCards.length > 0) {
            const allCards = [...ownPlayer.holeCards, ...room.communityCards]
            if (allCards.length >= 5) handRank = HAND_NAMES[evaluateHand(allCards).category]
          }
          return { ...p, holeCards: ownPlayer.holeCards, handRank }
        }
        if (room.bettingRound === 'showdown') {
          const rp = room.slots.find((x) => x?.id === p.id)
          if (rp && !rp.hasFolded && !rp.isSpectating && rp.holeCards.length > 0) {
            const allCards = [...rp.holeCards, ...room.communityCards]
            const handRank = allCards.length >= 5
              ? HAND_NAMES[evaluateHand(allCards).category]
              : undefined
            return { ...p, holeCards: rp.holeCards, handRank }
          }
        }
        return p
      }),
    }
    io.to(sid).emit('game_state', personalizedState)
  }
}
