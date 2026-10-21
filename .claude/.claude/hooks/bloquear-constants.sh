#!/usr/bin/env bash
# Bloquea la lectura de CONSTANTS.js con Read, Grep o Bash (cat, head, tail, etc.).
entrada=$(cat)
objetivo=$(printf '%s' "$entrada" | jq -r '[.tool_input.file_path, .tool_input.path, .tool_input.command] | map(select(. != null)) | join(" ")')

if printf '%s' "$objetivo" | grep -qi 'CONSTANTS\.js'; then
  echo "Bloqueado: la lectura de CONSTANTS.js no está permitida." >&2
  exit 2
fi
exit 0
