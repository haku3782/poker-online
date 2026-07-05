import { describe, expect, it } from 'vitest'
import { applyAction, startHand } from './gameEngine.js'
import { RoomManager } from './room.js'
import type { Room } from './room.js'

function checkOrCallForCurrentPlayer(room: Room): void {
  const playerId = room.currentTurnPlayerId!
  const player = room.players.find((p) => p.id === playerId)!
  const action = player.currentBet === room.currentBetLevel ? { type: 'check' as const } : { type: 'call' as const }
  applyAction(room, playerId, action)
}

function playToShowdown(room: Room, maxSteps = 30): void {
  for (let i = 0; i < maxSteps && room.bettingRound !== 'showdown'; i++) {
    checkOrCallForCurrentPlayer(room)
  }
}

describe('startHand', () => {
  it('posts blinds heads-up with the dealer as small blind', () => {
    const manager = new RoomManager()
    const room = manager.createRoom({ smallBlind: 10, bigBlind: 20 })
    const alice = manager.joinRoom(room.id, 'Alice', 500)
    const bob = manager.joinRoom(room.id, 'Bob', 500)

    startHand(room)

    expect(alice.currentBet).toBe(10) // dealer/seat0 posts small blind heads-up
    expect(bob.currentBet).toBe(20)
    expect(room.currentBetLevel).toBe(20)
    expect(room.currentTurnPlayerId).toBe(alice.id) // SB/dealer acts first preflop heads-up
  })

  it('posts blinds 3-handed with small blind left of the dealer', () => {
    const manager = new RoomManager()
    const room = manager.createRoom({ smallBlind: 10, bigBlind: 20 })
    const alice = manager.joinRoom(room.id, 'Alice', 500)
    const bob = manager.joinRoom(room.id, 'Bob', 500)
    const carol = manager.joinRoom(room.id, 'Carol', 500)

    startHand(room)

    expect(alice.currentBet).toBe(0) // dealer posts nothing 3-handed
    expect(bob.currentBet).toBe(10)
    expect(carol.currentBet).toBe(20)
    expect(room.currentTurnPlayerId).toBe(alice.id) // first to act after the big blind
  })

  it('deals two hole cards to every player', () => {
    const manager = new RoomManager()
    const room = manager.createRoom()
    const alice = manager.joinRoom(room.id, 'Alice', 500)
    const bob = manager.joinRoom(room.id, 'Bob', 500)

    startHand(room)

    expect(alice.holeCards).toHaveLength(2)
    expect(bob.holeCards).toHaveLength(2)
    expect(room.deck).toHaveLength(52 - 4)
  })

  it('rotates the dealer button on the next hand', () => {
    const manager = new RoomManager()
    const room = manager.createRoom()
    manager.joinRoom(room.id, 'Alice', 500)
    manager.joinRoom(room.id, 'Bob', 500)
    startHand(room)
    const firstDealerIndex = room.dealerIndex
    playToShowdown(room)

    startHand(room)
    expect(room.dealerIndex).toBe((firstDealerIndex + 1) % 2)
  })
})

