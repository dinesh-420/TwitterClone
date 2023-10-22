const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());
let db = null;
const dbPath = path.join(__dirname, "twitterClone.db");

initializeServerAndDb = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server is running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`Db Error: ${error.message}`);
    process.exit(1);
  }
};

initializeServerAndDb();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "asdfghjkl", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const checkUserName = `
  SELECT * from user WHERE username='${username}';
  `;
  const dbResponse = await db.get(checkUserName);
  if (dbResponse !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUser = `
        INSERT INTO user(username,password,name,gender)
        VALUES('${username}','${hashedPassword}','${name}','${gender}');
        `;
      const dbResponse = await db.run(createUser);
      const user_id = dbResponse.lastId;
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserName = `
    SELECT * from user WHERE username='${username}';
    `;
  const dbResponse = await db.get(checkUserName);
  if (dbResponse === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const comparePassword = await bcrypt.compare(password, dbResponse.password);
    if (comparePassword) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "asdfghjkl");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { offset, limit, order, order_by } = request.query;
  let { username } = request;
  const getFollowingUsers = `
      SELECT DISTINCT username,tweet,date_time as dateTime FROM
        (user inner join follower on user.user_id=follower.following_user_id) as T 
      inner join tweet on T.user_id=tweet.user_id
      WHERE T.follower_user_id = (SELECT user_id FROM user WHERE username = '${username}')
    ORDER BY ${order_by} ${order}
    LIMIT ${limit} OFFSET ${offset};
      `;
  const dbResponse = await db.all(getFollowingUsers);
  response.send(dbResponse);
});

//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getFollowingUsers = `
    SELECT u.name
    FROM user AS u
    JOIN follower AS f ON u.user_id = f.following_user_id
    WHERE f.follower_user_id = (SELECT user_id FROM user WHERE username = '${username}');
    `;
  const dbResponse = await db.all(getFollowingUsers);
  response.send(dbResponse);
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getFollowers = `
    SELECT u.name FROM user as u inner join follower as f on 
    u.user_id=f.follower_user_id
    WHERE
    f.following_user_id=(SELECT user_id FROM user WHERE username='${username}');
    `;
  const dbResponse = await db.all(getFollowers);
  response.send(dbResponse);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const checkUserFollowing = `
 SELECT DISTINCT tweet.tweet, 
                    COUNT(like.user_id) as likes, 
                    COUNT(reply.reply_id) as replies, 
                    tweet.date_time as dateTime
    FROM tweet
    LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.tweet_id = ? AND tweet.user_id IN (
      SELECT following_user_id
      FROM follower
      WHERE follower_user_id = (SELECT user_id FROM user WHERE username = ?)
    )
    GROUP BY tweet.tweet, tweet.date_time;
  `;
  const dbResponse = await db.get(checkUserFollowing);
  if (dbResponse !== undefined) {
    response.send(dbResponse);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const checkUserFollowing = `
  SELECT DISTINCT username
    FROM user 
    INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE user.username = '${username}';
  `;
    const dbResponse = await db.all(checkUserFollowing);
    if (dbResponse !== undefined) {
      const getLikedUsers = `
        select username from user inner join like on user.user_id=like.user_id
        where like.tweet_id=${tweetId};
        `;
      const likes = await db.all(getLikedUsers);
      const likedBy = likes.map((user) => user.username);
      response.send({ likes: likedBy });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const checkUserFollowing = `
  SELECT following_user_id
    FROM follower
    WHERE following_user_id = (SELECT user_id FROM user WHERE username = '${username}')
    AND follower_user_id = (SELECT user_id FROM tweet WHERE tweet_id = ${tweetId});
  `;
    const dbResponse = await db.all(checkUserFollowing);
    if (dbResponse !== undefined) {
      const getRepliedUsers = `
       SELECT u.name, r.reply
        FROM user AS u
        INNER JOIN reply AS r ON u.user_id = r.user_id
        WHERE r.tweet_id = ${tweetId};
        `;
      const replies = await db.all(getRepliedUsers);
      //   const repliedBy = replies.map((user) => user.username);
      response.send({ replies: replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getAllTweets = `
  SELECT DISTINCT tweet.tweet, 
                    COUNT(like.user_id) as likes, 
                    COUNT(reply.reply_id) as replies, 
                    tweet.date_time as dateTime
    FROM user 
    INNER JOIN tweet ON user.user_id = tweet.user_id
    LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE user.username = '${username}'
    GROUP BY tweet.tweet, tweet.date_time;
  `;
  const dbResponse = await db.all(getAllTweets);
  response.send(dbResponse);
});

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  let { username } = request;
  const userID = `select user_id from user where username='${username}';`;
  const user = await db.get(userID);
  const currentDateTime = new Date();
  const year = currentDateTime.getFullYear();
  const month = String(currentDateTime.getMonth() + 1).padStart(2, "0");
  const day = String(currentDateTime.getDate()).padStart(2, "0");
  const hours = String(currentDateTime.getHours()).padStart(2, "0");
  const minutes = String(currentDateTime.getMinutes()).padStart(2, "0");
  const seconds = String(currentDateTime.getSeconds()).padStart(2, "0");
  const formattedDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  const createTweet = `
  INSERT INTO tweet (tweet,user_id,date_time)
  VALUES('${tweet}',${user.user_id},'${formattedDateTime}');
  `;
  const dbResponse = await db.run(createTweet);
  const tweet_id = dbResponse.lastId;
  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const getUser = `
    select user_id from user where username='${username}';`;
    const user = await db.get(getUser);
    if (user === undefined) {
      response.status(401);
      response.send("Invalid Request");
    }
    const checkTweet = `
    select user_id from tweet where tweet_id=${tweetId};
    `;
    const Tweet = await db.get(checkTweet);
    if (Tweet !== undefined) {
      const deleteTweet = `
        DELETE FROM tweet where tweet_id=${tweetId};
        `;
      const dbResponse = await db.run(deleteTweet);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
