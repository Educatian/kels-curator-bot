"""Stealth-fetch one URL via deepcloak (bypasses Cloudflare/bot walls) and print
the HTML to stdout. Run with deepcloak's venv python so `deepcloak` imports:
  <deepcloak-venv>\\Scripts\\python.exe scripts/stealth_fetch.py <url> [wait_ms]
Used by the bot's intl-feeds harvester for type:'stealth' sources (e.g. iLRN).
"""
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: stealth_fetch.py <url> [wait_ms]", file=sys.stderr)
        return 2
    url = sys.argv[1]
    wait_ms = int(sys.argv[2]) if len(sys.argv) > 2 else 4000
    try:
        from deepcloak.stealth_downloader import stealth_get
    except Exception as exc:  # pragma: no cover
        print(f"deepcloak import failed: {exc}", file=sys.stderr)
        return 3
    try:
        sys.stdout.write(stealth_get(url, wait_ms=wait_ms))
        return 0
    except Exception as exc:
        print(f"stealth_get failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
