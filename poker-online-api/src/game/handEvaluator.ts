import type { Card, Rank } from './card.js'

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8
}

export interface EvaluatedHand {
  category: HandCategory
  // Tiebreaker ranks in priority order (e.g. full house: [tripsRank, pairRank]).
  ranks: Rank[]
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]]
  if (items.length < size) return []
  const [first, ...rest] = items
  const withFirst = combinations(rest, size - 1).map((combo) => [first, ...combo])
  const withoutFirst = combinations(rest, size)
  return [...withFirst, ...withoutFirst]
}

function isFlush(cards: Card[]): boolean {
  return cards.every((card) => card.suit === cards[0].suit)
}

// Returns the straight's high card, or null if the 5 cards aren't a straight.
// Handles the wheel (A-2-3-4-5), which ranks as a 5-high straight.
function straightHighCard(cards: Card[]): Rank | null {
  const uniqueRanks = [...new Set(cards.map((card) => card.rank))].sort((a, b) => b - a)
  if (uniqueRanks.length !== 5) return null

  if (uniqueRanks[0] - uniqueRanks[4] === 4) {
    return uniqueRanks[0]
  }
  if (uniqueRanks.join(',') === '14,5,4,3,2') {
    return 5
  }
  return null
}

function evaluateFive(cards: Card[]): EvaluatedHand {
  const flush = isFlush(cards)
  const straightHigh = straightHighCard(cards)

  const countByRank = new Map<Rank, number>()
  for (const card of cards) {
    countByRank.set(card.rank, (countByRank.get(card.rank) ?? 0) + 1)
  }

  // Sorted by (count desc, rank desc) — the correct tiebreaker order for any
  // count-based category: quads/trips/pairs outrank kickers, and within the
  // same count, the higher rank wins.
  const ranksByCountThenRank = [...countByRank.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .map(([rank]) => rank)
  const counts = [...countByRank.values()].sort((a, b) => b - a)
  const ranksHighToLow = cards.map((card) => card.rank).sort((a, b) => b - a)

  if (straightHigh !== null && flush) {
    return { category: HandCategory.StraightFlush, ranks: [straightHigh] }
  }
  if (counts[0] === 4) {
    return { category: HandCategory.FourOfAKind, ranks: ranksByCountThenRank }
  }
  if (counts[0] === 3 && counts[1] === 2) {
    return { category: HandCategory.FullHouse, ranks: ranksByCountThenRank }
  }
  if (flush) {
    return { category: HandCategory.Flush, ranks: ranksHighToLow }
  }
  if (straightHigh !== null) {
    return { category: HandCategory.Straight, ranks: [straightHigh] }
  }
  if (counts[0] === 3) {
    return { category: HandCategory.ThreeOfAKind, ranks: ranksByCountThenRank }
  }
  if (counts[0] === 2 && counts[1] === 2) {
    return { category: HandCategory.TwoPair, ranks: ranksByCountThenRank }
  }
  if (counts[0] === 2) {
    return { category: HandCategory.Pair, ranks: ranksByCountThenRank }
  }
  return { category: HandCategory.HighCard, ranks: ranksHighToLow }
}

// Positive if `a` wins, negative if `b` wins, 0 on a tie.
export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.category !== b.category) return a.category - b.category
  const length = Math.max(a.ranks.length, b.ranks.length)
  for (let i = 0; i < length; i++) {
    const diff = (a.ranks[i] ?? 0) - (b.ranks[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

// Finds the best possible 5-card hand out of 5-7 cards (2 hole + up to 5 community).
export function evaluateHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) {
    throw new Error('evaluateHand requires at least 5 cards')
  }

  let best: EvaluatedHand | null = null
  for (const five of combinations(cards, 5)) {
    const evaluated = evaluateFive(five)
    if (!best || compareHands(evaluated, best) > 0) {
      best = evaluated
    }
  }
  return best!
}
