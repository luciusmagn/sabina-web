# Deployment

The site runs on **`root@sabinamacha.com`** (Artix Linux, s6 init).

| Fact | Value |
|------|-------|
| Host | `root@sabinamacha.com` |
| OS / init | Artix Linux, s6 |
| Repo on server | `/root/sabina-web` |
| Process runner | GNU `screen` session named **`portfolium`** |
| SSH access | The developer's local SSH key is authorized for `root@sabinamacha.com` |

## Getting in

```sh
ssh root@sabinamacha.com
```

The running server lives inside a detached `screen` session called `portfolium`.

```sh
screen -r portfolium
```

If the session is "already attached" (e.g. a stale attach from a dropped
connection), force-detach it elsewhere and reattach here:

```sh
screen -d -r portfolium      # detach from wherever it's attached, then attach here
```

If `screen -r` fails outright and no `portfolium` session exists, start a fresh
one:

```sh
screen -S portfolium
```

## Deploying a change

1. SSH in and attach to the `portfolium` screen (see above).
2. Pull the latest code:
   ```sh
   cd /root/sabina-web
   git pull
   ```
3. Stop the running server (Ctrl-C inside the screen), then rebuild and relaunch:
   ```sh
   cargo run --release
   ```
   Rocket serves on port **8000** by default.
4. Detach from the screen **without stopping the server**: press `Ctrl-A` then `D`.

### Notes

- Editing only `content.json` or the `templates/*.tera` files does **not** require
  a rebuild or restart — they are read per-request in Rocket's debug mode. A
  release build bakes templates in, so restart after template changes when running
  `--release`.
- The editor at `/editor` is gated by the `EDITOR_PASSWORD` env var. Set it in the
  environment the screen session launches under; if unset, a random password is
  generated and printed to the server log at startup.
