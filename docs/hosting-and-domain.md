# Hosting ClashMIT and connecting clashmit.lol

## What to buy

**Recommendation: Railway Hobby for one Node service; keep the domain and DNS at Porkbun. No paid Cloudflare product is needed.** Railway Hobby costs $5/month including $5 of resource usage; usage above that is billed additionally. One owner can manage hosting while all teammates collaborate in GitHub. Railway workspace team access is a separate plan consideration. Prices checked September 19, 2026: [Railway pricing](https://docs.railway.com/pricing/plans).

Cloudflare Tunnel can be used on the free plan, but even a named tunnel still needs a running origin server. Paying for Cloudflare does not move our Node process off the laptop or repair a hotspot outage. Cloudflare Workers/Durable Objects would require a backend adaptation; that is unnecessary for this hackathon. [Cloudflare Tunnel overview](https://developers.cloudflare.com/tunnel/).

An always-on Render web service is a reasonable alternative if the team already uses Render. Compare its current service and bandwidth prices before subscribing: [Render pricing](https://render.com/pricing). Do not buy hosting from Porkbun for this setup; Porkbun supplies the existing domain and DNS, while Railway runs the game.

## What is already prepared

- `Dockerfile`: frontend and WebSocket backend in one Node 22 container.
- `railway.json`: one replica, `/health` startup check, retry on crashes, no sleeping, no intentional overlap between deployments, and a five-second shutdown window.
- `.github/workflows/test.yml`: tests and a container build on pull requests and pushes to `main`.
- Browser reconnects with bounded, randomized backoff, checks silent connections, and reuses the player token. Casts are never queued and replayed after a disconnect.
- Server handles socket errors, disconnects clients whose output backs up, serializes each arena snapshot once per broadcast, and sends a restart close code during shutdown.

**Prepared configuration is not a live deployment.** Railway still needs an account/plan, repository connection, service creation, and domain verification. No hosting subscription has been purchased and no Porkbun DNS record has been changed by this work.

## Connect Railway to main once

1. Sign into Railway with the GitHub account that can access `spycoderyt/clashmit`. Select Hobby when ready to pay; review the current billing terms and set a usage alert/budget appropriate for the event.
2. Create a project using **Deploy from GitHub repo** and choose `spycoderyt/clashmit`. Grant the GitHub integration access to this repository if prompted.
3. In the service’s Settings, verify its source branch is `main` and automatic deployments are enabled. Use the repository root; Railway should detect `railway.json` and the root `Dockerfile`.
4. Select a US East region available to your account. Keep exactly one replica in one region. Do not enable sleeping/serverless mode. Set the service variable `PORT=3000` and use port 3000 for public networking. No database is required for the current game.
5. Enable **Wait for CI** so future deployments wait for the GitHub **Tests** workflow. Confirm that workflow succeeds for the commit being deployed. [Railway autodeploy documentation](https://docs.railway.com/deployments/github-autodeploys).
6. Under **Settings → Public Networking**, choose **Generate Domain**. Wait for the deployment and health check to succeed, then open the generated HTTPS URL and its `/health` endpoint. The latter should show `{"ok":true}`.
7. Test two phones on that same URL, leaving the in-game Connection settings server URL empty. Confirm names, scan registration, a round, a spell hit, and reconnecting after a brief network interruption.

After this setup, the path is **PR merged into main → GitHub Tests passes → Railway builds and deploys → shared URL serves the new version**. Developers continue testing feature branches with their own laptop tunnels. Updating the remote game does not update anyone’s local checkout.

Deploy between rounds: state is currently in memory, so a deployment or server crash resets the arena. Reconnecting phones must scan again after a new server session. A single replica prevents normal traffic from splitting across separate games; deploy-time state continuity is not implemented. Pause autodeploy during an important live match if teammates are still merging changes.

## Porkbun: connect clashmit.lol

First make the Railway-generated URL work. DNS alone cannot create a server. Keep Porkbun’s nameservers for these instructions; if you previously moved DNS elsewhere, edit records at that DNS provider instead.

### Get the actual values from Railway

Open your game service → **Settings → Public Networking → + Custom Domain**. Enter `clashmit.lol`, targeting port 3000. Copy the routing hostname and the verification TXT record name/value that Railway displays. Both routing and verification records are required. Do not substitute a sample hostname or the temporary `trycloudflare.com` address. Railway supplies and renews HTTPS after verification. [Railway custom-domain instructions](https://docs.railway.com/networking/domains/working-with-domains).

### Add them at Porkbun

1. Sign into Porkbun. Open **Account → Domain Management**.
2. Find **clashmit.lol**, expand **Details**, and click **Edit** beside **DNS Records**.
3. Inspect existing records. Replace only conflicting parking/website records for the root domain; retain unrelated mail and verification records.
4. Add the following root routing record:

| Porkbun field | Value |
| --- | --- |
| Type | **ALIAS – CNAME flattening record** |
| Host | Leave blank, meaning `clashmit.lol` |
| Answer / Value | Exact routing hostname supplied by Railway, without `https://`, a path, or a port |
| TTL | Leave the default |

Click **Add**. Porkbun uses ALIAS for a root hostname; Railway supports this in place of a root CNAME. [Porkbun ALIAS guide](https://kb.porkbun.com/article/85-how-to-connect-your-root-domain-when-your-web-host-wont-provide-an-ip-address), [Railway root-domain DNS](https://docs.railway.com/integrations/api/manage-domains).

5. Add a **TXT** record using Railway’s verification name and value. Porkbun’s Host field is relative to `clashmit.lol`: remove the trailing `.clashmit.lol` from a fully qualified name, or leave it blank if Railway specifies the root. Paste the verification value exactly and click **Add**. Do not invent the TXT name/token; copy them from the actual service.
6. Return to Railway and wait for domain verification and the HTTPS certificate. Then open `https://clashmit.lol/health` and the game on both phones. DNS/certificate changes can take time; a delay does not mean you need another domain or a paid SSL certificate.

Optional `www`: add `www.clashmit.lol` as another custom domain on the same Railway service. At Porkbun add a **CNAME** with Host `www`, its exact Railway routing target, and any verification TXT record Railway requests for that hostname. Check that both hostname certificates work before sharing them. Prefer `https://clashmit.lol` as the one common player link so browser permissions and saved settings stay consistent.

Do not use URL forwarding or a guessed A-record IP as a replacement for these records. The game and `/ws` connection should be served by the same hosted application. No Cloudflare nameserver transfer is needed for this route.

## Capacity and verification limits

The automated infrastructure test connects 30 synthetic clients to an isolated server with a test-only capacity override, checks snapshots, and receives 600 ping replies. On the development Mac, one run measured p50 1.0 ms and p95 1.4 ms over loopback. This does not measure cellular latency, tunnel performance, rendering, sustained load, or 30-person recognition.

The shipped lobby limit remains 12 and camera targeting still selects one opponent. The updated plan is one venue and [ordered two-color headbands](two-stripe-headbands.md) for individual identity: six distinct colors can encode 30 different-color ordered pairs. That registration and multi-marker tracking pipeline is not implemented yet. Do not advertise a 30-player game based on the server test; identification must be finished and field-tested first.

Before the event, test the actual remote URL with the intended phones and network, check for reconnects and latency spikes, and confirm the deployed commit matches `main`. For rollback, restore a known-good deployment in Railway or revert the bad commit through a PR; either path restarts in-memory game state.
