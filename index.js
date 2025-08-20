require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const admin = require("firebase-admin");
const fs = require ("fs") 

// ==========================
// 🔥 Firebase Setup
// ==========================
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIRE_PROJECT_ID,
    clientEmail: process.env.FIRE_CLIENT_EMAIL,
    privateKey: process.env.FIRE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  databaseURL: "https://crptmax-e1543.firebaseio.com",
});
const db = admin.firestore();

// ==========================
// 🤖 Telegram Bot Setup
// ==========================
const bot = new Telegraf(process.env.BOT_TOKEN);

// ========== Firestore Helpers ==========
async function getUser(userId) {
  const ref = db.collection("users").doc(userId.toString());
  const doc = await ref.get();
  return doc.exists ? doc.data() : null;
}

async function saveUser(userId, data) {
  const ref = db.collection("users").doc(userId.toString());
  await ref.set(data, { merge: true });
}

// ========== Task Verification ==========
async function checkTelegramTasks(userId, bot) {
  try {
    const groupCheck = await bot.telegram.getChatMember(process.env.GROUP_ID, userId);
    const channelcheck = await bot.telegram.getChatMember(process.env.CHANNEL_ID, userId);

    const groupOk = ["member", "administrator", "creator"].includes(groupCheck.status);
    

    return groupOk;
  } catch (e) {
    return false;
  }
}
// ========== /start Command ==========
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");
  const refId = args[1]; // referral user id

  let user = await getUser(userId);

  if (!user) {
    // Register new user
    await saveUser(userId, {
      tasksCompleted: false,
      referrals: 0,
      earned: 0,
      joinedAt: new Date().toISOString(),
      step: "start"
    });

    // // Reward referrer  
if (refId && refId !== userId.toString()) {  
  const refUser = await getUser(refId);  
  if (refUser) {  
    await saveUser(refId, {  
      ...refUser,  
      referrals: (refUser.referrals || 0) + 1,  
      earned: (refUser.earned || 0) + 0.5, // reward for referral  
    });  
  }  
}  

    // Show tasks (first time)
    return sendTasksMessage(ctx);
  }

  // If user exists but hasn’t completed tasks → show tasks again
  if (!user.tasksCompleted) {
    return sendTasksMessage(ctx);
  }

  // If user exists and tasks completed → show stats
  await ctx.replyWithMarkdown(
    `📊 *Your current stats:*  

✅ Tasks completed: Yes  
👥 Referrals: ${user.referrals || 0}  
💰 Total earned: $${(user.earned || 0).toFixed(2)}  

🔗 Referral link:  
\`https://t.me/${ctx.botInfo.username}?start=${userId}\``
  );
});


// ========== Helper: Tasks Message ==========
async function sendTasksMessage(ctx) {
  await ctx.reply(
    `👋 Hello <b>${ctx.from.first_name}</b>! Let's start your journey to earn free <b>Godyence</b>.\n\n
Please complete the following mandatory tasks to receive your $1 reward:\n\n
1️⃣ Join our Telegram Group – <a href="https://t.me/Godyence">https://t.me/Godyence</a>\n
2️⃣ Join Telegram Channel – <a href="https://t.me/Godyence_Announcement">https://t.me/Godyence_Announcement</a>\n
3️⃣ Follow us on Twitter – <a href="https://twitter.com/godyence">https://twitter.com/godyence</a>\n
4️⃣ Follow our CEO on Twitter – <a href="https://twitter.com/alieareza">https://twitter.com/alieareza</a>\n\n
Once you're done, click the button below to continue.`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ I've Completed All Tasks", "completed_tasks")],
      ]),
    }
  );
}

// ========== Verify Telegram Tasks ==========
bot.action("completed_tasks", async (ctx) => {
  const userId = ctx.from.id;
  const user = await getUser(userId);

  if (user && !user.tasksCompleted) {
    const ok = await checkTelegramTasks(userId, bot);

    if (!ok) {
      return ctx.answerCbQuery("❌ Please join both Telegram group & channel first!");
    }

    await saveUser(userId, { step: "twitter" });

    await ctx.editMessageText(
      "✅ Telegram tasks verified!\n\nNow please send me your **Twitter (X) username**:",
      { parse_mode: "Markdown" }
    );
  }
});

// ========== Handle Text Replies ==========
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const user = await getUser(userId);
  if (!user) return;

  // Step 1: Twitter username
  if (user.step === "twitter") {
    const exists = await db.collection("users")
      .where("twitter", "==", ctx.message.text)
      .get();

    if (!exists.empty) {
      return ctx.reply("❌ This Twitter username has already been used!");
    }

    await saveUser(userId, { twitter: ctx.message.text, step: "wallet" });

    return ctx.reply("👍 Twitter saved!\n\nNow please send me your **Base wallet address**:");
  }

  // Step 2: Wallet address
  if (user.step === "wallet") {
    const exists = await db.collection("users")
      .where("wallet", "==", ctx.message.text)
      .get();

    if (!exists.empty) {
      return ctx.reply("❌ This wallet address is already registered!");
    }

    await saveUser(userId, {
      wallet: ctx.message.text,
      step: "done",
      tasksCompleted: true,
      earned: (user.earned || 0) + 1
    });

    return ctx.replyWithMarkdown(
      `🎉 All tasks completed!  

📊 *Your Stats:*  
✅ Tasks completed: Yes  
👥 Referrals: ${user.referrals || 0}  
💰 Total earned: $${((user.earned || 0) + 1).toFixed(2)}  

🔗 Your referral link:  
\`https://t.me/${ctx.botInfo.username}?start=${userId}\``
    );
  }
});

