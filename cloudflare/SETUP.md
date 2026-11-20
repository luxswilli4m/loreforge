# Setting up your Loreforge cloud server (free, about 15 minutes)

This gives you:
- **One login that works on all your devices.** Your worlds, maps and Library files sync automatically.
- **AI for Story Forge** running on *your* server. Your OpenRouter key (or Cloudflare's own free AI) lives on the server, never on your devices.

You only do this once. Everything below is in the Cloudflare website. There's nothing to install, and you don't need a credit card.

> Cloudflare occasionally renames buttons. If something isn't exactly where described, look for the closest match. The names you type (`STORE`, `AI`, `TOKEN_SECRET` and so on) must be exactly as written.

---

## 1. Create a free Cloudflare account
Go to **dash.cloudflare.com** and sign up (the free plan is all you need).

## 2. Create the storage (a KV namespace)
1. In the left menu open **Storage & databases → Workers KV** (sometimes shown as **Workers & Pages → KV**).
2. Click **Create** (or **Create namespace**), name it `loreforge-data`, and save.

## 3. Create the Worker (your server)
1. Open **Workers & Pages** → **Create** → **Create Worker** (choose the "Hello World" starter if asked).
2. Name it `loreforge-server` and click **Deploy**.
3. Click **Edit code**. Delete everything in the editor and paste in the whole contents of
   [`cloudflare/worker.js`](./worker.js) from this repository. (Open the file on GitHub, click the copy-raw-file button, then paste.)
4. Click **Deploy**.

## 4. Connect the storage and AI (bindings)
In your Worker, go to **Settings → Bindings → Add**:
1. **KV namespace**: variable name `STORE`, namespace `loreforge-data`.
2. **Workers AI**: variable name `AI`. This is Cloudflare's free AI, about 10,000 "neurons" a day.

## 5. Add your secrets
Still in **Settings**, find **Variables and Secrets → Add** and choose type **Secret** for each:

| Name | What to put | Needed? |
|---|---|---|
| `TOKEN_SECRET` | Any long random text, e.g. mash the keyboard for 40+ characters. It signs your logins. | **Yes** |
| `INVITE_CODE` | A word only you know. It's needed to create an account, so strangers can't sign up on your server. | Strongly recommended |
| `ADMIN_CODE` | Another word only you know. It lets you, the server owner, reset any account's password if a recovery key is lost too. | Recommended |
| `OPENROUTER_API_KEY` | Your key from openrouter.ai → Keys. It enables the free OpenRouter models (`openrouter/free`). | Optional |

Click **Deploy** (or **Save and deploy**) after adding them.

**Which AI gets used?** If you add an OpenRouter key, Story Forge uses OpenRouter's free models first. If that fails (for example, the free daily limit is used up), it automatically falls back to Cloudflare's Workers AI. With no OpenRouter key, it uses Workers AI directly.

Optional variables (plain text, not secret):
- `AI_MODEL`: the OpenRouter model to use (default `openrouter/free`).
- `WORKERS_AI_MODEL`: the Cloudflare model (default `@cf/meta/llama-3.3-70b-instruct-fp8-fast`). If you hit Cloudflare's daily free AI limit often, pick a smaller model from the Workers AI model list.

## 6. Copy your server address
On the Worker's overview page you'll see an address like
`https://loreforge-server.YOURNAME.workers.dev`. Open it in a browser; you should see something like:
```json
{"ok":true,"app":"loreforge","storage":"kv","ai":"openrouter+workers-ai","inviteRequired":true,"ready":true}
```
If `ready` is `false`, re-check steps 4 and 5.

## 7. Connect Loreforge
On your **first device**:
1. Open Loreforge → **☁️ Cloud & devices**.
2. Paste the server address and click **Check**.
3. Choose **Create account**, pick a username and password, enter your invite code, and confirm.
   Your worlds upload straight away.

On **each other device**: open Loreforge → **☁️ Cloud & devices** → paste the same address → **Sign in** with the same username and password. Your worlds download automatically.

---

## Good to know
- **Every device keeps a full offline copy.** If you lose internet, keep working; changes sync when you're back online.
- **Automatic sync:** changes upload at most every ~45 seconds while you work, and straight away when you switch away from the app. When you come back to the app, it checks for changes from your other devices.
- **Edited on two devices before they synced?** Loreforge asks which version to keep. "Keep both" is always safe: you'll get two copies to compare.
- **Free-tier limits:** Workers KV's free plan allows about 1,000 saves a day, which is plenty with the built-in throttling. Very large worlds (over ~24 MB, usually from big uploaded maps) or big PDFs need an **R2 bucket**: create one under **R2**, bind it to the Worker as `BUCKET`, and it's used automatically. R2 may ask you to add a payment method even though its free tier is free.
- **Forgot your password?** When you create your account, Loreforge shows a **recovery key** once (e.g. `7QWS-6N3U-2H8L-5ZRH`). Save it in a password manager or on paper. On any device go to **☁️ Cloud & devices → Forgot password**, then enter your username, the recovery key and a new password. You'll get a fresh recovery key, and your other devices are signed out for safety.
- **Lost the recovery key too?** As the server owner, use your `ADMIN_CODE` in the same Forgot password screen (under "Lost your recovery key too?").
- **While signed in**, the Cloud page lets you change your password, make a new recovery key, or sign out every other device (handy if a device is lost).
- **Privacy:** your data sits in your own Cloudflare account. Nobody else can read it without your login.
