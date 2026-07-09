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
  players: Player[]
  status: RoomStatus
  ownerId: string

  deck: Card[]
  communityCards: Card[]
  bettingRound: BettingRound
  // Index into the seat-ordered players array (not a literal seat number).
  // Rotates by one position each hand among the players seated at the time.
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
      players: [],
      status: 'waiting',
      ownerId: '',
      deck: [],
      communityCards: [],
      bettingRound: 'preflop',
      // -1 so the first call to startHand() rotates it to 0 (no special-casing
      // "is this the first hand" needed: indexAfter(n, -1) === 0).
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
      playerCount: room.players.length,
      maxSeats: room.maxSeats,
      status: room.status
    }))
  }

  joinRoom(roomId: string, playerName: string, chips?: number): Player {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')
    if (room.players.length >= room.maxSeats) throw new Error('Room is full')

    const takenSeats = new Set(room.players.map((p) => p.seat))
    let seat = 0
    while (takenSeats.has(seat)) seat++

    const player = createPlayer(crypto.randomUUID(), playerName, seat, chips ?? room.defaultStartingChips)
    player.isSpectating = room.status === 'playing'
    room.players.push(player)
    room.players.sort((a, b) => a.seat - b.seat)
    return player
  }

  leaveRoom(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return
    room.players = room.players.filter((p) => p.id !== playerId)
    if (room.players.length === 0) {
      this.rooms.delete(roomId)
    }
  }
}
