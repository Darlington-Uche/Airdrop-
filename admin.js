
const fs = require ("fs") 
require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const admin = require("firebase-admin");

const bot = new Telegraf(process.env.BOT_TOKEN);

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIRE_PROJECT_ID,
    clientEmail: process.env.FIRE_CLIENT_EMAIL,
    privateKey: process.env.FIRE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

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

bot.launch();
