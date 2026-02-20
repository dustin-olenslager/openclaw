# TOOLS.md - Local Notes

## Infrastructure

### Hetzner Cloud
- **coolify** — 89.167.11.124 (runs Coolify)
- **openclaw** — 65.109.174.44 (runs this OpenClaw instance)
- Auth: `HCLOUD_TOKEN` env var, API via curl

### Coolify
- **URL:** https://coolify.metajibe.com
- Auth: `COOLIFY_TOKEN` env var, REST API via curl

### GitHub
- **User:** dustin-olenslager
- Auth: `GH_TOKEN` / `GITHUB_TOKEN` env vars

## Notes
- No root/sudo in container — use curl + node for API calls instead of CLI tools
- `jq` exists but has permission issues — use `node -e` for JSON parsing
- **NEVER rebuild Docker images or restart the container** — Dustin handles all infrastructure updates manually
