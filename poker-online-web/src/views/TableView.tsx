import { useCallback, useEffect, useState } from 'react'
import { socket } from '../socket'
import type { GameState } from '../types'
import { CardFace, CardSlot } from '../components/Card'
import { PlayerSeat } from '../components/PlayerSeat'

interface Props {
  myPlayerId: string
  onLeave: () => void
}

export function TableView({ myPlayerId, onLeave }: Props) {
  const [state, setState] = useState<GameState | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [showRaise, setShowRaise] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState(0)

  const handleLeave = useCallback(() => onLeave(), [onLeave])

  useEffect(() => {
    const onGameState = (gs: GameState) => {
      setState(gs)
      setErrorMsg('')
      setShowRaise(false)
    }
    const onError = (e: { message: string }) => setErrorMsg(e.message)
    const onRoomLeft = () => handleLeave()

    socket.on('game_state', onGameState)
    socket.on('error', onError)
    socket.on('room_left', onRoomLeft)
    // Guard against the race where game_state fires before this effect runs
    socket.emit('request_game_state')
    return () => {
      socket.off('game_state', onGameState)
      socket.off('error', onError)
      socket.off('room_left', onRoomLeft)
    }
  }, [handleLeave])

  if (!state) {
    return (
      <div className="table">
        <div className="waiting-screen">
          <p className="waiting-title">Joining room…</p>
          <p className="waiting-sub">Please wait</p>
        </div>
      </div>
    )
  }

  if (state.status === 'waiting') {
    return (
      <div className="table">
        <div className="table-header">
          <span className="header-room">Room {state.roomId.slice(0, 8)}…</span>
          <button className="btn-leave" onClick={() => socket.emit('leave_room')}>
            Leave
          </button>
        </div>
        <div className="waiting-screen">
          <p className="waiting-title">Waiting for players</p>
          <p className="waiting-room-id">Room ID: <code>{state.roomId}</code></p>
          <p className="waiting-count">
            {state.players.length} / {state.maxSeats} players
          </p>
          <ul className="waiting-player-list">
            {state.players.map((p) => (
              <li key={p.id} className={p.id === myPlayerId ? 'me' : ''}>
                {p.name}{p.id === myPlayerId ? ' (You)' : ''}
              </li>
            ))}
          </ul>
          {state.players.length >= 2 && (
            <button className="btn-start" onClick={() => socket.emit('start_game')}>
              ▶ Start Game
            </button>
          )}
          <div className="waiting-rules">
            <span>SB {state.smallBlind} / BB {state.bigBlind}</span>
            <span>Chips {state.defaultStartingChips}</span>
            <span>Timer {state.turnTimeoutMs === 0 ? 'Off' : `${state.turnTimeoutMs / 1000}s`}</span>
          </div>
          {state.players.length < 2 && (
            <p className="waiting-hint">Share the Room ID with other players to start.</p>
          )}
        </div>
      </div>
    )
  }

  const me = state.players.find((p) => p.id === myPlayerId)
  const others = state.players.filter((p) => p.id !== myPlayerId)
  const isMyTurn = state.currentTurnPlayerId === myPlayerId
  const actingPlayer = state.players.find((p) => p.id === state.currentTurnPlayerId)

  const callAmount = me ? Math.min(state.currentBetLevel - me.currentBet, me.chips) : 0
  const canCheck = me ? me.currentBet === state.currentBetLevel : false
  const canAct = isMyTurn && !!me && !me.hasFolded && !me.isAllIn

  const minRaise = state.currentBetLevel > 0 ? state.currentBetLevel * 2 : 20
  const maxRaise = me ? me.chips + me.currentBet : 0

  const isShowdown = state.bettingRound === 'showdown'
  const canStart = state.bettingRound === 'showdown' && state.players.length >= 2

  function act(type: string, amount?: number) {
    socket.emit('player_action', { type, amount })
  }

  function openRaise() {
    setRaiseAmount(Math.min(minRaise, maxRaise))
    setShowRaise(true)
  }

  return (
    <div className="table">
      {/* Header */}
      <div className="table-header">
        <span className="header-room">Room {state.roomId.slice(0, 8)}…</span>
        <span className="header-pot">Pot: {state.pot}</span>
        <button className="btn-leave" onClick={() => socket.emit('leave_room')}>
          Leave
        </button>
      </div>

      {/* Opponents */}
      <div className="opponents">
        {others.length === 0 ? (
          <p className="waiting-msg">Waiting for players…</p>
        ) : (
          others.map((p) => (
            <PlayerSeat
              key={p.id}
              player={p}
              isActive={state.currentTurnPlayerId === p.id}
              isMe={false}
            />
          ))
        )}
      </div>

      {/* Community cards */}
      <div className="community-area">
        <div className="community-label">{state.bettingRound.toUpperCase()}</div>
        <div className="community-cards">
          {[0, 1, 2, 3, 4].map((i) =>
            state.communityCards[i] ? (
              <CardFace key={i} card={state.communityCards[i]} />
            ) : (
              <CardSlot key={i} />
            ),
          )}
        </div>
        <div className="community-bet" style={{ visibility: state.currentBetLevel > 0 ? 'visible' : 'hidden' }}>
          Current bet: {state.currentBetLevel}
        </div>
      </div>

      {/* Status area — fixed height prevents layout shifts */}
      <div className="status-area">
        {isShowdown && state.lastHandResult && (
          <div className="hand-result">
            {state.lastHandResult.pots.map((pot, i) => {
              const names = pot.winnerIds
                .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
                .join(', ')
              return <div key={i}>🏆 {names} wins {pot.amount} chips</div>
            })}
          </div>
        )}
        {me?.isSpectating && (
          <div className="spectating-banner">
            Spectating — you will join at the start of the next hand
          </div>
        )}
        {state.status === 'playing' && !isShowdown && !me?.isSpectating && (
          <div className={`turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
            {isMyTurn ? '🎯 Your turn' : `Waiting for ${actingPlayer?.name ?? '…'}`}
          </div>
        )}
        {errorMsg && <div className="error-msg">{errorMsg}</div>}
      </div>

      {/* My seat */}
      {me && (
        <div className="my-area">
          <PlayerSeat
            player={me}
            isActive={isMyTurn}
            isMe={true}
          />
        </div>
      )}

      {/* Actions */}
      <div className="actions">
        {canStart && (
          <button className="btn-start" onClick={() => socket.emit('start_game')}>
            ▶ Next Hand
          </button>
        )}

        {me && me.chips === 0 && (
          <button className="btn-rebuy" onClick={() => socket.emit('rebuy')}>
            ↩ Rebuy ({state.defaultStartingChips} chips)
          </button>
        )}

        {canAct && (
          <div className="action-buttons">
            <button className="btn-fold" onClick={() => act('fold')}>
              Fold
            </button>
            {canCheck ? (
              <button className="btn-check" onClick={() => act('check')}>
                Check
              </button>
            ) : (
              <button className="btn-call" onClick={() => act('call')}>
                Call {callAmount}
              </button>
            )}
            {me && me.chips > callAmount && (
              <button className="btn-raise" onClick={openRaise}>
                Raise
              </button>
            )}
            <button className="btn-allin" onClick={() => act('allin')}>
              All-in
            </button>
          </div>
        )}

        <div className="raise-panel" style={{ visibility: showRaise ? 'visible' : 'hidden' }}>
          <input
            type="number"
            value={raiseAmount}
            min={minRaise}
            max={maxRaise}
            step={10}
            onChange={(e) => setRaiseAmount(Number(e.target.value))}
          />
          <button
            className="btn-confirm-raise"
            onClick={() => {
              act('raise', raiseAmount)
              setShowRaise(false)
            }}
          >
            Confirm
          </button>
          <button className="btn-cancel" onClick={() => setShowRaise(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
