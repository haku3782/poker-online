import type { Server, Socket } from 'socket.io'
import { applyAction, forfeitPlayer, startHand } from './game/gameEngine.js'
import type { ActionType } from './game/gameEngine.js'
import type { RoomManager } from './game/room.js'
import { broadcastGameState, broadcastRoomsList } from './broadcast.js'
import {
  RECONNECT_TIMEOUT_MS,
  cancelReconnectTimer,
  deleteSession,
  playerKey,
  playerToToken,
  reconnectTimers,
  sessionTokens,
  socketToPlayer,
} from './session.js'

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>()
const nextHandTimers = new Map<string, ReturnType<typeof setTimeout>>()

const NEXT_HAND_DELAY_MS = 3000

function clearTurnTimer(roomId: string): void {
  const t = turnTimers.get(roomId)
  if (t !== undefined) {
    clearTimeout(t)
    turnTimers.delete(roomId)
  }
}

function clearNextHandTimer(roomId: string, manager: RoomManager): void {
  const t = nextHandTimers.get(roomId)
  if (t !== undefined) {
    clearTimeout(t)
    nextHandTimers.delete(roomId)
  }
  const room = manager.getRoom(roomId)
  if (room) room.autoStartAt = undefined
}

function setNextHandTimer(io: Server, roomId: string, manager: RoomManager): void {
  clearNextHandTimer(roomId, manager)
  const room = manager.getRoom(roomId)
  if (!room || room.bettingRound !== 'showdown') return

  room.autoStartAt = Date.now() + NEXT_HAND_DELAY_MS
  const t = setTimeout(() => {
    nextHandTimers.delete(roomId)
    const r = manager.getRoom(roomId)
    if (!r || r.bettingRound !== 'showdown') return
    r.autoStartAt = undefined
    try {
      startHand(r)
      broadcastGameState(io, roomId, manager)
      setTurnTimer(io, roomId, manager)
      broadcastRoomsList(io, manager)
    } catch {
      // Not enough players with chips — broadcast so clients clear the countdown ring
      broadcastGameState(io, roomId, manager)
    }
  }, NEXT_HAND_DELAY_MS)
  nextHandTimers.set(roomId, t)
}

function setTurnTimer(io: Server, roomId: string, manager: RoomManager): void {
  clearTurnTimer(roomId)
  const room = manager.getRoom(roomId)
  if (!room || room.status !== 'playing' || room.bettingRound === 'showdown' || !room.currentTurnPlayerId) return
  if (room.turnTimeoutMs === 0) return

  const playerId = room.currentTurnPlayerId
  const t = setTimeout(() => {
    turnTimers.delete(roomId)
    const r = manager.getRoom(roomId)
    if (!r || r.currentTurnPlayerId !== playerId) return
    try {
      applyAction(r, playerId, { type: 'fold' })
      broadcastGameState(io, roomId, manager)
      setTurnTimer(io, roomId, manager)
    } catch {
      // hand may have ended between timer set and fire
    }
  }, room.turnTimeoutMs)
  turnTimers.set(roomId, t)
}

// Core leave logic — forfeits, removes from room, broadcasts. Does not touch sessions or sockets.
function doLeave(io: Server, info: { roomId: string; playerId: string }, manager: RoomManager): void {
  const room = manager.getRoom(info.roomId)
  if (room && room.status === 'playing' && room.bettingRound !== 'showdown') {
    clearTurnTimer(info.roomId)
    forfeitPlayer(room, info.playerId)
  }
  manager.leaveRoom(info.roomId, info.playerId)

  if (manager.getRoom(info.roomId)) {
    broadcastGameState(io, info.roomId, manager)
    const r = manager.getRoom(info.roomId)!
    if (r.status === 'playing' && r.bettingRound === 'showdown') {
      setNextHandTimer(io, info.roomId, manager)
    } else {
      setTurnTimer(io, info.roomId, manager)
    }
  } else {
    clearTurnTimer(info.roomId)
    clearNextHandTimer(info.roomId, manager)
  }
  broadcastRoomsList(io, manager)
}

// Full explicit leave (leave_room button). Clears session and emits room_left.
function handleLeave(io: Server, socket: Socket, manager: RoomManager): void {
  const info = socketToPlayer.get(socket.id)
  if (!info) return

  socketToPlayer.delete(socket.id)
  socket.leave(info.roomId)

  const token = playerToToken.get(playerKey(info.roomId, info.playerId))
  if (token) deleteSession(token, info.roomId, info.playerId)

  socket.emit('room_left', { roomId: info.roomId })
  doLeave(io, info, manager)
}

