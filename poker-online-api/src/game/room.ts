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
  maxSeats: number
  players: Player[]
  status: RoomStatus
  smallBlind: number
  bigBlind: number

  deck: Card[]
  communityCards: Card[]
  bettingRound: BettingRound
  // Index into the seat-ordered players array (not a literal seat number).
  // Rotates by one position each hand among the players seated at the time.
  dealerIndex: number
  currentTurnPlayerId: string | null
  currentBetLevel: number
  playersToAct: Set<string>
  lastHandResult: HandResult | null
}

export interface RoomSummary {
  id: string
  playerCount: number
  maxSeats: number
  status: RoomStatus
}

const DEFAULT_STARTING_CHIPS = 1000

export class RoomManager {
  private rooms = new Map<string, Room>()

  createRoom(options: { maxSeats?: number; smallBlind?: number; bigBlind?: number } = {}): Room {
    const room: Room = {
      id: crypto.randomUUID(),
      maxSeats: options.maxSeats ?? 6,
      players: [],
      status: 'waiting',
      smallBlind: options.smallBlind ?? 10,
      bigBlind: options.bigBlind ?? 20,
      deck: [],
      communityCards: [],
      bettingRound: 'preflop',
      // -1 so the first call to startHand() rotates it to 0 (no special-casing
      // "is this the first hand" needed: indexAfter(n, -1) === 0).
      dealerIndex: -1,
      currentTurnPlayerId: null,
      currentBetLevel: 0,
      playersToAct: new Set(),
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
      playerCount: room.players.length,
      maxSeats: room.maxSeats,
      status: room.status
    }))
  }

  joinRoom(roomId: string, playerName: string, startingChips = DEFAULT_STARTING_CHIPS): Player {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')
    if (room.players.length >= room.maxSeats) throw new Error('Room is full')

    const takenSeats = new Set(room.players.map((p) => p.seat))
    let seat = 0
    while (takenSeats.has(seat)) seat++

    const player = createPlayer(crypto.randomUUID(), playerName, seat, startingChips)
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
