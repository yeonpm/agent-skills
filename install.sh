#!/usr/bin/env bash
# Link every skill in this repository into ~/.claude/skills (idempotent).
# - Existing symlink -> repointed to this repo.
# - Existing real folder -> moved to ~/.claude/skills-install-backup/<timestamp>/<claude|codex>/<name>, then linked.
# - ~/.codex/skills/<name>: relinked only if that entry already exists (old Codex copies).
# Usage: ./install.sh [--dry-run]
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
CLAUDE_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
CODEX_DIR="${CODEX_SKILLS_DIR:-$HOME/.codex/skills}"
BACKUP_ROOT="$HOME/.claude/skills-install-backup/$(date +%Y%m%d-%H%M%S)"
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

run() { if [[ $DRY -eq 1 ]]; then echo "[dry-run] $*"; else "$@"; fi; }

link_one() { # $1 dest dir, $2 skill name, $3 backup label (claude|codex)
  local dest_dir="$1" name="$2" label="$3" src="$REPO/$2"
  local dest="$dest_dir/$name" bdir="$BACKUP_ROOT/$3"
  if [[ -L "$dest" ]]; then
    if [[ "$(readlink "$dest")" == "$src" ]]; then
      echo "ok      $dest"
      return
    fi
    run rm -f "$dest"
  elif [[ -e "$dest" ]]; then
    run mkdir -p "$bdir"
    echo "backup  $dest -> $bdir/$name"
    run mv "$dest" "$bdir/$name"
  fi
  run ln -s "$src" "$dest"
  echo "linked  $dest -> $src"
}

mkdir -p "$CLAUDE_DIR"
for skill_md in "$REPO"/*/SKILL.md; do
  name="$(basename "$(dirname "$skill_md")")"
  link_one "$CLAUDE_DIR" "$name" claude
  if [[ -d "$CODEX_DIR" && ( -e "$CODEX_DIR/$name" || -L "$CODEX_DIR/$name" ) ]]; then
    link_one "$CODEX_DIR" "$name" codex
  fi
done
echo "done: $REPO"
