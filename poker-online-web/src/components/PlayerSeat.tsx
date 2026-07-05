import type { PlayerView } from '../types'
import { CardBack, CardFace, CardSlot } from './Card'

interface Props {
  player: PlayerView
  isActive: boolean
  isMe: boolean
}

export function PlayerSeat({ player, isActive, isMe }: Props) {
  const classes = [
    'player-seat',
    isActive && 'active',
    player.hasFolded && 'folded',
    player.isSpectating && 'spectating',
    isMe && 'me',
  ].filter(Boolean).join(' ')

  const badge = player.isSpectating
    ? { text: 'WATCHING', cls: 'spectating-badge' }
    : player.isAllIn
    ? { text: 'ALL-IN', cls: 'allin' }
    : player.hasFolded
    ? { text: 'FOLD', cls: 'folded-badge' }
    : null

  return (
    <div className={classes}>
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
        </div>
        <div className="seat-row">
          <span className="seat-bet" style={{ visibility: player.currentBet > 0 ? 'visible' : 'hidden' }}>
            Bet: {player.currentBet}
          </span>
          <span
            className={`badge ${badge?.cls ?? 'folded-badge'}`}
            style={{ visibility: badge ? 'visible' : 'hidden' }}
          >
            {badge?.text ?? 'FOLD'}
          </span>
        </div>
        <div className="seat-row">
          <span className="seat-rebuy" style={{ visibility: player.rebuyCount > 0 ? 'visible' : 'hidden' }}>
            ↩ ×{player.rebuyCount}
          </span>
        </div>
      </div>
    </div>
  )
}
