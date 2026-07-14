import { socket } from '../socket'
import type { GameState, PlayerView } from '../types'

interface Props {
  state: GameState
  myPlayerId: string
  players: PlayerView[]
}

export function WaitingView({ state, myPlayerId, players }: Props) {
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
        <div className="waiting-rules">
          <span>SB {state.smallBlind} / BB {state.bigBlind}</span>
          <span>Chips {state.defaultStartingChips}</span>
          <span>Timer {state.turnTimeoutMs === 0 ? 'Off' : `${state.turnTimeoutMs / 1000}s`}</span>
        </div>
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

        <div className="waiting-bottom">
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
        </div>
      </div>
    </div>
  )
}
