// src/server.ts
import Fastify from 'fastify'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { showBanner, spinner } from './utils/cli.js'
import dotenv from 'dotenv'
dotenv.config()

const PORT = process.env.PORT || 3000

const app = Fastify()
const server = createServer(app.server)
const io = new SocketIOServer(server)

showBanner()
spinner.start()

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`)
  socket.on('message', (msg) => {
    socket.emit('reply', `Echo: ${msg}`)
  })
})

app.get('/ping', async () => ({ pong: 'it works!' }))

server.listen(PORT, () => {
  spinner.succeed(`Server is live at http://localhost:${PORT}`)
})
