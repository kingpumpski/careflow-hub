#!/usr/bin/env bash
set -euo pipefail

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to run the database contract tests." >&2
  exit 1
fi

status_output="$(supabase status -o env)"
db_url="$(printf '%s\n' "$status_output" | sed -n 's/^DB_URL="\(.*\)"$/\1/p')"
if [[ -z "$db_url" ]]; then
  echo "Unable to resolve the disposable local Supabase DB_URL." >&2
  exit 1
fi

shopt -s nullglob
test_files=(supabase/tests/*.test.sql)
if (( ${#test_files[@]} == 0 )); then
  echo "No SQL contract tests were found." >&2
  exit 1
fi

for test_file in "${test_files[@]}"; do
  echo "::group::Running ${test_file}"
  psql "$db_url" --no-psqlrc --set ON_ERROR_STOP=1 --file "$test_file"
  echo "::endgroup::"
done

echo "All ${#test_files[@]} SQL contract tests passed."