export function registerHandlers(io: Server, socket: Socket, manager: RoomManager): void {
  socket.on('list_rooms', () => {
    socket.emit('rooms_list', manager.listRooms())
  })

  socket.on(
    'create_room',
    (options: {
      name?: string
      maxSeats?: number
      smallBlind?: number
      bigBlind?: number
      turnTimeoutMs?: number
      defaultStartingChips?: number
    } = {}) => {
      try {
        const room = manager.createRoom(options)
        socket.emit('room_created', {
          roomId: room.id,
          maxSeats: room.maxSeats,
          smallBlind: room.smallBlind,
          bigBlind: room.bigBlind,
          turnTimeoutMs: room.turnTimeoutMs,
          defaultStartingChips: room.defaultStartingChips,
          status: room.status,
        })
        broadcastRoomsList(io, manager)
      } catch (err) {
        socket.emit('error', { message: (err as Error).message })
      }
    }
  )

  socket.on(
    'join_room',
    ({ roomId, playerName }: { roomId: string; playerName: string }) => {
      try {
        const player = manager.joinRoom(roomId, playerName)

        const token = crypto.randomUUID()
        sessionTokens.set(token, { roomId, playerId: player.id })
        playerToToken.set(playerKey(roomId, player.id), token)

        const room = manager.getRoom(roomId)!
        if (!room.ownerId) room.ownerId = player.id

        socketToPlayer.set(socket.id, { roomId, playerId: player.id })
        socket.join(roomId)
        socket.emit('room_joined', { roomId, playerId: player.id, seat: player.seat, sessionToken: token })
        broadcastGameState(io, roomId, manager)
        broadcastRoomsList(io, manager)
      } catch (err) {
        socket.emit('error', { message: (err as Error).message })
      }
    }
  )

  socket.on('reconnect_session', ({ token }: { token: string }) => {
    const session = sessionTokens.get(token)
    if (!session) {
      socket.emit('reconnect_failed', { reason: 'Session expired' })
      return
    }

    const room = manager.getRoom(session.roomId)
    const player = room?.slots.find((p) => p?.id === session.playerId)
    if (!room || !player) {
      deleteSession(token, session.roomId, session.playerId)
      socket.emit('reconnect_failed', { reason: 'Room or player no longer exists' })
      return
    }

    cancelReconnectTimer(token)
    socketToPlayer.set(socket.id, { roomId: session.roomId, playerId: session.playerId })
    socket.join(session.roomId)

    socket.emit('room_rejoined', { roomId: session.roomId, playerId: session.playerId })
    broadcastGameState(io, session.roomId, manager)
  })

  socket.on('request_game_state', () => {
    const info = socketToPlayer.get(socket.id)
    if (!info) return
    broadcastGameState(io, info.roomId, manager)
  })

  socket.on('set_ready', () => {
    try {
      const info = socketToPlayer.get(socket.id)
      if (!info) throw new Error('Not in a room')
      const room = manager.getRoom(info.roomId)
      if (!room) throw new Error('Room not found')
      if (room.status !== 'waiting') throw new Error('Game already started')
      const player = room.slots.find((p) => p?.id === info.playerId)
      if (!player) throw new Error('Player not found')
      player.isReady = !player.isReady
      broadcastGameState(io, info.roomId, manager)
    } catch (err) {
      socket.emit('error', { message: (err as Error).message })
    }
  })

  socket.on('rebuy', () => {
    try {
      const info = socketToPlayer.get(socket.id)
      if (!info) throw new Error('Not in a room')
      const room = manager.getRoom(info.roomId)
      if (!room) throw new Error('Room not found')
      const player = room.slots.find((p) => p?.id === info.playerId)
      if (!player) throw new Error('Player not found')
      if (player.chips > 0) throw new Error('Cannot rebuy with chips remaining')
      player.chips = room.defaultStartingChips
      player.rebuyCount++
      if (room.bettingRound === 'showdown') setNextHandTimer(io, info.roomId, manager)
      broadcastGameState(io, info.roomId, manager)
    } catch (err) {
      socket.emit('error', { message: (err as Error).message })
    }
  })

  socket.on('leave_room', () => {
    handleLeave(io, socket, manager)
  })

  socket.on('start_game', () => {
    try {
      const info = socketToPlayer.get(socket.id)
      if (!info) throw new Error('Not in a room')
      const room = manager.getRoom(info.roomId)
      if (!room) throw new Error('Room not found')
      if (room.status === 'playing' && room.bettingRound !== 'showdown') {
        throw new Error('Game already in progress')
      }

      let forceSpectating: Set<string> | undefined
      if (room.status === 'waiting') {
        if (info.playerId !== room.ownerId) {
          throw new Error('Only the room owner can start the first game')
        }
        // Non-ready players (excluding owner) join as spectators
        forceSpectating = new Set(
          room.slots
            .filter((p) => p && !p.isReady && p.id !== room.ownerId)
            .map((p) => p!.id)
        )
      }

      clearNextHandTimer(info.roomId, manager)
      startHand(room, forceSpectating)
      broadcastGameState(io, info.roomId, manager)
      setTurnTimer(io, info.roomId, manager)
      broadcastRoomsList(io, manager)
    } catch (err) {
      socket.emit('error', { message: (err as Error).message })
    }
  })

  socket.on('player_action', ({ type, amount }: { type: ActionType; amount?: number }) => {
    try {
      const info = socketToPlayer.get(socket.id)
      if (!info) throw new Error('Not in a room')
      const room = manager.getRoom(info.roomId)
      if (!room) throw new Error('Room not found')
      clearTurnTimer(info.roomId)
      applyAction(room, info.playerId, { type, amount })
      broadcastGameState(io, info.roomId, manager)
      if (room.bettingRound === 'showdown') {
        setNextHandTimer(io, info.roomId, manager)
      } else {
        setTurnTimer(io, info.roomId, manager)
      }
    } catch (err) {
      socket.emit('error', { message: (err as Error).message })
    }
  })

  socket.on('disconnect', () => {
    const info = socketToPlayer.get(socket.id)
    if (!info) return

    socketToPlayer.delete(socket.id)
    socket.leave(info.roomId)

    const key = playerKey(info.roomId, info.playerId)
    const token = playerToToken.get(key)

    if (!token) {
      doLeave(io, info, manager)
      return
    }

    // Grace period — defer forfeit to allow reconnection
    const t = setTimeout(() => {
      reconnectTimers.delete(token)
      sessionTokens.delete(token)
      playerToToken.delete(key)
      doLeave(io, info, manager)
    }, RECONNECT_TIMEOUT_MS)
    reconnectTimers.set(token, t)
  })
}
