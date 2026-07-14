import type { Card } from '../types'

function suitSymbol(suit: Card['suit']): string {
  return { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit]
}

function rankLabel(rank: number): string {
  const face: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }
  return face[rank] ?? String(rank)
}

export function CardFace({ card }: { card: Card }) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds'
  return (
    <div className={`card ${red ? 'red' : 'black'}`}>
      <span className="card-rank">{rankLabel(card.rank)}</span>
      <span className="card-suit">{suitSymbol(card.suit)}</span>
    </div>
  )
}

export function CardBack() {
  return <div className="card back" />
}

export function CardSlot() {
  return <div className="card placeholder" />
}
