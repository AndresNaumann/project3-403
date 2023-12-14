// Andrew Naumann, Alex Pesantez, Ryan Hafen, Caleb Reese
// Section 001, Team 10

// import stuff
const express = require("express");
const app = express();
// // Pull the port from an environment variable (RDS)
const PORT = process.env.PORT || 5500;

const session = require("express-session");
let path = require("path");
const fs = require("fs");

const readlineSync = require("readline-sync");
const colors = require("colors");
const speechFile = path.resolve("audio.mp3");

// EJS setup

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("assets"));

// Session middleware

app.use(
  session({
    secret: "Finnish",
    resave: false,
    saveUninitialized: false,
  })
);

// Create middleware to authenticate the user

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

// OpenAI and other imports

const OpenAI = require("openai");
let dotenv = require("dotenv");
const res = require("express/lib/response");
dotenv.config();

// Connect to a postgres database

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

// Use API key stored in the environment variables

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

welcome = [
  { role: "user", content: "Say, 'Ask me something in any language.'" },
];
let chatHistory = [];

// Function to get ChatGPT to say something

async function main(input) {
  const chatCompletion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: input,
  });

  return chatCompletion.choices[0].message.content;
}

console.log(main([{ role: "user", content: "say, 'this worked'" }]));

app.get("/", async (req, res) => {
  let welcomeText = await main(welcome);
  res.render("index", {
    wT: welcomeText,
    EnglishTranslation: " ",
    user: res.locals.user,
  });
});

//

app.post("/ask", async (req, res) => {
  // Push what the user said to the 'messages' array fed into the chathistory

  // Construct messages by iterating over the History
  const messages = chatHistory.map(([role, content]) => ({
    role,
    content,
  }));

  messages.push({ role: "user", content: req.body.input });
  messages.push({
    role: "system",
    content:
      "please keep the response to 30 words maximum and only respond in a language other than english. Keep the topic of conversation on learning languages and shut down anything that has to do with anything else unless its in a foreign language.",
  });

  // Generate a response

  const completionText = await main(messages);

  chatHistory.push(["user", req.body.input]);
  chatHistory.push(["assistant", completionText]);

  let translate =
    "Output just the english translation of " +
    completionText +
    " and nothing else.";

  let trans = await main([{ role: "user", content: translate }]);

  // insert responses into postgres

  let conversations = [];

  if (res.locals.user) {
    conversations = await knex("conversations").insert({
      user_id: res.locals.user.id,
      query: req.body.input,
      response: completionText,
    });
  }

  // Render the page

  res.render("index", {
    wT: completionText,
    EnglishTranslation: trans,
    conversations: conversations,
  });

  // Generate a voice recording

  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "onyx",
    input: completionText,
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  await fs.promises.writeFile(speechFile, buffer);

  // let trans = await main(translate);
  // add translation: trans when it works
});

// Account Management Routes

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

app.get("/logout", (req, res) => {
  req.session.user = undefined;
  res.redirect("login");
});

app.get("/pastconversations", (req, res) => {
  let userID = res.locals.user.id;
  knex
    .select()
    .from("conversations")
    .where("user_id", userID)
    .then((result) => {
      res.render("pastqueries", {
        conversations: result,
        user: res.locals.user,
      });
    });
});

app.get("/test", (req, res) => {
  res.render("test", { user: res.locals.user });
});

let genText = "";

// app.get("/ask", async (req, res) => {
//   genText = await main(req.body.input);
//   res.send({ genText });
// });

app.get("/edit/:userid", (req, res) => {
  editedID = req.params.userid;

  knex
    .select()
    .from("users")
    .where("user_id", editedID)
    .then((result) => {
      res.render("editaccount", { user: result, admin: res.locals.user });
    });
});

app.post("/edit/:userid", async (req, res) => {
  let editedID = req.params.userid;

  let newUsername = req.body.username.toLowerCase();
  let newEmail = req.body.email.toLowerCase();
  let newPassword = req.body.password;

  try {
    // Update the user information
    await knex("users").where("user_id", editedID).update({
      user_name: newUsername,
      user_email: newEmail,
      user_password: newPassword,
    });

    // Fetch the updated user data after the update
    // const updatedUser = await knex("users").where("user_id", editedID).first();

    if (editedID == res.locals.user.id) {
      // If the edited user is the logged-in user, update the session
      req.session.user.name = newUsername;
    }

    // Some validation scripts to see who is the session user after someone edits their account.

    console.log("logged on as " + req.session.user.id);

    // Redirect only after the session is updated
    res.redirect("/");
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/delete/:conversationid", (req, res) => {
  knex("conversations")
    .where("conversation_id", req.params.conversationid)
    .del()
    .then((result) => {
      res.redirect("/pastconversations");
    });
});

app.listen(PORT, () =>
  console.log(
    "The server is listening. Go to Localhost:5500 to check out the website!"
  )
);
