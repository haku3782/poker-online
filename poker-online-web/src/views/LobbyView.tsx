import { useEffect, useRef, useState } from 'react'
import { socket } from '../socket'
import type { RoomSummary } from '../types'

interface Props {
  onJoined: (playerId: string, sessionToken: string) => void
}

export function LobbyView({ onJoined }: Props) {
  const [name, setName] = useState(() => sessionStorage.getItem('poker_player_name') ?? '')
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [connected, setConnected] = useState(socket.connected)
  const [errorMsg, setErrorMsg] = useState('')
  const [roomName, setRoomName] = useState('')
  const [maxSeats, setMaxSeats] = useState(6)
  const [turnTimeoutMs, setTurnTimeoutMs] = useState(30_000)
  const [smallBlind, setSmallBlind] = useState(10)
  const [bigBlind, setBigBlind] = useState(20)
  const [startingChips, setStartingChips] = useState(1000)
  const [showSettings, setShowSettings] = useState(false)
  const nameRef = useRef(name)
  nameRef.current = name

  useEffect(() => {
    // Re-check in case socket connected before this effect registered
    setConnected(socket.connected)

    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    const onRoomsList = (list: RoomSummary[]) => setRooms(list)
    const onRoomCreated = (data: { roomId: string }) => {
      socket.emit('join_room', { roomId: data.roomId, playerName: nameRef.current.trim() })
    }
    const onRoomJoined = (data: { playerId: string; sessionToken: string }) => {
      onJoined(data.playerId, data.sessionToken)
    }
    const onError = (e: { message: string }) => setErrorMsg(e.message)

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('rooms_list', onRoomsList)
    socket.on('room_created', onRoomCreated)
    socket.on('room_joined', onRoomJoined)
    socket.on('error', onError)
    socket.emit('list_rooms')

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('rooms_list', onRoomsList)
      socket.off('room_created', onRoomCreated)
      socket.off('room_joined', onRoomJoined)
      socket.off('error', onError)
    }
  }, [onJoined])

  const trimmed = name.trim()

  function createRoom() {
    setErrorMsg('')
    socket.emit('create_room', { name: roomName.trim() || `${trimmed}'s Room`, maxSeats, turnTimeoutMs, smallBlind, bigBlind, defaultStartingChips: startingChips })
  }

  return (
    <div className="lobby">
      <h1>♠ Poker Online</h1>

      <div className="connection-status">
        <span className={connected ? 'dot green' : 'dot red'} />
        {connected ? 'Connected' : 'Connecting…'}
      </div>

      <div className="name-input">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          maxLength={10}
          onChange={(e) => { const v = e.target.value.slice(0, 10); setName(v); sessionStorage.setItem('poker_player_name', v) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && trimmed) createRoom() }}
        />
      </div>

      <div className="room-settings">
        <button className="settings-toggle" onClick={() => setShowSettings(s => !s)}>
          <span className="settings-toggle-icon">{showSettings ? '▼' : '▶'}</span>
          Create Room
        </button>
        {showSettings && (
          <>
            <div className="settings-row">
              <label>Max Players</label>
              <div className="btn-group">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    className={maxSeats === n ? 'active' : ''}
                    onClick={() => setMaxSeats(n)}
                  >{n}</button>
                ))}
              </div>
            </div>

            <div className="settings-row">
              <label>Turn Timer</label>
              <div className="btn-group">
                {[{ label: '15s', ms: 15_000 }, { label: '30s', ms: 30_000 }, { label: '60s', ms: 60_000 }, { label: 'Off', ms: 0 }].map(({ label, ms }) => (
                  <button
                    key={ms}
                    className={turnTimeoutMs === ms ? 'active' : ''}
                    onClick={() => setTurnTimeoutMs(ms)}
                  >{label}</button>
                ))}
              </div>
            </div>

            <div className="settings-row">
              <label>Small Blind</label>
              <input
                type="number"
                className="settings-num"
                value={smallBlind}
                min={1}
                onChange={(e) => setSmallBlind(Number(e.target.value))}
              />
            </div>

            <div className="settings-row">
              <label>Big Blind</label>
              <input
                type="number"
                className="settings-num"
                value={bigBlind}
                min={1}
                onChange={(e) => setBigBlind(Number(e.target.value))}
              />
            </div>

            <div className="settings-row">
              <label>Starting Chips</label>
              <input
                type="number"
                className="settings-num"
                value={startingChips}
                min={100}
                step={100}
                onChange={(e) => setStartingChips(Number(e.target.value))}
              />
            </div>

            <div className="settings-row">
              <label>Room Name</label>
              <input
                type="text"
                className="settings-text"
                placeholder={trimmed ? `${trimmed}'s Room` : ''}
                value={roomName}
                maxLength={24}
                onChange={(e) => setRoomName(e.target.value.slice(0, 24))}
              />
            </div>

            <div className="lobby-actions">
              <button
                className="btn-outline"
                disabled={!trimmed || !connected}
                onClick={createRoom}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>

      {errorMsg && <div className="error-msg">{errorMsg}</div>}

      <h2 className="rooms-heading">Rooms</h2>
      <div className="room-list">
        {rooms.length === 0 ? (
          <p className="empty">No rooms yet. Create one!</p>
        ) : (
          rooms.map((room) => (
            <div key={room.id} className="room-card">
              <div className="room-info">
                <span className="room-id-short">{room.name}</span>
                <span className="room-players">{room.playerCount}/{room.maxSeats} players</span>
                <span className={`status ${room.status}`}>{room.status}</span>
              </div>
              <button
                className="btn-join"
                disabled={!trimmed || !connected}
                onClick={() => { setErrorMsg(''); socket.emit('join_room', { roomId: room.id, playerName: trimmed }) }}
              >
                {room.status === 'playing' ? 'Spectate' : 'Join'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
