#!/usr/bin/env bash
# Prints the latest meeting's transcript lines with their speaker labels, to
# compare against the fake call's log (who was marked speaking, and when).
#
#   pnpm fake-zoom:transcript
#
# stream is "system" for the call and "mic" for you. Only system lines get
# a participant's name.
set -euo pipefail

DB="${AMIE_DB:-$HOME/Library/Application Support/com.pavel.amie/meetings.db}"
if [[ ! -f "$DB" ]]; then
  echo "No Amie database at $DB" >&2
  exit 1
fi

# -readonly: safe while Amie is running.
sqlite3 -readonly -header -column "$DB" "
  SELECT s.start_ms, s.speaker, s.stream, s.text
  FROM transcript_segments s
  WHERE s.deleted_at IS NULL
    AND s.meeting_id = (
      SELECT id FROM meetings WHERE deleted_at IS NULL ORDER BY started_at DESC LIMIT 1
    )
  ORDER BY s.start_ms, s.id"
