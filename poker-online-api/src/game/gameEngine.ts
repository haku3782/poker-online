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

// Returns non-null players in slot order (slot 0 → slot N-1).
function seatOrder(room: Room): Player[] {
  return room.slots.filter((p): p is Player => p !== null)
}

// Returns all non-folded, non-spectating players.
function activePlayers(room: Room): Player[] {
  return room.slots.filter((p): p is Player => p !== null && !p.hasFolded && !p.isSpectating)
}

// Returns players who can still place a bet (not folded, not all-in, not spectating).
function playersWhoCanAct(room: Room): Player[] {
  return room.slots.filter((p): p is Player => p !== null && !p.hasFolded && !p.isAllIn && !p.isSpectating)
}

// Finds the next non-null, non-spectating slot index starting after `fromSlot`.
// `fromSlot` may be -1 (initial state) — iteration wraps correctly.
function nextActiveSlot(room: Room, fromSlot: number): number {
  for (let i = 1; i <= room.slots.length; i++) {
    const idx = (fromSlot + i) % room.slots.length
    const p = room.slots[idx]
    if (p && !p.isSpectating) return idx
  }
  throw new Error('No active slot found')
}

// Finds the first player (by predicate) clockwise after `afterSlot`. Returns their id or null.
function firstToActAfter(room: Room, afterSlot: number, predicate: (p: Player) => boolean): string | null {
  for (let i = 1; i <= room.slots.length; i++) {
    const idx = (afterSlot + i) % room.slots.length
    const p = room.slots[idx]
    if (p && predicate(p)) return p.id
  }
  return null
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
  room.playersToAct = room.slots
    .filter((p): p is Player => p !== null && p.id !== raiserId && !p.hasFolded && !p.isAllIn && !p.isSpectating)
    .map((p) => p.id)
}

export function startHand(room: Room, forceSpectating?: Set<string>): void {
  for (const player of room.slots) {
    if (!player) continue
    player.isSpectating = player.chips === 0 || (forceSpectating?.has(player.id) ?? false)
  }

  const active = room.slots.filter((p): p is Player => p !== null && !p.isSpectating)
  if (active.length < 2) {
    throw new Error('At least 2 players are required to start a hand')
  }

  for (const player of room.slots) {
    if (!player) continue
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
  room.status = 'playing'

  // Advance dealer to next active slot (room.dealerIndex is a slot index; -1 on first hand).
  room.dealerIndex = nextActiveSlot(room, room.dealerIndex)

  // Heads-up: dealer posts small blind.
  const isHeadsUp = active.length === 2
  const sbSlot = isHeadsUp ? room.dealerIndex : nextActiveSlot(room, room.dealerIndex)
  const bbSlot = nextActiveSlot(room, sbSlot)

  postBlind(room.slots[sbSlot]!, room.smallBlind)
  postBlind(room.slots[bbSlot]!, room.bigBlind)
  room.currentBetLevel = room.bigBlind

  for (const player of active) {
    player.holeCards = [room.deck.pop()!, room.deck.pop()!]
  }

  room.playersToAct = playersWhoCanAct(room).map((p) => p.id)
  room.currentTurnPlayerId = firstToActAfter(room, bbSlot, (p) => !p.hasFolded && !p.isAllIn && !p.isSpectating)
  if (room.currentTurnPlayerId === null) {
    // All players are all-in from blinds — run out remaining streets automatically.
    advanceHandState(room)
  }
}

export function applyAction(room: Room, playerId: string, action: PlayerAction): void {
  if (room.currentTurnPlayerId !== playerId) {
    throw new Error("It is not this player's turn")
  }
  const player = room.slots.find((p) => p?.id === playerId)
  if (!player) {
    throw new Error('Player not found in room')
  }

  switch (action.type) {
    case 'fold':
      player.hasFolded = true
      room.playersToAct = room.playersToAct.filter((id) => id !== playerId)
      break

    case 'check':
      if (player.currentBet !== room.currentBetLevel) {
        throw new Error('Cannot check when facing a bet')
      }
      room.playersToAct = room.playersToAct.filter((id) => id !== playerId)
      break

    case 'call': {
      const owed = Math.min(room.currentBetLevel - player.currentBet, player.chips)
      payIntoPot(player, owed)
      room.playersToAct = room.playersToAct.filter((id) => id !== playerId)
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
        room.playersToAct = room.playersToAct.filter((id) => id !== playerId)
      }
      break
    }

    default:
      throw new Error(`Unknown action type: ${(action as PlayerAction).type}`)
  }

  advanceHandState(room)
}

function advanceHandState(room: Room): void {
  const remaining = activePlayers(room)
  if (remaining.length === 1) {
    finishHandBySingleWinner(room, remaining[0])
    return
  }

  if (room.playersToAct.length > 0) {
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
  const currentSlot = room.slots.findIndex((p) => p?.id === room.currentTurnPlayerId)
  for (let i = 1; i <= room.slots.length; i++) {
    const idx = (currentSlot + i) % room.slots.length
    const p = room.slots[idx]
    if (p && room.playersToAct.includes(p.id)) return p.id
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

  for (const player of room.slots) {
    if (player) player.currentBet = 0
  }
  room.currentBetLevel = 0

  const actable = playersWhoCanAct(room)
  if (actable.length < 2) {
    // Nobody left can bet — run out remaining streets to showdown.
    if (room.bettingRound === 'river') {
      finishHandAtShowdown(room)
    } else {
      advanceToNextStreet(room)
    }
    return
  }

  room.playersToAct = actable.map((p) => p.id)
  room.currentTurnPlayerId = firstToActAfter(room, room.dealerIndex, (p) => !p.hasFolded && !p.isAllIn && !p.isSpectating)
  if (room.currentTurnPlayerId === null) {
    finishHandAtShowdown(room)
  }
}

function finishHandBySingleWinner(room: Room, winner: Player): void {
  const potTotal = room.slots.reduce((sum, p) => sum + (p?.totalContributed ?? 0), 0)
  winner.chips += potTotal
  room.lastHandResult = { pots: [{ amount: potTotal, winnerIds: [winner.id] }] }
  endHand(room)
}

function finishHandAtShowdown(room: Room): void {
  const nonNullPlayers = room.slots.filter((p): p is Player => p !== null)
  const pots = calculateSidePots(nonNullPlayers)
  const results = awardPots(pots, nonNullPlayers, room.communityCards)
  room.lastHandResult = { pots: results }
  endHand(room)
}

function endHand(room: Room): void {
  room.bettingRound = 'showdown'
  room.currentTurnPlayerId = null
  room.playersToAct = []
}

// Fold a player regardless of turn order (used for disconnect / timeout).
export function forfeitPlayer(room: Room, playerId: string): void {
  if (room.status !== 'playing' || room.bettingRound === 'showdown') return
  const player = room.slots.find((p) => p?.id === playerId)
  if (!player || player.hasFolded || player.isSpectating) return

  player.hasFolded = true
  room.playersToAct = room.playersToAct.filter((id) => id !== playerId)

  if (room.currentTurnPlayerId === playerId) {
    advanceHandState(room)
  } else {
    const remaining = activePlayers(room)
    if (remaining.length === 1) {
      finishHandBySingleWinner(room, remaining[0])
    } else if (room.playersToAct.length === 0) {
      room.bettingRound === 'river' ? finishHandAtShowdown(room) : advanceToNextStreet(room)
    }
  }
}
