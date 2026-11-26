#!/usr/bin/env bash
# Builds dist/chordvault-release.tar.gz (+ .sha256): the committed source plus the compiled
# web app, so servers never need to run the frontend build.
#   deploy/make-release.sh <version>            build only
#   deploy/make-release.sh <version> --publish  build and replace the single commit on the
#                                               "release" branch that servers download from
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${1:?usage: deploy/make-release.sh <version, e.g. 1.33.0-church.1>}"
[ -z "$(git status --porcelain)" ] || { echo "commit your changes first"; exit 1; }
# Start from a clean output folder so old hashed files from earlier builds are not shipped.
rm -rf public/assets
(cd frontend && npm run build >/dev/null)
out=$(mktemp -d)
git archive --prefix=chordvault/ HEAD | tar -x -C "$out"
cp -r public/assets public/fonts public/index.html public/sw.js public/workbox-*.js public/manifest.webmanifest public/icon-*.png "$out/chordvault/public/"
echo "$VERSION" > "$out/chordvault/RELEASE"

# Bundle the production packages, built with Node.js 24 for Linux x64, so servers need neither
# npm downloads nor compilers (better-sqlite3 otherwise downloads or compiles a native module).
NODE24="${NODE24:-$(command -v node)}"
case "$("$NODE24" -v)" in v24.*) ;; *) echo "set NODE24 to a Node.js 24 binary (found $("$NODE24" -v))"; exit 1;; esac
(cd "$out/chordvault" && PATH="$(dirname "$NODE24"):$PATH" npm ci --omit=dev --no-audit --no-fund --loglevel=error >/dev/null 2>&1) \
  || { echo "npm ci failed while bundling packages"; exit 1; }
(cd "$out/chordvault" && "$NODE24" -e "new (require('better-sqlite3'))(':memory:').close()") \
  || { echo "bundled better-sqlite3 does not load"; exit 1; }
echo "node-modules-abi=$("$NODE24" -p process.versions.modules) platform=linux-x64" > "$out/chordvault/BUNDLED"
mkdir -p dist
tar -czf dist/chordvault-release.tar.gz -C "$out" chordvault
(cd dist && sha256sum chordvault-release.tar.gz > chordvault-release.tar.gz.sha256)
rm -rf "$out"
echo "dist/chordvault-release.tar.gz ($VERSION): $(du -h dist/chordvault-release.tar.gz | cut -f1)"

if [ "${2:-}" = --publish ]; then
  pub=$(mktemp -d)
  git -C "$pub" init -q -b release
  cp dist/chordvault-release.tar.gz dist/chordvault-release.tar.gz.sha256 "$pub/"
  printf 'ChordVault release %s\n\nBuilt from %s. Servers download these two files; see deploy/README.md on main.\n' \
    "$VERSION" "$(git rev-parse --short HEAD)" > "$pub/README.md"
  git -C "$pub" add -A
  git -C "$pub" -c user.name="$(git config user.name || echo release)" -c user.email="$(git config user.email || echo release@localhost)" \
    commit -q -m "Release $VERSION (from $(git rev-parse --short HEAD))"
  git -C "$pub" push -q --force "$(git remote get-url origin)" release
  rm -rf "$pub"
  echo "Published $VERSION to the release branch."
fi
