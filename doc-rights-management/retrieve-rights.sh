#!/usr/bin/env bash

set -Eeuo pipefail

headers=(--header "Authorization: Bearer ${BEARER}" --header "Content-type: application/json")
output="./rights-${DOC_ID}.json"
if [ -e "$output" ]; then
  echo "Error: the file $output already exist"
  exit 1
fi
curl -s "${headers[@]}" "https://${DOMAIN}/api/docs/${DOC_ID}/access" > "$output"
