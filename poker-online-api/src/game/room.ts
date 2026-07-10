import type { Card } from './card.js'
import type { Player } from './player.js'
import { createPlayer } from './player.js'

export type RoomStatus = 'waiting' | 'playing'
export type BettingRound = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export interface PotResult {
  amount: number
  winnerIds: string[]
}

export interface HandResult {
  pots: PotResult[]
}

export interface Room {
  id: string
  name: string
  maxSeats: number
  smallBlind: number
  bigBlind: number
  turnTimeoutMs: number
  defaultStartingChips: number
  // Fixed-size array (length = maxSeats). Slot index is the permanent seat position.
  // null means the seat is empty.
  slots: (Player | null)[]
  status: RoomStatus
  ownerId: string

  deck: Card[]
  communityCards: Card[]
  bettingRound: BettingRound
  // Slot index (0 to maxSeats-1) of the current dealer. -1 before the first hand.
  dealerIndex: number
  currentTurnPlayerId: string | null
  currentBetLevel: number
  playersToAct: string[]
  lastHandResult: HandResult | null
  autoStartAt?: number
}

export interface RoomSummary {
  id: string
  name: string
  playerCount: number
  maxSeats: number
  status: RoomStatus
}

export class RoomManager {
  private rooms = new Map<string, Room>()

  createRoom(options: {
    name?: string
    maxSeats?: number
    smallBlind?: number
    bigBlind?: number
    turnTimeoutMs?: number
    defaultStartingChips?: number
  } = {}): Room {
    const maxSeats = options.maxSeats ?? 6
    const smallBlind = options.smallBlind ?? 10
    const bigBlind = options.bigBlind ?? 20
    const turnTimeoutMs = options.turnTimeoutMs ?? 30_000
    const defaultStartingChips = options.defaultStartingChips ?? 1000

    if (!Number.isInteger(maxSeats) || maxSeats < 2 || maxSeats > 10)
      throw new Error('maxSeats must be an integer between 2 and 10')
    if (!Number.isInteger(smallBlind) || smallBlind < 1)
      throw new Error('smallBlind must be a positive integer')
    if (!Number.isInteger(bigBlind) || bigBlind < smallBlind)
      throw new Error('bigBlind must be an integer >= smallBlind')
    if (turnTimeoutMs !== 0 && (!Number.isInteger(turnTimeoutMs) || turnTimeoutMs < 5000))
      throw new Error('turnTimeoutMs must be 0 (disabled) or an integer >= 5000')
    if (!Number.isInteger(defaultStartingChips) || defaultStartingChips < bigBlind * 2)
      throw new Error('defaultStartingChips must be an integer >= bigBlind * 2')

    const room: Room = {
      id: crypto.randomUUID(),
      name: options.name?.trim() || 'Room',
      maxSeats,
      smallBlind,
      bigBlind,
      turnTimeoutMs,
      defaultStartingChips,
      slots: Array(maxSeats).fill(null) as (Player | null)[],
      status: 'waiting',
      ownerId: '',
      deck: [],
      communityCards: [],
      bettingRound: 'preflop',
      dealerIndex: -1,
      currentTurnPlayerId: null,
      currentBetLevel: 0,
      playersToAct: [],
      lastHandResult: null
    }
    this.rooms.set(room.id, room)
    return room
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId)
  }

  listRooms(): RoomSummary[] {
    return [...this.rooms.values()].map((room) => ({
      id: room.id,
      name: room.name,
      playerCount: room.slots.filter(Boolean).length,
      maxSeats: room.maxSeats,
      status: room.status
    }))
  }

  joinRoom(roomId: string, playerName: string, chips?: number): Player {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')
    const slotIndex = room.slots.findIndex(s => s === null)
    if (slotIndex === -1) throw new Error('Room is full')

    const player = createPlayer(crypto.randomUUID(), playerName, slotIndex, chips ?? room.defaultStartingChips)
    player.isSpectating = room.status === 'playing'
    room.slots[slotIndex] = player
    return player
  }

  leaveRoom(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return
    const idx = room.slots.findIndex(p => p?.id === playerId)
    if (idx !== -1) room.slots[idx] = null
    if (room.slots.every(s => s === null)) {
      this.rooms.delete(roomId)
    }
  }
}
