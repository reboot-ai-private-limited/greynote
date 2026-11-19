# Deploy the API and the web (PM2 on the server)

How a new release is built and restarted on the server that runs the API and the web portal under
**PM2**, from `/opt/greynote/app`. The first-time setup of a fresh VM with Docker is a different
flow: see [`manual_deploy.md`](manual_deploy.md). Database scripts a release may also need (seed,
migrations) are listed there, per release.

Before you start, the new code must already be on the server in `/opt/greynote/app` (pull the
branch you are deploying). The commands below run on the server, over SSH.

---

## 1. Install and build the API

```bash
cd /opt/greynote/app
pnpm install
cd apps/api
pnpm run build            # watch for the final "Done"; no errors
```

## 2. Build the web

Check memory first with `free -h`. If swap shows `0`, add it as before (`fallocate`, `mkswap`,
`swapon`): the build is killed on a small server without it.

```bash
cd /opt/greynote/app/apps/web
sudo rm -rf .next
sudo NODE_OPTIONS=--max-old-space-size=2048 pnpm run build
```

- Wait for the route table at the end. **Don't restart if you see `Killed` or an error.**
- If `greynote-web` runs the **standalone** server, copy the static files after the build. Check with
  `sudo pm2 describe greynote-web | grep "script path"`: a path ending in `.../standalone/.../server.js`
  means standalone.

```bash
sudo cp -r .next/static .next/standalone/apps/web/.next/static
sudo cp -r public .next/standalone/apps/web/public
```

## 3. Restart and check

```bash
sudo pm2 restart greynote-api greynote-web --update-env
sudo pm2 logs greynote-api --lines 30 --nostream     # look for "listening", no errors
sudo pm2 logs greynote-web --lines 20 --nostream
```

---

## Checklist

- API build ended with `Done`, no errors.
- Web build printed its route table, no `Killed`.
- Standalone server: `.next/static` and `public` copied after the build.
- Both apps restarted with `--update-env`; the API log shows `listening` and no errors.
- Open the portal and sign in; check one screen that changed in the release.

If a release adds or changes **System settings**, re-run the seed so they appear (see the "re-run
the seed" steps in [`manual_deploy.md`](manual_deploy.md)); a setting the API reads but the
database lacks fails the request that reads it.
