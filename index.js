// Andrew Naumann, Alex Pesantez, Ryan Hafen, Caleb Reese
// Section 001, Team 10

// import stuff
const express = require("express");
const session = require("express-session");
let path = require("path");
const app = express();

// Middleware

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("assets"));

app.use(
  session({
    secret: "Finnish",
    resave: false,
    saveUninitialized: false,
  })
);

const authenticateUser = (req, res, next) => {
  if (req.session && req.session.user) {
    // If the user is authenticated, pass the user data to the next middleware
    res.locals.user = req.session.user;
  } else {
    res.locals.user = undefined;
  }
  // Continue to the next middleware even if the user is not authenticated
  next();
};

app.use(authenticateUser);

// OpenAI stuff

const OpenAI = require("openai");
let dotenv = require("dotenv");
const fs = require("fs");
const res = require("express/lib/response");
dotenv.config();

// Conversation and Voice

const readlineSync = require("readline-sync");
const colors = require("colors");
const speechFile = path.resolve(`./${Date()}.mp3`);

const knex = require("knex")({
  client: "pg",
  connection: {
    host: process.env.RDS_HOSTNAME,
    user: process.env.RDS_USERNAME,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DB_NAME,
    port: process.env.RDS_PORT,
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

welcome = "Say, 'Ask me something in Any Language'";

async function main(input) {
  const chatCompletion = await openai.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant. your response should be in the same language as the content of the user input and should be less than 30 words",
      },
      {
        role: "user",
        content: input,
      },
    ],
    model: "gpt-3.5-turbo",
  });

  return chatCompletion.choices[0].message.content;
}

let text = main("Say 'This worked'.");

// Server side

app.get("/", async (req, res) => {
  let welcomeText = await main(welcome);
  res.render("index", { wT: welcomeText, EnglishTranslation: " " });
});

app.post("/ask", async (req, res) => {
  let text = await main(req.body.input);
  let translate =
    "Output just the english translation of " + text + " and nothing else.";
  let trans = await main(translate);
  res.render("index", { wT: text, EnglishTranslation: trans });
});

let aUsers = [];

app.get("/login", async (req, res) => {
  await knex
    .select()
    .from("users")
    .then((result) => {
      aUsers = [];
      for (let i = 0; i < result.length; i++) {
        aUsers.push({
          id: result[i].user_id,
          name: result[i].user_name,
          email: result[i].user_email,
          pass: result[i].user_password,
        });
      }
    });

  res.render("login", { user: res.locals.user });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  console.log(username, password);

  // Simulate user data (replace this with your actual user authentication logic)
  const user = aUsers.find((u) => u.name == username && u.pass == password);

  if (user) {
    // Set user data in the session
    req.session.user = user;
    res.redirect("/");
  } else {
    // Handle authentication failure

    res.redirect("/login?error=Authentication Failed");
  }
});

app.get("/register", (req, res) => {
  res.render("register", { user: res.locals.user });
});

app.post("/register", (req, res) => {
  let username = req.body.username.toLowerCase();
  let email = req.body.email.toLowerCase();
  let password = req.body.password;

  knex("users")
    .insert({
      user_name: username,
      user_email: email,
      user_password: password,
    })
    .then((results) => {
      res.redirect("/login");
    });
});

app.get("/pastconversations", (req, res) => {
  res.render("pastqueries");
});

app.get("/test", (req, res) => {
  res.render("test");
});

let genText = "";

// app.get("/ask", async (req, res) => {
//   genText = await main(req.body.input);
//   res.send({ genText });
// });

app.listen(5500);
