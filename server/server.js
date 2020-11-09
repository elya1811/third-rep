import express from 'express'
import path from 'path'
import cors from 'cors'
import bodyParser from 'body-parser'
import sockjs from 'sockjs'
import axios from 'axios'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'

import cookieParser from 'cookie-parser'
import config from './config'
import Html from '../client/html'

const Root = () => ''

try {
  // eslint-disable-next-line import/no-unresolved
  // ;(async () => {
  //   const items = await import('../dist/assets/js/root.bundle')
  //   console.log(JSON.stringify(items))

  //   Root = (props) => <items.Root {...props} />
  //   console.log(JSON.stringify(items.Root))
  // })()
  console.log(Root)
} catch (ex) {
  console.log(' run yarn build:prod to enable ssr')
}

let connections = []

const port = process.env.PORT || 8090
const server = express()
const { readFile, writeFile, unlink  } = require('fs').promises

const middleware = [
  cors(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  bodyParser.json({ limit: '50mb', extended: true }),
  cookieParser()
]

middleware.forEach((it) => server.use(it))

const wFile = (users) => {
  return writeFile(`${__dirname}/users.json`, JSON.stringify(users), { encoding: 'utf8' })
}

const rFile = () => {
  return readFile(`${__dirname}/users.json`, { encoding: 'utf8' })
    .then((data) => JSON.parse(data))
    .catch(async () => {
      const { data: users } = await axios('https://jsonplaceholder.typicode.com/users/')
      wFile(users)
      return users
    })
}

server.get('/api/v1/users', async (req, res) => {
  const users = await rFile()
  res.json(users)
})

server.get('/api/v1/users/:id', async (req, res) => {
  const { id } = req.params
  const users = await rFile()
  const user = users.filter((el) => el.id === +id)
  res.json(user)
})

server.post('/api/v1/users/:id', async (req, res) => {
  const newUser = req.body
  const users = await rFile()
  const id = users[users.length - 1].id + 1
  const thisUser = [...users, { ...newUser, id }]
  wFile(thisUser)
  res.json(thisUser)
})

server.patch('/api/v1/users/:userId', async(req,res) => {
  const { userId } = req.params
  const userUpdate = req.body
  const users = await rFile()
  const id = users.map(el => el.id === +userId ? {...el, ...userUpdate } : el)
  await wFile(id)
  res.json(id)
})

server.delete('/api/v1/users/:userId', async(req,res) => {
  const { userId } = req.params
  const users = await rFile()
  const idDel = users.filter(el => el.id !== +userId)
  wFile(idDel)
  res.json({status: 'User is deleted'})
})



server.delete('/api/v1/users', async(req,res) => {
  unlink(`${__dirname}/users.json`)
  res.json('file deleted')
})

server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'yourproject - Become an IT HERO'
}).split('separator')

server.get('/', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

server.get('/*', (req, res) => {
  const initialState = {
    location: req.url
  }

  return res.send(
    Html({
      body: '',
      initialState
    })
  )
})

const app = server.listen(port)

if (config.isSocketsEnabled) {
  const echo = sockjs.createServer()
  echo.on('connection', (conn) => {
    connections.push(conn)
    conn.on('data', async () => {})

    conn.on('close', () => {
      connections = connections.filter((c) => c.readyState !== 3)
    })
  })
  echo.installHandlers(app, { prefix: '/ws' })
}
console.log(`Serving at http://localhost:${port}`)
