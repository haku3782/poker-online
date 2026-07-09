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
  const [actionTaken, setActionTaken] = useState(false)

  const handleLeave = useCallback(() => onLeave(), [onLeave])

  useEffect(() => {
    const onGameState = (gs: GameState) => {
      setState(gs)
      setErrorMsg('')
      setShowRaise(false)
      setActionTaken(false)
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
          <span className="header-room">{state.name}</span>
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
                <span className="waiting-player-name">
                  {p.name}{p.id === myPlayerId ? ' (You)' : ''}
                  {p.id === state.ownerId && <span className="owner-badge">HOST</span>}
                </span>
                {p.id !== state.ownerId && (
                  <span className={`ready-indicator ${p.isReady ? 'ready' : ''}`}>
                    {p.isReady ? 'OK' : '…'}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {myPlayerId !== state.ownerId && (() => {
            const me = state.players.find((p) => p.id === myPlayerId)
            return me ? (
              <button
                className={`btn-ready ${me.isReady ? 'active' : ''}`}
                onClick={() => socket.emit('set_ready')}
              >
                {me.isReady ? 'Ready ✓' : 'Ready?'}
              </button>
            ) : null
          })()}

          {myPlayerId === state.ownerId && state.players.length >= 2 && (
            <button
              className="btn-start"
              disabled={!state.players.some(p => p.id !== myPlayerId && p.isReady)}
              onClick={() => socket.emit('start_game')}
            >
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
  const canAct = isMyTurn && !!me && !me.hasFolded && !me.isAllIn && !actionTaken

  const minRaise = state.currentBetLevel > 0 ? state.currentBetLevel * 2 : 20
  const maxRaise = me ? me.chips + me.currentBet : 0

  const isShowdown = state.bettingRound === 'showdown'
  const canStart = state.bettingRound === 'showdown' && state.players.length >= 2
  const canSeeButtons = !!me && !me.isAllIn && !me.isSpectating && state.status === 'playing' && !isShowdown

  function act(type: string, amount?: number) {
    setActionTaken(true)
    socket.emit('player_action', { type, amount })
  }

  function openRaise() {
    setRaiseAmount(Math.min(minRaise, maxRaise))
    setShowRaise(true)
  }

  const mySeat = me?.seat ?? 0
  const othersClockwise = others.sort((a, b) => {
    const distA = (a.seat - mySeat + state.maxSeats) % state.maxSeats
    const distB = (b.seat - mySeat + state.maxSeats) % state.maxSeats
    return distA - distB
  })
  const sideLeft     = othersClockwise[0] ?? null
  const topOpponents = othersClockwise.slice(1, 4)
  const sideRight    = othersClockwise[4] ?? null

  return (
    <div className="table">
      {/* Header */}
      <div className="table-header">
        <span className="header-room">{state.name}</span>
        <button className="btn-leave" onClick={() => socket.emit('leave_room')}>
          Leave
        </button>
      </div>

      {/* Unified table felt */}
      <div className="table-felt">

      {/* Felt area: oval table */}
      <div className="felt-area">
        {/* Top opponents — always 3 fixed slots */}
        <div className="felt-top">
          {[0, 1, 2].map((i) => {
            const p = topOpponents[i]
            return (
              <div key={i} className="felt-top-slot">
                {p && (
                  <PlayerSeat
                    player={p}
                    isActive={state.currentTurnPlayerId === p.id}
                    isMe={false}
                    isDealer={state.dealerPlayerId === p.id}
                    compact={true}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Center: side seats + community cards */}
        <div className="felt-center">
          <div className="felt-side felt-side-left">
            {sideLeft && (
              <PlayerSeat
                player={sideLeft}
                isActive={state.currentTurnPlayerId === sideLeft.id}
                isMe={false}
                isDealer={state.dealerPlayerId === sideLeft.id}
                compact={true}
              />
            )}
          </div>

          <div className="felt-community">
            <span className="community-label">{state.bettingRound.toUpperCase()}</span>
            <div className="community-cards">
              {[0, 1, 2, 3, 4].map((i) =>
                state.communityCards[i] ? (
                  <CardFace key={i} card={state.communityCards[i]} />
                ) : (
                  <CardSlot key={i} />
                ),
              )}
            </div>
            <div className="community-info">
              <span className="community-pot">Pot: {state.pot}</span>
              <span className="community-bet" style={{ visibility: state.currentBetLevel > 0 ? 'visible' : 'hidden' }}>
                Bet: {state.currentBetLevel}
              </span>
            </div>
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
                Watching
              </div>
            )}
            {state.status === 'playing' && !isShowdown && !me?.isSpectating && (
              <div className={`turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
                {isMyTurn ? '🎯 Your turn' : `Waiting for ${actingPlayer?.name ?? '…'}`}
              </div>
            )}
            {errorMsg && <div className="error-msg">{errorMsg}</div>}
          </div>

          <div className="felt-side felt-side-right">
            {sideRight && (
              <PlayerSeat
                player={sideRight}
                isActive={state.currentTurnPlayerId === sideRight.id}
                isMe={false}
                isDealer={state.dealerPlayerId === sideRight.id}
                compact={true}
              />
            )}
          </div>
        </div>

        {/* Bottom: my seat */}
        <div className="felt-bottom">
          {me && (
            <div className="my-area">
              <PlayerSeat
                player={me}
                isActive={isMyTurn}
                isMe={true}
                isDealer={state.dealerPlayerId === me.id}
                compact={true}
              />
            </div>
          )}
        </div>
      </div>

      {/* Actions — inside table rim */}
      <div className="actions">
        {canStart && (
          <div className="next-hand-countdown">
            <div className="countdown-ring">
              <svg width="48" height="48" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3"/>
                <circle
                  key={state.autoStartAt}
                  className="ring-fill"
                  cx="24" cy="24" r="18"
                  fill="none"
                  stroke="var(--gold)"
                  strokeWidth="3"
                  strokeDasharray="113.1"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        )}

        {me && me.chips === 0 && (
          <button className="btn-rebuy" onClick={() => socket.emit('rebuy')}>
            ↩ Rebuy ({state.defaultStartingChips} chips)
          </button>
        )}

        {canSeeButtons && (
          <div className="action-buttons">
            <button className="btn-allin" disabled={!canAct} onClick={() => act('allin')}>
              All-in
            </button>
            <button className="btn-raise" disabled={!canAct || !(me && me.chips > callAmount)} onClick={openRaise}>
              Raise
            </button>
            <button className="btn-fold" disabled={!canAct} onClick={() => act('fold')}>
              Fold
            </button>
            {canCheck ? (
              <button className="btn-check" disabled={!canAct} onClick={() => act('check')}>
                Check
              </button>
            ) : (
              <button className="btn-call" disabled={!canAct} onClick={() => act('call')}>
                Call
              </button>
            )}
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

      </div>{/* /table-felt */}
    </div>
  )
}
