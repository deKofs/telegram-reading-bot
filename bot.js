require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const Anthropic = require("@anthropic-ai/sdk");
const { Client } = require("@notionhq/client");
const https = require("https");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const notion = new Client({ auth: process.env.NOTION_API_TOKEN });

const READING_LIST_DB = "155d6aa363044601b1bc89dfa5270b31";
const MEETING_NOTES_DB = "7fd60799ae334401abf1508972e210f8";

const SYSTEM_PROMPT = `אתה עוזר אישי לניהול מידע. אתה מנתח תוכן ומחזיר JSON בלבד — ללא טקסט נוסף, ללא markdown code blocks.

כשאתה מקבל לינק בלבד:
1. זהה את הסוג — אחד מ: "📄 מאמר", "🎥 YouTube", "🐦 טוויט", "🎙️ פודקאסט", "🔗 אחר"
2. חלץ: כותרת, סיכום של 2-3 משפטים בעברית
3. בחר קטגוריה: טכנולוגיה / עסקים / מדע / חדשות / עיצוב / אחר
4. בחר 1-3 תגיות: AI, startups, design, science, politics, culture
5. YouTube: השתמש ב-https://img.youtube.com/vi/[VIDEO_ID]/maxresdefault.jpg כ-cover_image. מאמר: נסה לחלץ og:image.
החזר:
{"database":"reading_list","title":"...","url":"...","type":"📄 מאמר","summary":"...","category":"...","tags":["..."],"cover_image":"..."}

כשאתה מקבל טקסט + לינק (הודעת WhatsApp):
1. השתמש בלינק כ-URL, בשורה הראשונה ככותרת, בגוף ההודעה ב-summary
2. זהה סוג, קטגוריה ותגיות
3. נסה og:image מהלינק כ-cover_image
החזר:
{"database":"reading_list","title":"...","url":"...","type":"🔗 אחר","summary":"...","category":"...","tags":["..."],"cover_image":"..."}

כשאתה מקבל תמונה בלבד:
1. חלץ את כל הטקסט מהתמונה
2. אם זה סיכום פגישה — החזר:
{"database":"meeting_notes","title":"...","date":"YYYY-MM-DD","key_points":"...","tasks":"...","decisions":"..."}
3. אם זה תוכן כללי — החזר JSON של reading_list עם url: null וסוג "🔗 אחר"

כשאתה לא בטוח:
החזר: {"database":"unclear","question":"..."}

חשוב: JSON תקין בלבד. אסור markdown, אסור טקסט לפני/אחרי. cover_image יכול להיות null.`;

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
  });
}

async function saveToNotion(data, telegramImageUrl = null) {
  const coverUrl = telegramImageUrl || data.cover_image || null;

  if (data.database === "reading_list") {
    const properties = {
      כותרת: { title: [{ text: { content: data.title || "ללא כותרת" } }] },
      סטטוס: { select: { name: "📥 לקרוא" } },
    };
    if (data.url) properties["URL"] = { url: data.url };
    if (data.summary) properties["סיכום קצר"] = { rich_text: [{ text: { content: data.summary } }] };
    if (data.category) properties["קטגוריה"] = { select: { name: data.category } };
    if (data.type) properties["סוג"] = { select: { name: data.type } };
    if (data.tags?.length) properties["תגיות"] = { multi_select: data.tags.map((t) => ({ name: t })) };

    const pageParams = { parent: { database_id: READING_LIST_DB }, properties };
    if (coverUrl) pageParams.cover = { type: "external", external: { url: coverUrl } };

    const page = await notion.pages.create(pageParams);
    return { page, database: "Reading List" };
  }

  if (data.database === "meeting_notes") {
    const properties = {
      כותרת: { title: [{ text: { content: data.title || "ללא כותרת" } }] },
      סטטוס: { select: { name: "✍️ טיוטה" } },
    };
    if (data.date) properties["תאריך פגישה"] = { date: { start: data.date } };
    if (data.key_points) properties["נקודות עיקריות"] = { rich_text: [{ text: { content: data.key_points } }] };
    if (data.tasks) properties["משימות להמשך"] = { rich_text: [{ text: { content: data.tasks } }] };
    if (data.decisions) properties["החלטות"] = { rich_text: [{ text: { content: data.decisions } }] };

    const pageParams = { parent: { database_id: MEETING_NOTES_DB }, properties };
    if (coverUrl) pageParams.cover = { type: "external", external: { url: coverUrl } };

    const page = await notion.pages.create(pageParams);
    return { page, database: "Meeting Notes" };
  }

  throw new Error("Unknown database: " + data.database);
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(chatId, "⏳ מעבד...");

    const content = [];
    let telegramImageUrl = null;

    if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileInfo = await bot.getFile(fileId);
      telegramImageUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${fileInfo.file_path}`;
      const imgBuffer = await downloadImage(telegramImageUrl);

      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: imgBuffer.toString("base64") },
      });
      content.push({ type: "text", text: msg.caption || "נתח את התמונה ושמור בהתאם להוראות." });
    } else {
      content.push({ type: "text", text: msg.text || "" });
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const data = JSON.parse(raw);

    if (data.database === "unclear") {
      await bot.sendMessage(chatId, `❓ ${data.question}\n\nענה עם:\nא) Reading List\nב) Meeting Notes\nג) תאר לי מה זה ואחליט`);
      return;
    }

    const { page, database } = await saveToNotion(data, telegramImageUrl);
    const pageUrl = `https://notion.so/${page.id.replace(/-/g, "")}`;
    const coverLine = telegramImageUrl || data.cover_image ? "נוספה ✅" : "לא נמצאה ❌";

    await bot.sendMessage(
      chatId,
      `✅ נשמר ב־${database}\n📌 כותרת: ${data.title}\n📝 סיכום: ${data.summary || ""}\n🖼️ תמונה: ${coverLine}\n🔗 [פתח ב-Notion](${pageUrl})`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error(err);
    await bot.sendMessage(chatId, `❌ שגיאה: ${err.message}`);
  }
}

bot.on("message", handleMessage);
console.log("🤖 בוט פועל...");
