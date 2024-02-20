const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
let db = null
const dbPath = path.join(__dirname, 'twitterClone.db')
const app = express()
app.use(express.json())
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('server Running At http://localhost/3000/')
    })
  } catch (e) {
    console.log(`Error Occured:${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()
const authenticator = (request, response, next) => {
  let jwtToken
  const header = request.headers['authorization']
  if (header !== undefined) {
    jwtToken = header.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'puli', async (error, user) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = user.username
        request.userId = user.userId
        next()
      }
    })
  }
}
//tweet Access Token
const tweetAccessToken = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const sqlQuery = `
  select * from tweet join follower on tweet.user_id=follower.following_user_id
  where tweet.tweet_id='${tweetId}' and follower_user_id='${userId}'
  `
  const tweet = await db.get(sqlQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}
//Register
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const encryptedPassword = await bcrypt.hash(password, 10)
  const sqlQuery = `
    SELECT * FROM USER WHERE username = '${username}';
    `
  const user = await db.get(sqlQuery)
  if (user === undefined) {
    if (password.length > 6) {
      const insertQuery = `
        INSERT INTO USER(name,username,password,gender)
        values('${name}','${username}','${encryptedPassword}','${gender}');
        `
      await db.run(insertQuery)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})
//Login
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const sqlQuery = `
  SELECT * FROM user WHERE username='${username}';
  `
  const user = await db.get(sqlQuery)
  if (user === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, user.password)
    let payload = {username: username, userId: user.user_id}
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(payload, 'puli')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})
//API 3
app.get('/user/tweets/feed/', authenticator, async (request, response) => {
  const {username} = request
  const sqlQuery = `
  SELECT follower.following_user_id from user join follower on user.user_id=follower.follower_user_id
  where username='${username}';
  `
  const followingArray = await db.all(sqlQuery)
  const arrayOfIds = followingArray.map(eachId => eachId.following_user_id)
  const tweet = `
  SELECT user.username,
  tweet.tweet,
  tweet.date_time as dateTime
  from user join tweet on user.user_id=tweet.user_id
  where user.user_id in (${arrayOfIds})
  order by tweet.date_time DESC
  limit 4;
  `
  const tweetsArray = await db.all(tweet)
  response.send(tweetsArray)
})
//Returns the list of all names of people whom the user follows
app.get('/user/following/', authenticator, async (request, response) => {
  const {username, userId} = request
  const sqlQuery = `
  select name from user join follower on follower.following_user_id=user.user_id
  where follower_user_id='${userId}';
  `
  const followingArray = await db.all(sqlQuery)
  response.send(followingArray)
})
//Returns the list of all names of people who follows the user
app.get('/user/followers/', authenticator, async (request, response) => {
  const {username, userId} = request
  const sqlQuery = `
  select distinct name from user join follower on follower.follower_user_id=user.user_id
  where following_user_id='${userId}';
  `
  const followingArray = await db.all(sqlQuery)
  response.send(followingArray)
})
//API 6
app.get(
  '/tweets/:tweetId/',
  authenticator,
  tweetAccessToken,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const sqlQuery = `
  select tweet,
  (select count() from like where tweet_id='${tweetId}') as likes,
  (select count() from reply where tweet_id='${tweetId}') as replies,
  date_time as dateTime
  from tweet
  where tweet.tweet_id='${tweetId}';
  `
    const tweets = await db.get(sqlQuery)
    response.send(tweets)
  },
)
//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticator,
  tweetAccessToken,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const sqlQuery = `
  select username from user join like on user.user_id=like.user_id
  where like.tweet_id='${tweetId}';
  `
    const usernames = await db.all(sqlQuery)
    const usernameArray = usernames.map(each => each.username)
    response.send({likes: usernameArray})
  },
)
//Api 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticator,
  tweetAccessToken,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const sqlQuery = `
  select name,reply from user join reply on user.user_id=reply.user_id
  where reply.tweet_id='${tweetId}';
  `
    const usernames = await db.all(sqlQuery)
    response.send({replies: usernames})
  },
)
//API 9
app.get('/user/tweets/', authenticator, async (request, response) => {
  const {username, userId} = request
  const sqlQuery = `
  select tweet,
  count(distinct like_id) as likes,
  count(distinct reply_id) as replies,
  date_time as dateTime
   from tweet left join reply on
   tweet.tweet_id=reply.tweet_id
   left join like on tweet.tweet_id=like.tweet_id
    where tweet.user_id='${userId}'
    group by tweet.tweet_id;
  `
  const tweets = await db.all(sqlQuery)
  response.send(tweets)
})
//API 10
app.post('/user/tweets/', authenticator, async (request, response) => {
  const userId = parseInt(request.userId)
  const {tweet} = request.body
  const dateTime = new Date().toJSON().substring(8, 19).replace('T', ' ')
  const sqlQuery = `
  insert into tweet(tweet,user_id,date_time)
  values('${tweet}','${userId}','${dateTime}')
  `
  await db.run(sqlQuery)
  response.send('Created a Tweet')
})

//API 11
app.delete('/tweets/:tweetId/', authenticator, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request
  const sqlQuery = `
  select * from tweet where user_id='${userId}' AND tweet_id='${tweetId}'
  `
  const tweet = await db.get(sqlQuery)
  console.log(tweet)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deleteQuery = `
    delete from tweet where tweet_id='${tweetId}'
    `
    await db.run(deleteQuery)
    response.send('Tweet Removed')
  }
})
module.exports = app
