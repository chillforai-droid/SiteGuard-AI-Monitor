# 🚀 Render पर Free Deploy करने का तरीका

## Step 1 — GitHub पर Upload करो

1. GitHub पर नया repository बनाओ (public या private दोनों काम करेंगे)
2. इस पूरे folder को उस repo में push करो:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

## Step 2 — Render पर Deploy करो

1. [render.com](https://render.com) पर account बनाओ (free)
2. **"New +"** → **"Web Service"** click करो
3. GitHub repo connect करो
4. ये settings use करो:

   | Setting | Value |
   |---------|-------|
   | **Build Command** | `npm install && npm run build` |
   | **Start Command** | `npm start` |
   | **Runtime** | Node |
   | **Plan** | Free |

5. Environment Variables में सिर्फ ये डालो:
   - `NODE_ENV` = `production`
   - `PORT` = `3001`

   > ⚠️ कोई API key नहीं डालना — users खुद Settings में डालेंगे

6. **"Create Web Service"** click करो

## Step 3 — App Use करो

1. Render आपको एक URL देगा जैसे `https://ai-website-monitor-xxxx.onrender.com`
2. उस URL पर जाओ
3. **Settings ⚙️** खोलो और:
   - **OpenRouter API Key**: [openrouter.ai](https://openrouter.ai) से free key लो
   - **Monitor API Key**: कोई भी password set करो (यही आपका login password है)
4. Keys save करो और websites add करो!

## ⚠️ Render Free Plan की limitations

- App 15 minutes की inactivity के बाद sleep हो जाता है (पहली request slow होगी)
- Data (websites/scans) ephemeral storage में है — redeploy पर reset हो सकता है
- Playwright/Lighthouse के लिए Chromium install होना जरूरी है (build में automatic)

## 🔒 Security Model

- **OpenRouter Key**: आपके browser में रहती है, हर request के साथ header में जाती है
- **GitHub Token**: per-website store होता है (server के data में)
- **Monitor API Key**: आपका password — browser में रहती है, write operations protect करती है
- Server पर कोई API key store नहीं होती

---

## Local Development

```bash
npm install
cp .env.example .env
# .env में PORT=3001 रखो, बाकी खाली छोड़ो
npm run dev
# App खोलो: http://localhost:5173
# Settings में अपनी keys डालो
```