describe('applyAction', () => {
  it('rejects an action from a player who is not on turn', () => {
    const manager = new RoomManager()
    const room = manager.createRoom()
    manager.joinRoom(room.id, 'Alice', 500)
    const bob = manager.joinRoom(room.id, 'Bob', 500)
    startHand(room)

    expect(() => applyAction(room, bob.id, { type: 'fold' })).toThrow()
  })

  it('ends the hand immediately and awards the full pot when everyone else folds', () => {
    const manager = new RoomManager()
    const room = manager.createRoom({ smallBlind: 10, bigBlind: 20 })
    const alice = manager.joinRoom(room.id, 'Alice', 500)
    const bob = manager.joinRoom(room.id, 'Bob', 500)
    startHand(room)

    expect(room.currentTurnPlayerId).toBe(alice.id)
    applyAction(room, alice.id, { type: 'fold' })

    expect(room.bettingRound).toBe('showdown')
    expect(room.status).toBe('playing')
    expect(room.lastHandResult).toEqual({ pots: [{ amount: 30, winnerIds: [bob.id] }] })
    expect(bob.chips).toBe(510) // 500 - 20 (BB posted) + 30 (pot)
    expect(alice.chips).toBe(490) // 500 - 10 (SB posted, forfeited)
  })

  it('reopens the action for players who already called once someone raises', () => {
    const manager = new RoomManager()
    const room = manager.createRoom({ smallBlind: 10, bigBlind: 20 })
    const alice = manager.joinRoom(room.id, 'Alice', 500)
    const bob = manager.joinRoom(room.id, 'Bob', 500)
    const carol = manager.joinRoom(room.id, 'Carol', 500)
    startHand(room)

    applyAction(room, alice.id, { type: 'call' })
    applyAction(room, bob.id, { type: 'call' })
    // Carol raises after both Alice and Bob already called this round.
    applyAction(room, carol.id, { type: 'raise', amount: 100 })

    expect(room.playersToAct).toEqual([alice.id, bob.id])
    expect(room.currentTurnPlayerId).toBe(alice.id)
  })

  it('advances through every street and reaches showdown when checked down', () => {
    const manager = new RoomManager()
    const room = manager.createRoom({ smallBlind: 10, bigBlind: 20 })
    manager.joinRoom(room.id, 'Alice', 500)
    manager.joinRoom(room.id, 'Bob', 500)
    startHand(room)

    playToShowdown(room)

    expect(room.bettingRound).toBe('showdown')
    expect(room.communityCards).toHaveLength(5)
    expect(room.lastHandResult).not.toBeNull()
    expect(room.status).toBe('playing')
  })

  it('conserves total chips across a full hand', () => {
    const manager = new RoomManager()
    const room = manager.createRoom({ smallBlind: 10, bigBlind: 20 })
    const alice = manager.joinRoom(room.id, 'Alice', 500)
    const bob = manager.joinRoom(room.id, 'Bob', 500)
    const carol = manager.joinRoom(room.id, 'Carol', 500)
    const totalBefore = alice.chips + bob.chips + carol.chips

    startHand(room)
    playToShowdown(room)

    expect(alice.chips + bob.chips + carol.chips).toBe(totalBefore)
  })

  it('creates a side pot when a short stack goes all-in for less than the other bets', () => {
    const manager = new RoomManager()
    const room = manager.createRoom({ smallBlind: 10, bigBlind: 20 })
    const alice = manager.joinRoom(room.id, 'Alice', 50) // short stack, dealer
    const bob = manager.joinRoom(room.id, 'Bob', 200)
    const carol = manager.joinRoom(room.id, 'Carol', 200)
    const totalBefore = alice.chips + bob.chips + carol.chips
    startHand(room)

    // Preflop: Alice (dealer, first to act) shoves for her entire 50-chip stack.
    applyAction(room, alice.id, { type: 'allin' })
    expect(alice.isAllIn).toBe(true)
    applyAction(room, bob.id, { type: 'call' })
    applyAction(room, carol.id, { type: 'call' })

    expect(room.bettingRound).toBe('flop')
    // Alice can no longer act, but Bob and Carol can keep building a side pot.
    expect(room.playersToAct).toEqual([bob.id, carol.id])

    applyAction(room, bob.id, { type: 'raise', amount: 30 })
    applyAction(room, carol.id, { type: 'call' })
    playToShowdown(room)

    expect(room.lastHandResult?.pots).toEqual([
      { amount: 150, winnerIds: expect.any(Array) }, // main pot: Alice, Bob, Carol all contributed 50
      { amount: 60, winnerIds: expect.any(Array) } // side pot: Bob/Carol's extra 30 each
    ])
    expect(alice.chips + bob.chips + carol.chips).toBe(totalBefore)
  })
})
