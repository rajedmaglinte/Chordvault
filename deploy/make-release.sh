#!/usr/bin/env bash
# Builds dist/chordvault-release.tar.gz (+ .sha256): the committed source plus the compiled
# web app, so servers never need to run the frontend build. Usage: deploy/make-release.sh <version>
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${1:?usage: deploy/make-release.sh <version, e.g. 1.33.0-church.1>}"
[ -z "$(git status --porcelain)" ] || { echo "commit your changes first"; exit 1; }
(cd frontend && npm run build >/dev/null)
out=$(mktemp -d)
git archive --prefix=chordvault/ HEAD | tar -x -C "$out"
cp -r public/assets public/fonts public/index.html public/sw.js public/workbox-*.js public/manifest.webmanifest public/icon-*.png "$out/chordvault/public/"
echo "$VERSION" > "$out/chordvault/RELEASE"
mkdir -p dist
tar -czf dist/chordvault-release.tar.gz -C "$out" chordvault
(cd dist && sha256sum chordvault-release.tar.gz > chordvault-release.tar.gz.sha256)
rm -rf "$out"
echo "dist/chordvault-release.tar.gz ($VERSION): $(du -h dist/chordvault-release.tar.gz | cut -f1)"
