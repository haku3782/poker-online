import { useCallback, useEffect, useState } from 'react'
import { socket } from '../socket'
import type { GameState, PlayerView } from '../types'
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
  const [lastActions, setLastActions] = useState<Record<string, { text: string; expiry: number }>>({})

  function actionLabel(action: string, amount?: number): string {
    switch (action) {
      case 'fold':  return 'FOLD'
      case 'call':  return amount != null ? `CALL ${amount}` : 'CALL'
      case 'check': return 'CHECK'
      case 'raise': return amount != null ? `RAISE ${amount}` : 'RAISE'
      case 'allin': return 'ALL-IN'
      default:      return action.toUpperCase()
    }
  }

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
    const onActionTaken = ({ playerId, action, amount }: { playerId: string; action: string; amount?: number }) => {
      const text = actionLabel(action, amount)
      const expiry = Date.now() + 2000
      setLastActions(prev => ({ ...prev, [playerId]: { text, expiry } }))
      setTimeout(() => {
        setLastActions(prev => {
          const entry = prev[playerId]
          if (!entry || entry.expiry !== expiry) return prev
          const next = { ...prev }
          delete next[playerId]
          return next
        })
      }, 2000)
    }

    socket.on('game_state', onGameState)
    socket.on('error', onError)
    socket.on('room_left', onRoomLeft)
    socket.on('action_taken', onActionTaken)
    // Guard against the race where game_state fires before this effect runs
    socket.emit('request_game_state')
    return () => {
      socket.off('game_state', onGameState)
      socket.off('error', onError)
      socket.off('room_left', onRoomLeft)
      socket.off('action_taken', onActionTaken)
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

  // Derive a flat players array (non-null slots) for waiting screen logic.
  const players: PlayerView[] = state.slots.filter((p): p is PlayerView => p !== null)

  if (state.status === 'waiting') {
    const me = players.find((p) => p.id === myPlayerId)
    return (
      <div className="lobby-bg">
        <div className="table-header">
          <button className="btn-leave" onClick={() => socket.emit('leave_room')}>
            Leave
          </button>
        </div>
        <div className="waiting-screen">
          <p className="waiting-title">Waiting for players</p>
          <p className="waiting-room-id">{state.name}</p>
          <p className="waiting-count">
            {players.length} / {state.maxSeats} players
          </p>
          <ul className="waiting-player-list">
            {players.map((p) => (
              <li key={p.id} className={p.id === myPlayerId ? 'me' : ''}>
                <span className="waiting-player-name">
                  {p.name}
                  {p.id === myPlayerId && <span className="player-badge">YOU</span>}
                  {p.id === state.ownerId && <span className="player-badge">HOST</span>}
                </span>
                {p.id !== state.ownerId && (
                  <span className={`ready-indicator ${p.isReady ? 'ready' : ''}`}>
                    {p.isReady ? 'OK' : '…'}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {myPlayerId !== state.ownerId && me && (
            <button
              className={`btn-ready ${me.isReady ? 'active' : ''}`}
              onClick={() => socket.emit('set_ready')}
            >
              {me.isReady ? 'Ready ✓' : 'Ready?'}
            </button>
          )}

          {myPlayerId === state.ownerId && players.length >= 2 && (
            <button
              className="btn-start"
              disabled={!players.some(p => p.id !== myPlayerId && p.isReady)}
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
        </div>
      </div>
    )
  }

  // Find my slot and build clockwise-positioned opponent slots.
  const mySlotIndex = state.slots.findIndex((p) => p?.id === myPlayerId)
  const me = mySlotIndex >= 0 ? state.slots[mySlotIndex] : null
  const isMyTurn = state.currentTurnPlayerId === myPlayerId
  const actingPlayer = state.slots.find((p) => p?.id === state.currentTurnPlayerId)

  const callAmount = me ? Math.min(state.currentBetLevel - me.currentBet, me.chips) : 0
  const canCheck = me ? me.currentBet === state.currentBetLevel : false
  const canAct = isMyTurn && !!me && !me.hasFolded && !me.isAllIn && !actionTaken

  const minRaise = state.currentBetLevel > 0 ? state.currentBetLevel * 2 : 20
  const maxRaise = me ? me.chips + me.currentBet : 0

  const isShowdown = state.bettingRound === 'showdown'
  const canStart = state.bettingRound === 'showdown' && players.length >= 2
  const canSeeButtons = !!me && !me.isAllIn && !me.isSpectating && state.status === 'playing' && !isShowdown

  function act(type: string, amount?: number) {
    setActionTaken(true)
    socket.emit('player_action', { type, amount })
  }

  function openRaise() {
    setRaiseAmount(Math.min(minRaise, maxRaise))
    setShowRaise(true)
  }

  // Build opponent slots in clockwise order from my position.
  // byDist[i] = the player at clockwise distance i from me (i=0 is me, skipped).
  const byDist: (PlayerView | null)[] = Array.from({ length: state.maxSeats }, (_, i) => {
    if (i === 0) return null
    return state.slots[(mySlotIndex + i) % state.maxSeats] ?? null
  })

  const sideLeft     = byDist[1] ?? null
  const topOpponents = [byDist[2] ?? null, byDist[3] ?? null, byDist[4] ?? null]
  const sideRight    = byDist[5] ?? null

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
                    turnTimeoutMs={state.turnTimeoutMs}
                    timerPosition="top"
                    lastAction={lastActions[p.id]?.text}
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
                turnTimeoutMs={state.turnTimeoutMs}
                timerPosition="left"
                lastAction={lastActions[sideLeft.id]?.text}
              />
            )}
          </div>

          <div className="felt-community">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span className="community-label">{state.bettingRound.toUpperCase()}</span>
              <svg width="16" height="16" viewBox="0 0 16 16" style={{ transform: 'rotate(-90deg) scaleX(-1)', flexShrink: 0, visibility: canStart ? 'visible' : 'hidden' }}>
                <circle cx="8" cy="8" r="6" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2"/>
                <circle
                  key={state.autoStartAt}
                  className="ring-fill"
                  cx="8" cy="8" r="6"
                  fill="none"
                  stroke="var(--gold)"
                  strokeWidth="2"
                  strokeDasharray="37.7"
                  strokeLinecap="round"
                />
              </svg>
            </div>
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
            <div className="community-status">
              {isShowdown && state.lastHandResult
                ? <div className="hand-result">
                    {state.lastHandResult.pots.map((pot, i) => {
                      const names = pot.winnerIds
                        .map((id) => state.slots.find((p) => p?.id === id)?.name ?? id)
                        .join(', ')
                      return <div key={i}>{names} wins {pot.amount} chips</div>
                    })}
                  </div>
                : me?.isSpectating
                ? <div className="spectating-banner">Watching</div>
                : state.status === 'playing' && !me?.isSpectating
                ? <div className={`turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
                    {isMyTurn ? 'Your turn' : `Waiting for ${actingPlayer?.name ?? '…'}`}
                  </div>
                : null
              }
            </div>
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
                turnTimeoutMs={state.turnTimeoutMs}
                timerPosition="right"
                lastAction={lastActions[sideRight.id]?.text}
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
                turnTimeoutMs={state.turnTimeoutMs}
                timerPosition="inner"
                lastAction={lastActions[me.id]?.text}
              />
            </div>
          )}
        </div>
      </div>

      {/* Actions — inside table rim */}
      <div className="actions">

        {me && me.chips === 0 && (
          <button className="btn-rebuy" onClick={() => socket.emit('rebuy')}>
            ↩ Rebuy ({state.defaultStartingChips} chips)
          </button>
        )}

        <div
          className="action-buttons"
          style={{
            visibility: canSeeButtons ? 'visible' : 'hidden',
            pointerEvents: canSeeButtons ? 'auto' : 'none',
          }}
        >
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
