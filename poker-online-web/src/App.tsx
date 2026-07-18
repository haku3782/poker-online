import { useCallback, useEffect, useState } from 'react'
import { socket } from './socket'
import { LobbyView } from './views/LobbyView'
import { TableView } from './views/TableView'
import './styles/base.css'
import './styles/lobby.css'
import './styles/table-layout.css'
import './styles/player-seat.css'

const SESSION_KEY = 'poker_session_token'

type Screen = 'lobby' | 'table'

function App() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)

  const handleJoined = useCallback((playerId: string, sessionToken: string) => {
    localStorage.setItem(SESSION_KEY, sessionToken)
    setMyPlayerId(playerId)
    setScreen('table')
  }, [])

  const handleLeave = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setMyPlayerId(null)
    setScreen('lobby')
  }, [])

  useEffect(() => {
    const tryReconnect = () => {
      const token = localStorage.getItem(SESSION_KEY)
      if (token) socket.emit('reconnect_session', { token })
    }

    const onRoomRejoined = ({ playerId }: { roomId: string; playerId: string }) => {
      setMyPlayerId(playerId)
      setScreen('table')
    }

    const onReconnectFailed = () => {
      localStorage.removeItem(SESSION_KEY)
    }

    socket.on('connect', tryReconnect)
    socket.on('room_rejoined', onRoomRejoined)
    socket.on('reconnect_failed', onReconnectFailed)

    if (socket.connected) tryReconnect()

    return () => {
      socket.off('connect', tryReconnect)
      socket.off('room_rejoined', onRoomRejoined)
      socket.off('reconnect_failed', onReconnectFailed)
    }
  }, [])

  return (
    <>
      <div className="orientation-overlay">
        <span className="orientation-icon">↕</span>
        <p>画面を縦にしてください</p>
      </div>
      {screen === 'table' && myPlayerId
        ? <TableView myPlayerId={myPlayerId} onLeave={handleLeave} />
        : <LobbyView onJoined={handleJoined} />
      }
    </>
  )
}

export default App