const ADMIN_IDS = process.env.ADMIN_IDS.split(",").map(id => id.trim());

// 🔒 Check if user is admin
function isAdmin(ctx) {
  return ADMIN_IDS.includes(ctx.from.id.toString());
}

// 🏠 Admin dashboard entry
bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("🚫 You are not authorized.");
  
  await ctx.reply("📊 Admin Dashboard", Markup.inlineKeyboard([
    [Markup.button.callback("👥 View All Users", "admin_users")],
    [Markup.button.callback("📂 Download Users (CSV)", "admin_download_csv")],
    [Markup.button.callback("📂 Download Users (JSON)", "admin_download_json")],
    [Markup.button.callback("🔢 Total Users", "admin_total")],
    [Markup.button.callback("🏆 Referral Leaderboard", "admin_leaderboard")],
    [Markup.button.callback("👛 Wallets Only", "admin_wallets")],
    [Markup.button.callback("🐦 X Usernames Only", "admin_usernames")],
  ]));
});
// 👥 View all users
bot.action("admin_users", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const snapshot = await db.collection("users").get();
  if (snapshot.empty) return ctx.reply("No users found.");

  let messages = [];
  let msg = "👥 Users:\n\n";

  snapshot.forEach((doc) => {
    const u = doc.data();
    msg += `• ${u.twitter || "N/A"} | ${u.wallet || "N/A"}\n`;

    // Split if too long
    if (msg.length > 3500) {
      messages.push(msg);
      msg = "";
    }
  });

  if (msg) messages.push(msg);

  for (let m of messages) {
    await ctx.reply(m);
  }
});

// 📂 Download as CSV
bot.action("admin_download_csv", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const snapshot = await db.collection("users").get();
  if (snapshot.empty) return ctx.reply("No users.");

  let rows = [["telegramId", "twitter", "wallet", "referrals", "earned"]];
  snapshot.forEach(doc => {
    const u = doc.data();
    rows.push([
      doc.id,
      u.twitter || "",
      u.wallet || "",
      u.referrals || 0,
      u.earned || 0
    ]);
  });

  const csv = rows.map(r => r.join(",")).join("\n");
  await ctx.replyWithDocument({ source: Buffer.from(csv), filename: "users.csv" });
});

// 📂 Download as JSON
bot.action("admin_download_json", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const snapshot = await db.collection("users").get();
  if (snapshot.empty) return ctx.reply("No users.");

  let users = [];
  snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));

  await ctx.replyWithDocument({
    source: Buffer.from(JSON.stringify(users, null, 2)),
    filename: "users.json"
  });
});

// 🔢 Total Users
bot.action("admin_total", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const snapshot = await db.collection("users").get();
  ctx.reply(`👥 Total Users: ${snapshot.size}`);
});

// 🏆 Referral Leaderboard
bot.action("admin_leaderboard", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const snapshot = await db.collection("users").get();
  let leaderboard = [];
  snapshot.forEach(doc => {
    const u = doc.data();
    leaderboard.push({ twitter: u.twitter || "N/A", referrals: u.referrals || 0 });
  });

  leaderboard.sort((a, b) => b.referrals - a.referrals);
  leaderboard = leaderboard.slice(0, 10);

  let msg = "🏆 Top 10 Referrals:\n\n";
  leaderboard.forEach((u, i) => {
    msg += `${i + 1}. ${u.twitter} — ${u.referrals}\n`;
  });

  ctx.reply(msg);
});

// 👛 Wallets only
bot.action("admin_wallets", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const snapshot = await db.collection("users").get();
  let wallets = [];
  snapshot.forEach(doc => {
    const u = doc.data();
    if (u.wallet) wallets.push(u.wallet);
  });

  if (!wallets.length) return ctx.reply("No wallets found.");

  await ctx.replyWithDocument({
    source: Buffer.from(wallets.join("\n")),
    filename: "wallets.txt"
  });
});

// 🐦 Usernames only (Twitter handles)
bot.action("admin_usernames", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const snapshot = await db.collection("users").get();
  let usernames = [];
  snapshot.forEach(doc => {
    const u = doc.data();
    if (u.twitter) usernames.push(u.twitter);
  });

  if (!usernames.length) return ctx.reply("No usernames found.");

  await ctx.replyWithDocument({
    source: Buffer.from(usernames.join("\n")),
    filename: "usernames.txt"
  });
});

// ==========================
// 🚀 Launch Bot
// ==========================
bot.launch();
console.log("🚀 Airdrop bot is running...");
