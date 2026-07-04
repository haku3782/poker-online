import type { Server, Socket } from 'socket.io'
import { applyAction, forfeitPlayer, startHand } from './game/gameEngine.js'
import type { ActionType } from './game/gameEngine.js'
import { RoomManager } from './game/room.js'

const TURN_TIMEOUT_MS = 30_000

const manager = new RoomManager()

// socket.id → { roomId, playerId }
const socketToPlayer = new Map<string, { roomId: string; playerId: string }>()

// roomId → active turn timer
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearTurnTimer(roomId: string): void {
  const t = turnTimers.get(roomId)
  if (t !== undefined) {
    clearTimeout(t)
    turnTimers.delete(roomId)
  }
}

function setTurnTimer(io: Server, roomId: string): void {
  clearTurnTimer(roomId)
  const room = manager.getRoom(roomId)
  if (!room || room.status !== 'playing' || room.bettingRound === 'showdown' || !room.currentTurnPlayerId) return

  const playerId = room.currentTurnPlayerId
  const t = setTimeout(() => {
    turnTimers.delete(roomId)
    const r = manager.getRoom(roomId)
    if (!r || r.currentTurnPlayerId !== playerId) return
    try {
      applyAction(r, playerId, { type: 'fold' })
      broadcastGameState(io, roomId)
      setTurnTimer(io, roomId)
    } catch {
      // hand may have ended between timer set and fire
    }
  }, TURN_TIMEOUT_MS)
  turnTimers.set(roomId, t)
}

function broadcastGameState(io: Server, roomId: string): void {
  const room = manager.getRoom(roomId)
  if (!room) return

  const basePlayers = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    chips: p.chips,
    currentBet: p.currentBet,
    hasFolded: p.hasFolded,
    isAllIn: p.isAllIn,
  }))

  const pot = room.players.reduce((sum, p) => sum + p.totalContributed, 0)

  const baseState = {
    roomId: room.id,
    status: room.status,
    bettingRound: room.bettingRound,
    communityCards: room.communityCards,
    currentBetLevel: room.currentBetLevel,
    pot,
    currentTurnPlayerId: room.currentTurnPlayerId,
    lastHandResult: room.lastHandResult,
    players: basePlayers,
  }

  // Send personalized state to each socket in this room (hole cards only to owner)
  for (const [sid, info] of socketToPlayer.entries()) {
    if (info.roomId !== roomId) continue
    const ownPlayer = room.players.find((p) => p.id === info.playerId)
    const personalizedState = {
      ...baseState,
      players: basePlayers.map((p) => {
        if (p.id === info.playerId && ownPlayer) {
          return { ...p, holeCards: ownPlayer.holeCards }
        }
        return p
      }),
    }
    io.to(sid).emit('game_state', personalizedState)
  }
}

function handleLeave(io: Server, socket: Socket): void {
  const info = socketToPlayer.get(socket.id)
  if (!info) return
  socketToPlayer.delete(socket.id)
  socket.leave(info.roomId)

  const room = manager.getRoom(info.roomId)
  if (room && room.status === 'playing' && room.bettingRound !== 'showdown') {
    // Auto-fold before removing — keeps hand consistent
    clearTurnTimer(info.roomId)
    forfeitPlayer(room, info.playerId)
  }

  manager.leaveRoom(info.roomId, info.playerId)
  socket.emit('room_left', { roomId: info.roomId })

  if (manager.getRoom(info.roomId)) {
    broadcastGameState(io, info.roomId)
    setTurnTimer(io, info.roomId)
  } else {
    clearTurnTimer(info.roomId)
  }
}

export function registerHandlers(io: Server, socket: Socket): void {
  socket.on('list_rooms', () => {
    socket.emit('rooms_list', manager.listRooms())
  })

  socket.on(
    'create_room',
    (options: { maxSeats?: number; smallBlind?: number; bigBlind?: number } = {}) => {
      try {
        const room = manager.createRoom(options)
        socket.emit('room_created', {
          roomId: room.id,
          maxSeats: room.maxSeats,
          smallBlind: room.smallBlind,
          bigBlind: room.bigBlind,
          status: room.status,
        })
      } catch (err) {
        socket.emit('error', { message: (err as Error).message })
      }
    }
  )

  socket.on(
    'join_room',
    ({
      roomId,
      playerName,
      startingChips,
    }: {
      roomId: string
      playerName: string
      startingChips?: number
    }) => {
      try {
        const player = manager.joinRoom(roomId, playerName, startingChips)
        socketToPlayer.set(socket.id, { roomId, playerId: player.id })
        socket.join(roomId)
        socket.emit('room_joined', { roomId, playerId: player.id, seat: player.seat })
        broadcastGameState(io, roomId)
      } catch (err) {
        socket.emit('error', { message: (err as Error).message })
      }
    }
  )

  socket.on('leave_room', () => {
    handleLeave(io, socket)
  })

  socket.on('start_game', () => {
    try {
      const info = socketToPlayer.get(socket.id)
      if (!info) throw new Error('Not in a room')
      const room = manager.getRoom(info.roomId)
      if (!room) throw new Error('Room not found')
      startHand(room)
      broadcastGameState(io, info.roomId)
      setTurnTimer(io, info.roomId)
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
      broadcastGameState(io, info.roomId)
      setTurnTimer(io, info.roomId)
    } catch (err) {
      socket.emit('error', { message: (err as Error).message })
    }
  })

  socket.on('disconnect', () => {
    handleLeave(io, socket)
  })
}
