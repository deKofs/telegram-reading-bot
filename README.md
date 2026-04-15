# 🤖 Telegram Reading Bot

בוט טלגרם שמקבל לינקים, הודעות WhatsApp ותמונות — ושומר אותם אוטומטית ב-Notion.

## מה הבוט עושה

- **לינק** → שומר ב-📚 Reading List עם כותרת, סיכום וקטגוריה
- **הודעת WhatsApp** → שומר ב-📚 Reading List עם הטקסט המלא
- **תמונה** → חולץ טקסט ושומר ב-📝 Meeting Notes או Reading List

## הגדרה

### משתני סביבה (.env)
```
TELEGRAM_TOKEN=הטוקן-מ-BotFather
ANTHROPIC_API_KEY=המפתח-שלך
NOTION_API_TOKEN=הטוקן-של-notion
```

### הפעלה ראשונה בשרת
```bash
git clone https://github.com/YOUR_USERNAME/telegram-reading-bot.git /opt/telegram-bot
cd /opt/telegram-bot
npm install
nano .env   # הוסף את המפתחות
pm2 start bot.js --name telegram-bot
pm2 save
pm2 startup
```

### Deploy אוטומטי
כל `git push` ל-`main` מריץ deploy אוטומטי דרך GitHub Actions.

**GitHub Secret נדרש:** `SSH_PRIVATE_KEY`
