import { describe, expect, it } from 'vitest'
import type { Card, Rank, Suit } from './card.js'
import { createPlayer } from './player.js'
import { awardPots, calculateSidePots } from './sidePots.js'

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit }
}

describe('calculateSidePots', () => {
  it('returns a single pot when everyone contributed equally', () => {
    const players = [
      { ...createPlayer('a', 'Alice', 0, 0), totalContributed: 100 },
      { ...createPlayer('b', 'Bob', 1, 0), totalContributed: 100 },
      { ...createPlayer('c', 'Carol', 2, 0), totalContributed: 100 }
    ]
    const pots = calculateSidePots(players)
    expect(pots).toEqual([{ amount: 300, eligiblePlayerIds: ['a', 'b', 'c'] }])
  })

  it('splits into a main pot and a side pot when one player is all-in for less', () => {
    // Carol went all-in for 50; Alice and Bob both put in 100.
    const players = [
      { ...createPlayer('a', 'Alice', 0, 0), totalContributed: 100 },
      { ...createPlayer('b', 'Bob', 1, 0), totalContributed: 100 },
      { ...createPlayer('c', 'Carol', 2, 0), totalContributed: 50 }
    ]
    const pots = calculateSidePots(players)
    expect(pots).toEqual([
      { amount: 150, eligiblePlayerIds: ['a', 'b', 'c'] },
      { amount: 100, eligiblePlayerIds: ['a', 'b'] }
    ])
  })

  it('excludes folded players from eligibility but keeps their chips in the pot', () => {
    const players = [
      { ...createPlayer('a', 'Alice', 0, 0), totalContributed: 100 },
      { ...createPlayer('b', 'Bob', 1, 0), totalContributed: 100, hasFolded: true },
      { ...createPlayer('c', 'Carol', 2, 0), totalContributed: 100 }
    ]
    const pots = calculateSidePots(players)
    expect(pots).toEqual([{ amount: 300, eligiblePlayerIds: ['a', 'c'] }])
  })
})

describe('awardPots', () => {
  const community: Card[] = [
    card(2, 'clubs'), card(7, 'diamonds'), card(9, 'hearts'), card(11, 'spades'), card(4, 'clubs')
  ]

  it('awards the whole pot to the single eligible player', () => {
    const alice = { ...createPlayer('a', 'Alice', 0, 0), holeCards: [card(14, 'spades'), card(13, 'spades')] }
    const results = awardPots([{ amount: 100, eligiblePlayerIds: ['a'] }], [alice], community)
    expect(results).toEqual([{ amount: 100, winnerIds: ['a'] }])
    expect(alice.chips).toBe(100)
  })

  it('awards the pot to the best hand among eligible players', () => {
    const alice = {
      ...createPlayer('a', 'Alice', 0, 0),
      holeCards: [card(14, 'clubs'), card(14, 'diamonds')]
    }
    const bob = {
      ...createPlayer('b', 'Bob', 1, 0),
      holeCards: [card(3, 'spades'), card(5, 'hearts')]
    }
    const results = awardPots(
      [{ amount: 200, eligiblePlayerIds: ['a', 'b'] }],
      [alice, bob],
      community
    )
    expect(results).toEqual([{ amount: 200, winnerIds: ['a'] }])
    expect(alice.chips).toBe(200)
    expect(bob.chips).toBe(0)
  })

  it('splits a tied pot evenly, giving the odd chip to the first winner', () => {
    // Both hole-card pairs play the board identically (same community straight),
    // so it's a genuine chop.
    const tieCommunity: Card[] = [
      card(10, 'clubs'), card(11, 'diamonds'), card(12, 'hearts'), card(13, 'spades'), card(14, 'clubs')
    ]
    const alice = { ...createPlayer('a', 'Alice', 0, 0), holeCards: [card(2, 'spades'), card(3, 'hearts')] }
    const bob = { ...createPlayer('b', 'Bob', 1, 0), holeCards: [card(4, 'spades'), card(5, 'hearts')] }
    const results = awardPots(
      [{ amount: 101, eligiblePlayerIds: ['a', 'b'] }],
      [alice, bob],
      tieCommunity
    )
    expect(results).toEqual([{ amount: 101, winnerIds: ['a', 'b'] }])
    expect(alice.chips).toBe(51)
    expect(bob.chips).toBe(50)
  })
})
