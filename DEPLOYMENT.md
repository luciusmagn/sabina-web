# Deployment

The site runs on **`root@sabinamacha.com`** (Artix Linux, s6 init).

| Fact | Value |
|------|-------|
| Host | `root@sabinamacha.com` (hostname `velho`) |
| OS / init | Artix Linux, s6 |
| Repo on server | `/root/sabina-web` |
| Process runner | GNU `screen` session named **`portfolium`** (login shell is **fish**) |
| SSH access | The developer's local SSH key is authorized for `root@sabinamacha.com` |

## Architecture

```
Internet → Caddy (:443/:80)  ──reverse_proxy──▶  127.0.0.1:60007  →  sabina-web
```

- **Caddy** terminates TLS and reverse-proxies `sabinamacha.com` to `localhost:60007`
  (see `/etc/caddy/Caddyfile`: `https://sabinamacha.com { reverse_proxy localhost:60007 }`).
- The app therefore **must listen on `127.0.0.1:60007`**, not Rocket's default 8000.
- The server process is `target/debug/sabina-web`, launched inside the `portfolium`
  screen from `/root/sabina-web`.

## Port pinning

The port is pinned in **`Rocket.toml`** so any rebuild binds what Caddy proxies to:

```toml
[default]
address = "127.0.0.1"
port = 60007
```

This binds localhost-only (correct behind Caddy) in both debug and release builds.

_History:_ the live binary was built from an older `main.rs` that hard-coded 60007;
that config was later dropped from source, so for a while a rebuild would have fallen
back to Rocket's default **8000** and broken the proxy. `Rocket.toml` removes that
hazard. **Note:** the currently running process is still that old binary — it keeps
serving on 60007; `Rocket.toml` only takes effect on the **next rebuild/restart**.

## Content vs. code changes

- **`content.json` and `templates/*.tera` are read per request** (Rocket debug mode),
  so editing them needs **no rebuild or restart** — this is why the stale binary still
  serves fresh content. On the server, `content.json` has **uncommitted live edits**
  (edited via `/editor`). **Never** `git checkout`/`reset` it — you'd wipe live content.
- **Rust changes** require a rebuild + relaunch (see below), with the port pinned.

## Getting in

```sh
ssh root@sabinamacha.com
screen -r portfolium          # attach; use `screen -d -r portfolium` to steal a stale attach
```

## Deploying

**Docs / content / template change (no restart needed):**

```sh
cd /root/sabina-web && git pull        # fast-forward; leaves uncommitted content.json intact
```

**Rust code change (rebuild + relaunch):** attach to the `portfolium` screen, stop the
running server (Ctrl-C), then relaunch **with the port pinned** and the runtime lib path
the toolchain needs (the deployed process uses the nightly toolchain and sets
`LD_LIBRARY_PATH` to its lib dirs):

```sh
cd /root/sabina-web
git pull
EDITOR_PASSWORD=<prod-password> cargo run --release   # port comes from Rocket.toml (60007)
# then detach without stopping: Ctrl-A then D
```

Verify after any restart:

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:60007/   # expect 200
curl -s -o /dev/null -w '%{http_code}\n' https://sabinamacha.com/  # expect 200
```

### Notes

- `EDITOR_PASSWORD` is set in the running process's environment (gates `/editor`). The
  real value is **not** stored in this repo; read it from the running process if needed
  (`tr '\0' '\n' < /proc/$(pgrep -f target/.*/sabina-web)/environ | grep EDITOR_PASSWORD`).
- If unset at launch, the app generates a random password and prints it to the log.
- The machine hosts many unrelated services/screens — only touch `portfolium` and
  `/root/sabina-web`.
