import type { PlayerView } from '../types'
import { CardBack, CardFace, CardSlot } from './Card'

interface Props {
  player: PlayerView
  isActive: boolean
  isMe: boolean
  isDealer?: boolean
  compact?: boolean
}

export function PlayerSeat({ player, isActive, isMe, isDealer, compact }: Props) {
  const classes = [
    'player-seat',
    compact && 'compact',
    isActive && 'active',
    player.hasFolded && 'folded',
    player.isSpectating && 'spectating',
    isMe && 'me',
    isDealer && 'dealer',
  ].filter(Boolean).join(' ')

  const badge = player.isSpectating
    ? { text: 'WATCHING', cls: 'spectating-badge' }
    : player.isAllIn
    ? { text: 'ALL-IN', cls: 'allin' }
    : player.hasFolded
    ? { text: 'FOLD', cls: 'folded-badge' }
    : null

  if (compact) {
    const revealedCards = player.holeCards && player.holeCards.length > 0
    return (
      <div className={`${classes}${!player.isSpectating ? ' revealed' : ''}`}>
        {!player.isSpectating && (
          <div className="seat-cards">
            {revealedCards
              ? player.holeCards!.map((c, i) => <CardFace key={i} card={c} />)
              : player.hasFolded
              ? [<CardSlot key={0} />, <CardSlot key={1} />]
              : [<CardBack key={0} />, <CardBack key={1} />]
            }
          </div>
        )}
        <div className="seat-info">
          <div className="seat-row">
            <span className="seat-name">{player.name}</span>
            <span className="seat-chips">{player.chips}</span>
          </div>
          <div className="seat-row">
            {player.currentBet > 0 && (
              <span className="seat-bet">Bet: {player.currentBet}</span>
            )}
          </div>
          <div className="seat-row">
            {badge && (
              <span className={`badge ${badge.cls}`}>{badge.text}</span>
            )}
            {!badge && player.handRank && (
              <span className="hand-rank">{player.handRank}</span>
            )}
          </div>
          {isDealer && (
            <div className="seat-row seat-row-dealer">
              <span className="dealer-btn">D</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={classes}>
      {isDealer && <span className="dealer-btn">D</span>}
      <div className="seat-cards">
        {player.isSpectating ? (
          [<CardSlot key={0} />, <CardSlot key={1} />]
        ) : player.holeCards !== undefined ? (
          player.holeCards.length > 0 ? (
            player.holeCards.map((c, i) => <CardFace key={i} card={c} />)
          ) : (
            [<CardSlot key={0} />, <CardSlot key={1} />]
          )
        ) : (
          [<CardBack key={0} />, <CardBack key={1} />]
        )}
      </div>
      <div className="seat-info">
        <div className="seat-row">
          <span className="seat-name">{player.name}{isMe && ' (You)'}</span>
          <span className="seat-chips">{player.chips}</span>
          {player.rebuyCount > 0 && (
            <span className="seat-rebuy">↩ ×{player.rebuyCount}</span>
          )}
        </div>
        <div className="seat-row">
          {player.currentBet > 0 && (
            <span className="seat-bet">Bet: {player.currentBet}</span>
          )}
          {badge && (
            <span className={`badge ${badge.cls}`}>{badge.text}</span>
          )}
          {!badge && player.handRank && (
            <span className="hand-rank">{player.handRank}</span>
          )}
        </div>
      </div>
    </div>
  )
}
