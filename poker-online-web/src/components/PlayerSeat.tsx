import type { PlayerView } from '../types'
import { CardBack, CardFace, CardSlot } from './Card'

interface Props {
  player: PlayerView
  isActive: boolean
  isMe: boolean
  isDealer?: boolean
  compact?: boolean
  turnTimeoutMs?: number
  timerPosition?: 'top' | 'left' | 'right' | 'inner'
  lastAction?: string
  isWinner?: boolean
}

function renderHoleCards(player: PlayerView) {
  if (player.isSpectating) return [<CardSlot key={0} />, <CardSlot key={1} />]
  if (player.holeCards && player.holeCards.length > 0) {
    return player.holeCards.map((c, i) => <CardFace key={i} card={c} />)
  }
  if (player.holeCards !== undefined || player.hasFolded) {
    return [<CardSlot key={0} />, <CardSlot key={1} />]
  }
  return [<CardBack key={0} />, <CardBack key={1} />]
}

export function PlayerSeat({ player, isActive, isMe, isDealer, compact, turnTimeoutMs, timerPosition, lastAction, isWinner }: Props) {
  const classes = [
    'player-seat',
    compact && 'compact',
    player.hasFolded && 'folded',
    player.isSpectating && 'spectating',
    isMe && 'me',
    isWinner && 'winner',
  ].filter(Boolean).join(' ')

  const badge = player.isSpectating
    ? { text: 'WATCHING', cls: 'spectating-badge' }
    : player.isAllIn
    ? { text: 'ALL-IN', cls: 'allin' }
    : player.hasFolded
    ? { text: 'FOLD', cls: 'folded-badge' }
    : null

  if (compact) {
    const cards = (
      <div className="seat-cards">
        {renderHoleCards(player)}
      </div>
    )
    const info = (
      <div className="seat-info">
        <div className="seat-row">
          <span className="seat-name">{player.name}</span>
        </div>
        <div className="seat-row">
          <span className="seat-chips">{player.chips}</span>
          {player.rebuyCount > 0 && (
            <span className="seat-rebuy">↩ ×{player.rebuyCount}</span>
          )}
        </div>
        <div className="seat-row">
          {player.currentBet > 0 && (
            <span className="seat-bet">Bet: {player.currentBet}</span>
          )}
        </div>
        <div className="seat-row seat-row-status">
          {lastAction
            ? <span className="action-notif">{lastAction}</span>
            : badge
            ? <span className={`badge ${badge.cls}`}>{badge.text}</span>
            : player.handRank
            ? <span className="hand-rank">{player.handRank}</span>
            : null
          }
        </div>
        {!isMe && (
          <div className="seat-row seat-row-dealer">
            {isDealer && <span className="dealer-btn">D</span>}
          </div>
        )}
      </div>
    )
    return (
      <div className={`${classes}${!player.isSpectating ? ' revealed' : ''}`}>
        {isMe && (
          <div className="seat-row seat-row-dealer">
            {isDealer && <span className="dealer-btn">D</span>}
          </div>
        )}
        {cards}
        {timerPosition === 'inner' && (
          <div
            className={`turn-timer-bar inner${isActive && turnTimeoutMs && turnTimeoutMs > 0 ? ' animating' : ''}`}
            style={isActive && turnTimeoutMs && turnTimeoutMs > 0 ? { animationDuration: `${turnTimeoutMs}ms` } : undefined}
          />
        )}
        {info}
        {timerPosition !== 'inner' && isActive && (
          <div
            className={`turn-timer-bar ${timerPosition ?? 'top'}${!turnTimeoutMs || turnTimeoutMs === 0 ? ' no-timer' : ''}`}
            style={turnTimeoutMs && turnTimeoutMs > 0 ? { animationDuration: `${turnTimeoutMs}ms` } : undefined}
          />
        )}
      </div>
    )
  }

  return (
    <div className={classes}>
      {isDealer && <span className="dealer-btn">D</span>}
      <div className="seat-cards">
        {renderHoleCards(player)}
      </div>
      <div className="seat-info">
        <div className="seat-row">
          <span className="seat-name">{player.name}{isMe && ' (You)'}</span>
        </div>
        <div className="seat-row">
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
