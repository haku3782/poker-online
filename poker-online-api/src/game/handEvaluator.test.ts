import { describe, expect, it } from 'vitest'
import type { Card, Rank, Suit } from './card.js'
import { HandCategory, compareHands, evaluateHand } from './handEvaluator.js'

function c(rank: Rank, suit: Suit): Card {
  return { rank, suit }
}

describe('evaluateHand category detection', () => {
  it('detects high card', () => {
    const hand = evaluateHand([
      c(14, 'spades'), c(9, 'hearts'), c(7, 'clubs'), c(4, 'diamonds'), c(2, 'hearts')
    ])
    expect(hand.category).toBe(HandCategory.HighCard)
    expect(hand.ranks).toEqual([14, 9, 7, 4, 2])
  })

  it('detects a pair', () => {
    const hand = evaluateHand([
      c(9, 'spades'), c(9, 'hearts'), c(7, 'clubs'), c(4, 'diamonds'), c(2, 'hearts')
    ])
    expect(hand.category).toBe(HandCategory.Pair)
    expect(hand.ranks).toEqual([9, 7, 4, 2])
  })

  it('detects two pair, ordered by the higher pair first', () => {
    const hand = evaluateHand([
      c(4, 'spades'), c(4, 'hearts'), c(9, 'clubs'), c(9, 'diamonds'), c(2, 'hearts')
    ])
    expect(hand.category).toBe(HandCategory.TwoPair)
    expect(hand.ranks).toEqual([9, 4, 2])
  })

  it('detects three of a kind', () => {
    const hand = evaluateHand([
      c(6, 'spades'), c(6, 'hearts'), c(6, 'clubs'), c(4, 'diamonds'), c(2, 'hearts')
    ])
    expect(hand.category).toBe(HandCategory.ThreeOfAKind)
    expect(hand.ranks).toEqual([6, 4, 2])
  })

  it('detects a straight', () => {
    const hand = evaluateHand([
      c(9, 'spades'), c(8, 'hearts'), c(7, 'clubs'), c(6, 'diamonds'), c(5, 'hearts')
    ])
    expect(hand.category).toBe(HandCategory.Straight)
    expect(hand.ranks).toEqual([9])
  })

  it('detects the wheel (A-2-3-4-5) as a 5-high straight', () => {
    const hand = evaluateHand([
      c(14, 'spades'), c(2, 'hearts'), c(3, 'clubs'), c(4, 'diamonds'), c(5, 'hearts')
    ])
    expect(hand.category).toBe(HandCategory.Straight)
    expect(hand.ranks).toEqual([5])
  })

  it('does not mistake a non-consecutive run for a straight', () => {
    const hand = evaluateHand([
      c(9, 'spades'), c(8, 'hearts'), c(7, 'clubs'), c(6, 'diamonds'), c(2, 'hearts')
    ])
    expect(hand.category).toBe(HandCategory.HighCard)
  })

  it('detects a flush', () => {
    const hand = evaluateHand([
      c(9, 'hearts'), c(7, 'hearts'), c(5, 'hearts'), c(3, 'hearts'), c(2, 'hearts')
    ])
    expect(hand.category).toBe(HandCategory.Flush)
    expect(hand.ranks).toEqual([9, 7, 5, 3, 2])
  })

  it('detects a full house', () => {
    const hand = evaluateHand([
      c(6, 'spades'), c(6, 'hearts'), c(6, 'clubs'), c(4, 'diamonds'), c(4, 'hearts')
    ])
    expect(hand.category).toBe(HandCategory.FullHouse)
    expect(hand.ranks).toEqual([6, 4])
  })

  it('detects four of a kind', () => {
    const hand = evaluateHand([
      c(6, 'spades'), c(6, 'hearts'), c(6, 'clubs'), c(6, 'diamonds'), c(4, 'hearts')
    ])
    expect(hand.category).toBe(HandCategory.FourOfAKind)
    expect(hand.ranks).toEqual([6, 4])
  })

  it('detects a straight flush', () => {
    const hand = evaluateHand([
      c(9, 'hearts'), c(8, 'hearts'), c(7, 'hearts'), c(6, 'hearts'), c(5, 'hearts')
    ])
    expect(hand.category).toBe(HandCategory.StraightFlush)
    expect(hand.ranks).toEqual([9])
  })

  it('detects a royal flush as the highest straight flush', () => {
    const hand = evaluateHand([
      c(14, 'spades'), c(13, 'spades'), c(12, 'spades'), c(11, 'spades'), c(10, 'spades')
    ])
    expect(hand.category).toBe(HandCategory.StraightFlush)
    expect(hand.ranks).toEqual([14])
  })
})

describe('evaluateHand with 6-7 cards (hole + community)', () => {
  it('picks the best 5-card hand out of 7', () => {
    // Hole: pair of aces. Board completes trip aces plus an unrelated pair —
    // the best 5 should be the full house, not just the pair of aces.
    const hand = evaluateHand([
      c(14, 'spades'), c(14, 'hearts'),
      c(14, 'clubs'), c(9, 'diamonds'), c(9, 'hearts'), c(3, 'clubs'), c(2, 'diamonds')
    ])
    expect(hand.category).toBe(HandCategory.FullHouse)
    expect(hand.ranks).toEqual([14, 9])
  })

  it('ignores cards that would weaken the best hand', () => {
    // A flush is available among 7 cards even though some cards break the suit.
    const hand = evaluateHand([
      c(9, 'hearts'), c(2, 'clubs'),
      c(7, 'hearts'), c(5, 'hearts'), c(3, 'hearts'), c(2, 'hearts'), c(13, 'diamonds')
    ])
    expect(hand.category).toBe(HandCategory.Flush)
    expect(hand.ranks).toEqual([9, 7, 5, 3, 2])
  })
})

describe('compareHands', () => {
  it('ranks a higher category above a lower one regardless of ranks', () => {
    const flush = evaluateHand([
      c(9, 'hearts'), c(7, 'hearts'), c(5, 'hearts'), c(3, 'hearts'), c(2, 'hearts')
    ])
    const fullHouse = evaluateHand([
      c(4, 'spades'), c(4, 'hearts'), c(4, 'clubs'), c(2, 'diamonds'), c(2, 'hearts')
    ])
    expect(compareHands(fullHouse, flush)).toBeGreaterThan(0)
    expect(compareHands(flush, fullHouse)).toBeLessThan(0)
  })

  it('breaks ties within the same category by kicker rank', () => {
    const pairOfNinesHighKickerAce = evaluateHand([
      c(9, 'spades'), c(9, 'hearts'), c(14, 'clubs'), c(4, 'diamonds'), c(2, 'hearts')
    ])
    const pairOfNinesHighKickerKing = evaluateHand([
      c(9, 'clubs'), c(9, 'diamonds'), c(13, 'hearts'), c(4, 'clubs'), c(2, 'spades')
    ])
    expect(compareHands(pairOfNinesHighKickerAce, pairOfNinesHighKickerKing)).toBeGreaterThan(0)
  })

  it('returns 0 for identical hands', () => {
    const a = evaluateHand([
      c(9, 'spades'), c(8, 'hearts'), c(7, 'clubs'), c(6, 'diamonds'), c(5, 'hearts')
    ])
    const b = evaluateHand([
      c(9, 'clubs'), c(8, 'diamonds'), c(7, 'hearts'), c(6, 'spades'), c(5, 'clubs')
    ])
    expect(compareHands(a, b)).toBe(0)
  })
})
