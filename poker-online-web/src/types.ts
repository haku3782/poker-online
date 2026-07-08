export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14

export interface Card {
  rank: Rank
  suit: Suit
}

export type RoomStatus = 'waiting' | 'playing'
export type BettingRound = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export interface PlayerView {
  id: string
  name: string
  seat: number
  chips: number
  currentBet: number
  hasFolded: boolean
  isAllIn: boolean
  isSpectating: boolean
  rebuyCount: number
  isReady: boolean
  holeCards?: Card[]
}

export interface PotResult {
  amount: number
  winnerIds: string[]
}

export interface HandResult {
  pots: PotResult[]
}

export interface GameState {
  roomId: string
  status: RoomStatus
  bettingRound: BettingRound
  communityCards: Card[]
  currentBetLevel: number
  pot: number
  currentTurnPlayerId: string | null
  lastHandResult: HandResult | null
  players: PlayerView[]
  maxSeats: number
  smallBlind: number
  bigBlind: number
  turnTimeoutMs: number
  defaultStartingChips: number
  ownerId: string
  dealerPlayerId: string | null
}

export interface RoomSummary {
  id: string
  playerCount: number
  maxSeats: number
  status: RoomStatus
}
