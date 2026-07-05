import type { Card } from './card.js'

export interface Player {
  id: string
  name: string
  seat: number
  chips: number
  holeCards: Card[]
  currentBet: number
  totalContributed: number
  hasFolded: boolean
  isAllIn: boolean
  isSpectating: boolean
  rebuyCount: number
  isReady: boolean
}

export function createPlayer(id: string, name: string, seat: number, chips: number): Player {
  return {
    id,
    name,
    seat,
    chips,
    holeCards: [],
    currentBet: 0,
    totalContributed: 0,
    hasFolded: false,
    isAllIn: false,
    isSpectating: false,
    rebuyCount: 0,
    isReady: false,
  }
}
