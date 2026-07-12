import { describe, expect, it } from 'vitest'
import { RoomManager } from './room.js'

describe('RoomManager', () => {
  it('creates a room with sensible defaults', () => {
    const manager = new RoomManager()
    const room = manager.createRoom()
    expect(room.maxSeats).toBe(6)
    expect(room.status).toBe('waiting')
    expect(room.slots).toEqual(Array(6).fill(null))
  })

  it('assigns the lowest free seat on join', () => {
    const manager = new RoomManager()
    const room = manager.createRoom()
    const alice = manager.joinRoom(room.id, 'Alice')
    const bob = manager.joinRoom(room.id, 'Bob')
    expect(alice.seat).toBe(0)
    expect(bob.seat).toBe(1)
    expect(manager.getRoom(room.id)?.slots.filter(Boolean)).toHaveLength(2)
  })

  it('refuses to join a full room', () => {
    const manager = new RoomManager()
    const room = manager.createRoom({ maxSeats: 2 })
    manager.joinRoom(room.id, 'Alice')
    manager.joinRoom(room.id, 'Bob')
    expect(() => manager.joinRoom(room.id, 'Carol')).toThrow()
  })

  it('reflects player count and status in listRooms', () => {
    const manager = new RoomManager()
    const room = manager.createRoom()
    manager.joinRoom(room.id, 'Alice')
    const summaries = manager.listRooms()
    expect(summaries).toEqual([
      { id: room.id, name: 'Room', playerCount: 1, maxSeats: 6, status: 'waiting' }
    ])
  })

  it('removes the room once the last player leaves', () => {
    const manager = new RoomManager()
    const room = manager.createRoom()
    const alice = manager.joinRoom(room.id, 'Alice')
    manager.leaveRoom(room.id, alice.id)
    expect(manager.getRoom(room.id)).toBeUndefined()
  })

  it('keeps the room when other players remain', () => {
    const manager = new RoomManager()
    const room = manager.createRoom()
    const alice = manager.joinRoom(room.id, 'Alice')
    manager.joinRoom(room.id, 'Bob')
    manager.leaveRoom(room.id, alice.id)
    expect(manager.getRoom(room.id)?.slots.filter(Boolean)).toHaveLength(1)
  })
})
