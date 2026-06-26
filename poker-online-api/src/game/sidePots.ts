import type { Card } from './card.js'
import { compareHands, evaluateHand } from './handEvaluator.js'
import type { Player } from './player.js'
import type { PotResult } from './room.js'

export interface SidePot {
  amount: number
  eligiblePlayerIds: string[]
}

// Splits the hand's total contributions into one main pot plus a side pot per
// distinct all-in amount, so a player who went all-in for less only competes
// for the portion of the pot they actually funded.
export function calculateSidePots(players: Player[]): SidePot[] {
  const contributors = players.filter((p) => p.totalContributed > 0)
  const levels = [...new Set(contributors.map((p) => p.totalContributed))].sort((a, b) => a - b)

  const pots: SidePot[] = []
  let previousLevel = 0
  for (const level of levels) {
    const layerSize = level - previousLevel
    const layerContributors = contributors.filter((p) => p.totalContributed >= level)
    const amount = layerSize * layerContributors.length
    const eligiblePlayerIds = layerContributors.filter((p) => !p.hasFolded).map((p) => p.id)
    if (amount > 0) {
      pots.push({ amount, eligiblePlayerIds })
    }
    previousLevel = level
  }
  return pots
}

// Evaluates each pot's eligible players' best hand, splits ties evenly, and
// hands any odd leftover chips to the earliest winner(s). Mutates player.chips.
export function awardPots(pots: SidePot[], players: Player[], communityCards: Card[]): PotResult[] {
  const playerById = new Map(players.map((p) => [p.id, p]))
  const results: PotResult[] = []

  for (const pot of pots) {
    const eligiblePlayers = pot.eligiblePlayerIds.map((id) => playerById.get(id)!)
    if (eligiblePlayers.length === 0) continue

    const evaluations = eligiblePlayers.map((player) => ({
      player,
      hand: evaluateHand([...player.holeCards, ...communityCards])
    }))

    let winners = [evaluations[0]]
    for (const evaluation of evaluations.slice(1)) {
      const cmp = compareHands(evaluation.hand, winners[0].hand)
      if (cmp > 0) winners = [evaluation]
      else if (cmp === 0) winners.push(evaluation)
    }

    const share = Math.floor(pot.amount / winners.length)
    const remainder = pot.amount - share * winners.length
    winners.forEach((winner, index) => {
      winner.player.chips += share + (index < remainder ? 1 : 0)
    })

    results.push({ amount: pot.amount, winnerIds: winners.map((w) => w.player.id) })
  }

  return results
}
