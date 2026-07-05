import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { RoomManager } from './game/room.js'
import { registerHandlers } from './socketHandlers.js'

const app = express()
app.use(cors())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

const manager = new RoomManager()

io.on('connection', (socket) => {
  registerHandlers(io, socket, manager)
})

const PORT = process.env.PORT || 8082
httpServer.listen(PORT, () => {
  console.log(`poker-online-api listening on :${PORT}`)
})
