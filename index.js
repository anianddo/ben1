import express from 'express'
import http from 'http'
import sio from 'socket.io'
import session from 'express-session'
import bodyParser from 'body-parser'
import redis from 'redis'
import connRedis from 'connect-redis'

const RedisStore = connRedis(session)

const app = express()
const server = http.Server(app)
const io = sio(server)

const redisClient = redis.createClient()
redisClient.on('ready', () => {
  console.log("redis is ready")
  redisClient.flushall()
})
const store = new RedisStore({
  client: redisClient,
})

const sessionMiddleware = session({
  store: store,
  secret: 'vmwoewdsdscWE*37ffsd',
  resave: false,
  saveUninitialized: true,
})

io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res, next)
})
app.use(sessionMiddleware)
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: false}))

const chat = io.of('chat')

// 웹소켓 처리
chat.on('connection', socket => {
  const { sessionID } = socket.request

  // 서버에 의해 활성화 된(접속 허가 된) 사용자의 참가
  console.log('a user connected: ', sessionID)
  socket.emit('connected')

  // 채팅 메세지 처리
  socket.on('chat', (message) => {
    store.get(sessionID, (err, sess) => {
      console.log(sessionID)                                        
      if(sess.active){
        console.log(sess.username, sessionID, ': ', message)
        chat.emit('chat', sess.username, message)
      }
    })
  })

  socket.on('disconnect', () => {
    console.log('disconnected: ', sessionID)
    // 2초 기다렸다가 세션 지우고 나갔음을 broadcast 하기
    store.get(sessionID, (err, sess) => {
      
      chat.emit('left', sess.username)
    })
  })
})

// 접속자 목록 주기
app.get('/users', (req, res) => {
  store.all((err, sessions) => {
    const users = sessions.filter(session => {
      return session.username !== undefined
    }).map(session => {
      return session.username
    })

    res.json({users})
  })
})

// 채팅 참여 하기 (닉네임 중복 여부 체크)
app.post('/join', (req, res) => {
  const name = req.body.name
  // join을 했는데 세션에 username이 존재하면 username 교체
  // 세션에 username이 없으면 새로 참여
  
  checkOverlapName(name)
    .then(() => {
      req.session.username = name
      req.session.active = true
      chat.emit('join', name)
  
      res.json({status: 'success', name})
    })
    .catch(() => {
      res.json({status: 'overlap'})
    })
})

// 세션 스토어에서 중복 체크
const checkOverlapName = (name) => {
  return new Promise((resolve, reject) => {
    store.all((err, sessions) => {
      sessions.map(sess => {
        if(sess.username === name)
          reject()
      })
      resolve()
    })
  });
}

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html')
})

server.listen(3000);
