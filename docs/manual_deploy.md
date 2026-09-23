# Manual Deploy — Staging VM

Before automating this with CI/CD, deploy the staging VM by hand once, to prove the box is
correctly provisioned. Written for `apps/api` today — the only app that exists
([`roadmap.md`](roadmap.md)); it grows a `web` section once `apps/web` is scaffolded (phase 9).

Assumes a Debian-based VM (Ubuntu 22.04/24.04), the common default across AWS EC2,
DigitalOcean, Hetzner, etc.

---

## Step 1 — Connect to the VM

```bash
ssh username@your_staging_vm_ip
```

## Step 2 — Install Docker & Docker Compose

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER
# Log out and back in for the group change to take effect.
```

## Step 3 — Generate SSH keys & connect to GitHub

```bash
ssh-keygen -t ed25519 -C "staging-vm-deploy-key"
cat ~/.ssh/id_ed25519.pub
```

Copy the output, add it as a **Deploy Key** on the GitHub repo (Settings → Deploy Keys), then
verify:

```bash
ssh -T git@github.com
```

## Step 4 — Clone the repository

```bash
mkdir -p ~/deployments && cd ~/deployments
git clone <repo-url> greynote
cd greynote
git checkout staging
```

## Step 5 — MongoDB Atlas: allowlist this VM

Unlike a self-hosted database, there is nothing to install here — MongoDB is Atlas-hosted in
every environment, including staging ([`decision-log.md`](decision-log.md), 2026-09-23). But
Atlas defaults to rejecting connections from unknown IPs, so this step is not optional:

1. Find the VM's public egress IP: `curl -4 ifconfig.me`
2. In the Atlas project's **Network Access** page, add that IP (or a `/32` CIDR for it) to the
   allowlist.
3. Confirm the staging cluster's connection string — a **separate** Atlas cluster or database
   from both your personal dev cluster and production, so staging data never contaminates either.

Skipping this step is the single most common reason the container below starts cleanly and every
request 500s: the build succeeds, the process boots, and the first Mongo query times out.

## Step 6 — Configure environment variables

```bash
cp apps/api/.env.prod.example apps/api/.env.prod
# nano apps/api/.env.prod
#   - MONGO_URI: the staging Atlas connection string from Step 5
#   - CORS_ORIGINS: this VM's own origin, e.g. http://your_staging_vm_ip:3000 — the example
#     ships http://localhost:3000, which blocks the admin portal the moment it exists and tries
#     to call this API from a real browser
```

## Step 7 — Build and run the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The first `--build` compiles the image and takes a few minutes.

## Step 8 — Seed the database (first deploy only)

Server boot does no database writes — `SystemConfig`/`Role` defaults and the first Admin are
seeded by an explicit script instead (`docs/decision-log.md`), run once inside the now-running
container:

```bash
docker compose -f docker-compose.prod.yml exec api node dist/scripts/seed.js
```

It seeds Config/Role defaults (safe to re-run anytime — never overwrites an edited value), then,
only if no `ADMIN` user exists yet, prompts interactively for the first Admin's details (password
entry masked, typed twice). `docker compose exec` allocates a terminal for this automatically when
run from an interactive shell, so the prompts appear normally.

## Verification

```bash
docker ps                                              # `api` should be Up (healthy)
docker compose -f docker-compose.prod.yml logs -f api  # if anything looks wrong

curl -I http://localhost:3000/api/health               # 200 = healthy from inside the VM
curl -I http://your_staging_vm_ip:3000/api/health       # 200 = reachable from outside it too
```

A `503` here almost always means Step 5 was skipped or the connection string in `.env.prod` still
has the `<user>`/`<password>`/`<cluster>` placeholders from the example file.

---

## Updating a running deploy

```bash
cd ~/deployments/greynote
git pull origin staging
docker compose -f docker-compose.prod.yml up -d --build
```

`up -d --build` only rebuilds and restarts what changed; a deploy with no code changes since the
last one is a no-op.
