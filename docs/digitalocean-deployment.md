# DigitalOcean Deployment Notes — Aero / Live Airspace Pulse

## Production

Production URL:

https://aero.alonzoalden.com

Server app path:

```sh
/var/www/alonzoalden.com/aero
```

Systemd services:

```text
aero-backend.service
aero-frontend.service
```

Runtime ports:

```text
Frontend / Next.js: 127.0.0.1:3000
Backend / Express + WebSocket: 127.0.0.1:3001
Public HTTPS: Nginx reverse proxy
WebSocket: wss://aero.alonzoalden.com/ws
```

Nginx config:

```sh
/etc/nginx/sites-available/aero.alonzoalden.com
/etc/nginx/sites-enabled/aero.alonzoalden.com
```

Existing sites that should not be modified during Aero deploys:

```text
alonzoalden.com
wilshiregfs.com
```

## Normal Update Deployment Process

After pushing changes to GitHub, SSH into the droplet:

```sh
ssh root@YOUR_DROPLET_IP
```

Go to the app directory:

```sh
cd /var/www/alonzoalden.com/aero
```

If Git complains about dubious ownership, run this once:

```sh
git config --global --add safe.directory /var/www/alonzoalden.com/aero
```

Check current branch and repo state:

```sh
git status -sb
git branch --show-current
```

Pull latest changes:

```sh
git fetch origin
git pull --ff-only origin main
```

Install dependencies:

```sh
npm ci
```

Run validation:

```sh
npm run lint
npm run typecheck
npm test
npm run verify:model
```

Build production frontend:

```sh
npm run build
```

If the build gets killed with no stack trace, check memory and swap:

```sh
free -h
swapon --show
journalctl -k -n 100 --no-pager | grep -Ei 'out of memory|oom|killed process'
```

This droplet has limited RAM, so swap is required. Current known-good swap setup is:

```text
/swapfile — 2 GB
vm.swappiness=10
```

After a successful build, restore app ownership to the runtime user:

```sh
sudo chown -R aero:aero /var/www/alonzoalden.com/aero
```

Restart the services:

```sh
sudo systemctl restart aero-backend
sudo systemctl restart aero-frontend
```

Check service status:

```sh
sudo systemctl status aero-backend --no-pager
sudo systemctl status aero-frontend --no-pager
```

## Production Verification

Check frontend:

```sh
curl -I https://aero.alonzoalden.com
```

Expected:

```text
HTTP/1.1 200 OK
```

Check backend health:

```sh
curl -i https://aero.alonzoalden.com/health
```

Expected:

```json
{"ok":true}
```

Check API status:

```sh
curl -i https://aero.alonzoalden.com/api/status
```

Expected fields include:

```json
{
  "sourceMode": "runtime-switchable",
  "isRuntimeSwitchable": true
}
```

Available runtime sources:

```text
mock
airplanes-live
```

## WebSocket Verification

Run from the app directory:

```sh
cd /var/www/alonzoalden.com/aero

node - <<'NODE'
const WebSocket = require('ws');

const ws = new WebSocket('wss://aero.alonzoalden.com/ws');

const timeout = setTimeout(() => {
  console.error('timeout: websocket did not open or receive data');
  process.exit(1);
}, 8000);

ws.on('open', () => {
  console.log('websocket opened');
});

ws.on('message', (data) => {
  console.log('websocket message received:');
  console.log(String(data).slice(0, 500));
  clearTimeout(timeout);
  ws.close();
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('websocket error:', error.message);
  clearTimeout(timeout);
  process.exit(1);
});
NODE
```

Expected:

```text
websocket opened
websocket message received:
{"type":"snapshot", ...}
```

## Runtime Source Switching

Switch to real ADS-B:

```sh
curl -i -X POST https://aero.alonzoalden.com/api/source \
  -H 'Content-Type: application/json' \
  -d '{"source":"airplanes-live"}'
```

Switch back to simulated demo:

```sh
curl -i -X POST https://aero.alonzoalden.com/api/source \
  -H 'Content-Type: application/json' \
  -d '{"source":"mock"}'
```

Verify current source:

```sh
curl -i https://aero.alonzoalden.com/api/status
```

## Existing Site Sanity Checks

After deployment, confirm the existing sites still respond:

```sh
curl -I https://alonzoalden.com
curl -I https://wilshiregfs.com
```

Expected:

```text
HTTP/1.1 200 OK
```

## Do Not Redo These During Normal Updates

Normal GitHub code updates do not require changing:

- DNS
- Certbot
- Nginx server blocks
- systemd service files
- DigitalOcean firewall

Only touch those if the app changes ports, domains, environment variables, service startup commands, or proxy routes.

## Current Known-Good Deployment Result

The latest verified deployment completed successfully with:

```text
npm ci               passed
npm run lint         passed
npm run typecheck    passed
npm test             passed, 14/14
npm run verify:model passed
npm run build        passed
frontend HTTPS       200 OK
/health              {"ok":true}
/api/status          200 OK
runtime switching    mock and airplanes-live working
existing sites       alonzoalden.com and wilshiregfs.com still 200 OK
```

For future polish, add `start` and `start:server` scripts to `package.json` so the systemd files do not depend directly on `node_modules/.bin/next` and `node_modules/.bin/tsx`.
