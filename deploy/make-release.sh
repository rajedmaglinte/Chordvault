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
