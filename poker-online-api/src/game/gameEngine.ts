import { createDeck, shuffle } from './card.js'
import type { Player } from './player.js'
import type { BettingRound, Room } from './room.js'
import { awardPots, calculateSidePots } from './sidePots.js'

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin'

export interface PlayerAction {
  type: ActionType
  // Total bet level the player wants to reach (required for 'raise').
  amount?: number
}

const STREET_ORDER: BettingRound[] = ['preflop', 'flop', 'turn', 'river']

function seatOrder(room: Room): Player[] {
  return [...room.players].sort((a, b) => a.seat - b.seat)
}

function indexAfter(count: number, index: number): number {
  return (index + 1) % count
}

function activePlayers(room: Room): Player[] {
  return room.players.filter((p) => !p.hasFolded)
}

function playersWhoCanAct(room: Room): Player[] {
  return room.players.filter((p) => !p.hasFolded && !p.isAllIn)
}

function firstToActAfter(room: Room, afterIndex: number, predicate: (p: Player) => boolean): string {
  const ordered = seatOrder(room)
  for (let offset = 1; offset <= ordered.length; offset++) {
    const candidate = ordered[(afterIndex + offset) % ordered.length]
    if (predicate(candidate)) return candidate.id
  }
  throw new Error('No eligible player found')
}

function postBlind(player: Player, amount: number): void {
  const paid = Math.min(amount, player.chips)
  player.chips -= paid
  player.currentBet = paid
  player.totalContributed = paid
  if (player.chips === 0) player.isAllIn = true
}

function payIntoPot(player: Player, amount: number): void {
  player.chips -= amount
  player.currentBet += amount
  player.totalContributed += amount
  if (player.chips === 0) player.isAllIn = true
}

function reopenActionAfterRaise(room: Room, raiserId: string): void {
  room.playersToAct = new Set(
    room.players.filter((p) => p.id !== raiserId && !p.hasFolded && !p.isAllIn).map((p) => p.id)
  )
}

export function startHand(room: Room): void {
  const players = seatOrder(room)
  if (players.length < 2) {
    throw new Error('At least 2 players are required to start a hand')
  }

  for (const player of players) {
    player.holeCards = []
    player.currentBet = 0
    player.totalContributed = 0
    player.hasFolded = false
    player.isAllIn = false
  }

  room.communityCards = []
  room.deck = shuffle(createDeck())
  room.bettingRound = 'preflop'
  room.lastHandResult = null
  room.dealerIndex = indexAfter(players.length, room.dealerIndex)
  room.status = 'playing'

  // Heads-up is the one case where the dealer posts the small blind.
  const isHeadsUp = players.length === 2
  const smallBlindIndex = isHeadsUp ? room.dealerIndex : indexAfter(players.length, room.dealerIndex)
  const bigBlindIndex = indexAfter(players.length, smallBlindIndex)

  postBlind(players[smallBlindIndex], room.smallBlind)
  postBlind(players[bigBlindIndex], room.bigBlind)
  room.currentBetLevel = room.bigBlind

  for (const player of players) {
    player.holeCards = [room.deck.pop()!, room.deck.pop()!]
  }

  room.playersToAct = new Set(playersWhoCanAct(room).map((p) => p.id))
  room.currentTurnPlayerId = firstToActAfter(room, bigBlindIndex, (p) => !p.hasFolded && !p.isAllIn)
}

export function applyAction(room: Room, playerId: string, action: PlayerAction): void {
  if (room.currentTurnPlayerId !== playerId) {
    throw new Error("It is not this player's turn")
  }
  const player = room.players.find((p) => p.id === playerId)
  if (!player) {
    throw new Error('Player not found in room')
  }

  switch (action.type) {
    case 'fold':
      player.hasFolded = true
      room.playersToAct.delete(playerId)
      break

    case 'check':
      if (player.currentBet !== room.currentBetLevel) {
        throw new Error('Cannot check when facing a bet')
      }
      room.playersToAct.delete(playerId)
      break

    case 'call': {
      const owed = Math.min(room.currentBetLevel - player.currentBet, player.chips)
      payIntoPot(player, owed)
      room.playersToAct.delete(playerId)
      break
    }

    case 'raise': {
      const target = action.amount
      if (target === undefined || target <= room.currentBetLevel) {
        throw new Error('Raise amount must exceed the current bet level')
      }
      payIntoPot(player, Math.min(target - player.currentBet, player.chips))
      room.currentBetLevel = player.currentBet
      reopenActionAfterRaise(room, playerId)
      break
    }

    case 'allin': {
      payIntoPot(player, player.chips)
      if (player.currentBet > room.currentBetLevel) {
        room.currentBetLevel = player.currentBet
        reopenActionAfterRaise(room, playerId)
      } else {
        room.playersToAct.delete(playerId)
      }
      break
    }
  }

  advanceHandState(room)
}

function advanceHandState(room: Room): void {
  const remaining = activePlayers(room)
  if (remaining.length === 1) {
    finishHandBySingleWinner(room, remaining[0])
    return
  }

  if (room.playersToAct.size > 0) {
    room.currentTurnPlayerId = nextPlayerToAct(room)
    return
  }

  if (room.bettingRound === 'river') {
    finishHandAtShowdown(room)
    return
  }

  advanceToNextStreet(room)
}

function nextPlayerToAct(room: Room): string {
  const ordered = seatOrder(room)
  const currentIndex = ordered.findIndex((p) => p.id === room.currentTurnPlayerId)
  for (let offset = 1; offset <= ordered.length; offset++) {
    const candidate = ordered[(currentIndex + offset) % ordered.length]
    if (room.playersToAct.has(candidate.id)) {
      return candidate.id
    }
  }
  throw new Error('No player left to act')
}

function advanceToNextStreet(room: Room): void {
  const nextRound = STREET_ORDER[STREET_ORDER.indexOf(room.bettingRound) + 1]
  room.bettingRound = nextRound

  const dealCount = nextRound === 'flop' ? 3 : 1
  for (let i = 0; i < dealCount; i++) {
    room.communityCards.push(room.deck.pop()!)
  }

  for (const player of room.players) {
    player.currentBet = 0
  }
  room.currentBetLevel = 0

  const actable = playersWhoCanAct(room)
  if (actable.length < 2) {
    // Nobody left can bet (everyone's all-in or folded out) — deal straight
    // through the remaining streets to showdown instead of waiting on action.
    if (room.bettingRound === 'river') {
      finishHandAtShowdown(room)
    } else {
      advanceToNextStreet(room)
    }
    return
  }

  room.playersToAct = new Set(actable.map((p) => p.id))
  room.currentTurnPlayerId = firstToActAfter(room, room.dealerIndex, (p) => !p.hasFolded && !p.isAllIn)
}

function finishHandBySingleWinner(room: Room, winner: Player): void {
  const potTotal = room.players.reduce((sum, p) => sum + p.totalContributed, 0)
  winner.chips += potTotal
  room.lastHandResult = { pots: [{ amount: potTotal, winnerIds: [winner.id] }] }
  endHand(room)
}

function finishHandAtShowdown(room: Room): void {
  const pots = calculateSidePots(room.players)
  const results = awardPots(pots, room.players, room.communityCards)
  room.lastHandResult = { pots: results }
  endHand(room)
}

function endHand(room: Room): void {
  room.bettingRound = 'showdown'
  room.currentTurnPlayerId = null
  room.playersToAct = new Set()
  room.status = 'waiting'
}
