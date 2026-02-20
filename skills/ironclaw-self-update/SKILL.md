---
name: IronClaw Supreme Self-Update
description: Handle user requests to update IronClaw Supreme to the latest version
---

# IronClaw Supreme Self-Update

This skill handles user requests to update their IronClaw Supreme instance.

## Trigger Phrases

- "Update yourself"
- "Update to the newest version of IronClaw"
- "Update IronClaw"
- "Pull the latest"
- "Are there any updates?"
- "Check for updates"
- "Upgrade yourself"

## How It Works

IronClaw Supreme runs inside a Docker container. The code is **baked into the image** during build — it's NOT mounted from the filesystem. This means:

- `git pull` in the workspace updates **skills and scripts only** (useful, but not a full update)
- A **full update** requires pulling a new Docker image and recreating the container

## Update Procedure

### Step 1: Check what's available

```bash
bash scripts/container-update.sh --check
```

This will:
- Pull the latest image from GHCR
- Compare it with the currently running container
- Report whether an update is available

Tell the user what you found.

### Step 2: Ask for confirmation

**ALWAYS ask the user before proceeding.** Say something like:

> An update is available. Applying it will restart the container, which will **end our current conversation**. You'll be able to start a new conversation once the update completes (usually under 2 minutes). Shall I proceed?

### Step 3: Apply the update

If the user confirms:

```bash
bash scripts/container-update.sh --update
```

The script auto-detects the best method:
1. **Docker socket mode** — If `/var/run/docker.sock` is mounted, it pulls and recreates directly
2. **Watchtower mode** — If a Watchtower container is running, it signals it to check now
3. **Manual mode** — If neither is available, it prints instructions for the user to run on the host

### Step 4 (if manual mode): Give clear instructions

If the script falls back to manual mode, tell the user:

> I don't have Docker socket access, so I can't restart the container myself. Here's what to do:
>
> 1. SSH into your server
> 2. Run: `docker pull ghcr.io/dustin-olenslager/ironclaw-supreme:main`
> 3. Run: `docker compose down && docker compose up -d`
>
> Or if you're using Coolify, just hit "Redeploy" on the dashboard.

## Quick Workspace Update (Skills/Scripts Only)

If the user just wants the latest skills and scripts (not a full container rebuild):

```bash
cd /home/node/.openclaw/workspace
git fetch origin main
git pull origin main --ff-only
```

This is fast, doesn't require restart, and updates:
- Skills (like this one)
- Shell scripts in `scripts/`
- Configuration files

But does NOT update:
- Core OpenClaw gateway code
- Node.js dependencies
- Built UI assets

## Important Notes

- **NEVER force-push or reset** — always use `--ff-only` for pulls
- **ALWAYS warn the user** that a container update ends the current conversation
- **The container typically restarts in under 2 minutes**
- **GHCR image**: `ghcr.io/dustin-olenslager/ironclaw-supreme:main`
- **If Docker socket is not mounted**, you cannot restart the container from inside it — this is a security feature, not a bug
