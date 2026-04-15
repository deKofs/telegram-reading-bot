require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const Anthropic = require("@anthropic-ai/sdk");
const https = require("https");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `אתה עוזר אישי לניהול מידע. אתה עובד עם שני Databases ב-Notion:
1. 📚 Reading List — https://www.notion.so/155d6aa363044601b1bc89dfa5270b31
2. 📝 Meeting Notes — https://www.notion.so/7fd60799ae334401abf1508972e210f8

כשאתה מקבל לינק בלבד:
1. קרא את הדף / זהה את הסוג (מאמר / YouTube / טוויט / פודקאסט / אחר)
2. חלץ: כותרת, סיכום של 2-3 משפטים בעברית
3. בחר קטגוריה: טכנולוגיה / עסקים / מדע / חדשות / עיצוב / אחר
4. בחר 1-3 תגיות: AI, startups, design, science, politics, culture
5. YouTube: השתמש ב-https://img.youtube.com/vi/[VIDEO_ID]/maxresdefault.jpg כ-Cover. מאמר: נסה לחלץ og:image.
6. שמור ב-Reading List עם סטטוס "📥 לקרוא"

כשאתה מקבל טקסט + לינק (הודעת WhatsApp):
1. שמור את ההודעה כפי שהיא
2. השתמש בלינק כ-URL, בשורה הראשונה ככותרת, בגוף ההודעה ב"סיכום קצר"
3. זהה קטגוריה ותגיות
4. אם יש תמונה מצורפת — השתמש בה כ-Cover. אחרת נסה og:image מהלינק.
5. שמור ב-Reading List עם סטטוס "📥 לקרוא"

כשאתה מקבל תמונה בלבד:
1. חלץ את כל הטקסט מהתמונה
2. אם זה סיכום פגישה — שמור ב-Meeting Notes עם כותרת, תאריך, נקודות עיקריות, משימות, החלטות. השתמש בתמונה כ-Cover.
3. אם זה תוכן כללי — שמור ב-Reading List כ"🔗 אחר". השתמש בתמונה כ-Cover.

כשאתה לא בטוח מה לעשות:
שאל ותציע אפשרויות:
א) שמור ב-📚 Reading List
ב) שמור ב-📝 Meeting Notes
ג) תאר לי מה זה ואחליט

כללים:
- תמיד ענה בעברית
- תמיד ציין באיזה Database נשמר הפריט
- תמיד ספק לינק ישיר לעמוד שנשמר ב-Notion בפורמט: [פתח ב-Notion](URL)
- תמיד נסה להוסיף Cover Image

פורמט תגובה חובה אחרי שמירה:
✅ נשמר ב־[Database]
📌 כותרת: [כותרת]
📝 סיכום: [2-3 משפטים אם רלוונטי]
🖼️ תמונה: [נוספה / לא נמצאה]
🔗 [פתח ב-Notion](לינק)`;

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

async function handleMessage(msg) {
  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(chatId, "⏳ מעבד...");

    const content = [];

    if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileInfo = await bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${fileInfo.file_path}`;
      const imgBuffer = await downloadImage(fileUrl);

      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: imgBuffer.toString("base64"),
        },
      });
      content.push({
        type: "text",
        text: msg.caption || "שמור את התוכן הזה בהתאם להוראות.",
      });
    } else {
      content.push({ type: "text", text: msg.text || "" });
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
      mcp_servers: [
        {
          type: "url",
          url: "https://mcp.notion.com/mcp",
          name: "notion-mcp",
        },
      ],
    });

    const result = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    await bot.sendMessage(chatId, result, { parse_mode: "Markdown" });
  } catch (err) {
    console.error(err);
    await bot.sendMessage(chatId, `❌ שגיאה: ${err.message}`);
  }
}

bot.on("message", handleMessage);
console.log("🤖 בוט פועל...");
