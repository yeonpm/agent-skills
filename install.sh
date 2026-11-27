#!/usr/bin/env bash
# Link every skill in this repository into a skills directory (idempotent), then run the doctor.
# - Existing symlink to this repo   -> left as is ("ok").
# - Existing symlink elsewhere      -> repointed to this repo.
# - Existing real folder            -> moved to <target>-install-backup/<timestamp>/<name> (next to the target), then linked.
# - ~/.codex/skills/<name>          -> without --target: relinked only if that entry already exists (old Codex copies).
#                                      with --target: left alone unless --codex.
# Usage: ./install.sh [--target DIR]... [--codex] [--only a,b] [--copy] [--dry-run] [--no-doctor]
#   --target DIR  install into DIR instead of ~/.claude/skills (repeatable; default also honors $CLAUDE_SKILLS_DIR)
#   --codex       also install into ~/.codex/skills (or $CODEX_SKILLS_DIR), creating entries if needed
#   --only LIST   comma-separated skill names (default: every folder with SKILL.md)
#   --copy        copy folders instead of symlinking (for tools that do not follow links; rerun to update)
#   --dry-run     print what would change
#   --no-doctor   skip `node htmlfy/scripts/doctor.cjs --no-launch` at the end
# Note: dcfy and lookfy load htmlfy/scripts/lib, so install htmlfy next to them.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TARGETS=()
CODEX_DIR="${CODEX_SKILLS_DIR:-$HOME/.codex/skills}"
FORCE_CODEX=0 DRY=0 COPY=0 DOCTOR=1 ONLY=""
STAMP="$(date +%Y%m%d-%H%M%S)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) [[ $# -ge 2 ]] || { echo "--target needs DIR" >&2; exit 2; }; TARGETS+=("$2"); shift 2 ;;
    --target=*) TARGETS+=("${1#*=}"); shift ;;
    --codex) FORCE_CODEX=1; shift ;;
    --only) [[ $# -ge 2 ]] || { echo "--only needs LIST" >&2; exit 2; }; ONLY="$2"; shift 2 ;;
    --only=*) ONLY="${1#*=}"; shift ;;
    --copy) COPY=1; shift ;;
    --dry-run) DRY=1; shift ;;
    --no-doctor) DOCTOR=0; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done
EXPLICIT_TARGET=0
if [[ ${#TARGETS[@]} -eq 0 ]]; then TARGETS=("${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"); else EXPLICIT_TARGET=1; fi

run() { if [[ $DRY -eq 1 ]]; then echo "[dry-run] $*"; else "$@"; fi; }

skills=()
for skill_md in "$REPO"/*/SKILL.md; do
  name="$(basename "$(dirname "$skill_md")")"
  if [[ -n "$ONLY" && ",$ONLY," != *",$name,"* ]]; then continue; fi
  skills+=("$name")
done
[[ ${#skills[@]} -gt 0 ]] || { echo "no skills matched (--only $ONLY)" >&2; exit 2; }
if [[ -n "$ONLY" && ",$ONLY," != *",htmlfy,"* && ( ",$ONLY," == *",dcfy,"* || ",$ONLY," == *",lookfy,"* ) ]]; then
  echo "note: dcfy/lookfy need htmlfy next to them (shared scripts/lib); add htmlfy to --only" >&2
fi

link_one() { # $1 dest dir, $2 skill name
  local dest_dir="$1" name="$2" src="$REPO/$2"
  local dest="$dest_dir/$name" bdir="${dest_dir%/}-install-backup/$STAMP"
  if [[ $COPY -eq 0 && -L "$dest" && "$(readlink "$dest")" == "$src" ]]; then
    echo "ok      $dest"; return
  fi
  if [[ -L "$dest" ]]; then
    run rm -f "$dest"
  elif [[ -e "$dest" ]]; then
    if [[ $COPY -eq 1 && -f "$dest/.agent-skills-copy" ]]; then
      run rm -rf "$dest"            # our own earlier copy: replace without backup
    else
      run mkdir -p "$bdir"
      echo "backup  $dest -> $bdir/$name"
      run mv "$dest" "$bdir/$name"
    fi
  fi
  if [[ $COPY -eq 1 ]]; then
    run cp -R "$src" "$dest"
    [[ $DRY -eq 1 ]] || echo "$REPO" > "$dest/.agent-skills-copy"
    echo "copied  $dest <- $src"
  else
    run ln -s "$src" "$dest"
    echo "linked  $dest -> $src"
  fi
}

for dir in "${TARGETS[@]}"; do
  dir="${dir/#\~/$HOME}"
  run mkdir -p "$dir"
  for name in "${skills[@]}"; do link_one "$dir" "$name"; done
done
for name in "${skills[@]}"; do
  if [[ $FORCE_CODEX -eq 1 ]]; then
    run mkdir -p "$CODEX_DIR"; link_one "$CODEX_DIR" "$name"
  elif [[ $EXPLICIT_TARGET -eq 0 && -d "$CODEX_DIR" && ( -e "$CODEX_DIR/$name" || -L "$CODEX_DIR/$name" ) ]]; then
    link_one "$CODEX_DIR" "$name"
  fi
done
echo "done: $REPO"

if [[ $DOCTOR -eq 1 && $DRY -eq 0 ]]; then
  if command -v node >/dev/null 2>&1; then
    echo; echo "doctor:"
    first="${TARGETS[0]}"
    CLAUDE_SKILLS_DIR="${first/#\~/$HOME}" node "$REPO/htmlfy/scripts/doctor.cjs" --no-launch ${ONLY:+--only "$ONLY"} || true
  else
    echo "warn: node not found — htmlfy/dcfy/lookfy scripts need Node.js 18+ (task-token-report needs only Python 3)" >&2
  fi
fi
