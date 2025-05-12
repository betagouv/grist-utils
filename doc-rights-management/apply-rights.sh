#!/usr/bin/env bash

set -eEu -o pipefail


headers=(--header "Authorization: Bearer ${TARGET_BEARER}" --header "Content-type: application/json")

# Retrieve our own email
own_email=$(curl -s "${headers[@]}" "https://${TARGET_DOMAIN}/api/scim/v2/Me" | jq -r '.emails[0].value')

# FIXME: Use proper JQ comments, but that requires to put the jq script in a different file
# (see the jq's `-f filename` option)
#
# 1. Reads the rights from the file specified by the passed RIGHTS env variable (the `map(select(...))`)
# 2. for each user, create an object whose only key is the user's email and the value is the access (passed to null if we pass ERASE=true, otherwise keep the right as specified in RIGHTS)
# 3. use `add` to aggregate all the objects of step 2 into a single one
#   See this example: https://play.jqlang.org/?q=add&j=[{%22a@d.tls%22:%20null},{%22b@d.tld%22:%22owners%22},{%22c@d.tld%22:%22owners%22}]
# 4. Define the final object to pass as the request body. The object produced above is passed as `.delta.users`.
body=$(cat "${RIGHTS}" | jq --arg max_inherited_role "${MAX_INHERITED_ROLE:-owners}" --arg own_email "$own_email" --argjson erase "${ERASE:-false}" -rc '
[
  .users |
    map(select(.access != null and .parentAccess == null and .email != $own_email)) |
    .[] |
    {(.email): (if $erase then null else .access end)}
] |
  add |
  {"delta": {"maxInheritedRole": $max_inherited_role, "users": .}}')

# Simple control of the target domain to ensure we know what we do.
if [ "$TARGET_DOMAIN" == "grist.incubateur.anct.gouv.fr" ] || [ "$TARGET_DOMAIN" == "grist.numerique.gouv.fr" ]; then
  read -r -p "Production domain detected, continue ? [y/N] " continue
  if [ "${continue,,}" != 'y' ]; then
    echo "exiting"
    exit 0
  fi
fi

# Do the request
curl -v  -X PATCH -d "$body" "${headers[@]}" "https://${TARGET_DOMAIN}/api/docs/${TARGET_DOC_ID}/access"
