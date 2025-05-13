#!/usr/bin/env bash

set -eEu -o pipefail

extname() {
  echo "${1##*.}"
}

filename_without_ext() {
  filename=$(basename -- "$1")
  echo "${filename%.*}"
}

declare source_doc="" dest_doc="" help=0 storage_id="" all_versions=0
MINIO_CLI="${MINIO_CLI:-mc}"
SQLITE="${SQLITE3:-sqlite3}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -s) source_doc="$2"; shift 2;;
    -d) dest_doc="$2"; shift 2;;
    -h) help=1; shift 2;;

    --source=*) source_doc="${1#*=}"; shift 1;;
    --destination=*) dest_doc="${1#*=}"; shift 1;;
    --storage_id=*) storage_id="${1#*=}"; shift 1;;
    --storage-id=*) storage_id="${1#*=}"; shift 1;;
    --all-versions) all_versions=1; shift 1;;
    --dry-run) MINIO_CLI="echo mc"; SQLITE="echo sqlite3"; shift 1;;
    --help) help=1; shift 1;;

    -*) echo "unknown option: $1" >&2; exit 1;;
    *) help=1; shift 1;;
  esac
done

# If the number of arguments is lower than 2, print an error message and exit
if [ -z "$source_doc" ] || [ -z "$dest_doc" ] || [ "$help" -eq 1 ]; then
  echo "Usage: $0 -s <source_bucket> -d <destination_bucket> [--storage-id=<storage_id>] [--all-versions] [--dry-run]"
  echo "--storage-id may be specified if you want to migrate external attachments as well"
  echo "--all-versions is experimental, it might need improvements to work correctly"
  exit 1
fi

# Assign the first argument to the source_bucket variable
if [ "$(mc ls --json "$source_doc")" == "" ]; then
  echo "Source doc does not exist or cannot be accessed"
  exit 1
fi

if [ "$(extname "$source_doc")" != "grist" ]; then
  echo "Source doc must be a grist file"
  exit 1
fi

if [ "$(extname "$dest_doc")" != "grist" ]; then
  echo "Destination doc must be a grist file"
  exit 1
fi

declare -A versions_map

# Delete the destination doc so there is no collision

$MINIO_CLI mv "$dest_doc" "$dest_doc.bak" || true

tmp_file=$(mktemp --suffix=".grist")

# Copy the source doc to the destination doc with all their version
# history and metadata
versions=$(mc ls --json --versions "$source_doc" | jq -r '.versionId' | tac)
if [ "$all_versions" -eq 0 ]; then
  versions=$(echo "$versions" | tr ' ' "\n" | tail -n 1)
fi

for version in $versions; do
  if [ -z "$storage_id" ]; then
    $MINIO_CLI cp --version-id="$version" "$source_doc" "$dest_doc"
  else
    $MINIO_CLI get --version-id="$version" "$source_doc" "$tmp_file"
    $SQLITE "$tmp_file" <<EOF || true
update _grist_DocInfo set documentSettings=json_replace(documentSettings, '$.attachmentStoreId', '$storage_id');
update _gristsys_Files set "storageId"='$storage_id' where "storageId" is not null;
EOF
    $MINIO_CLI put "$tmp_file" "$dest_doc"
  fi
  versions_map["$version"]="$(mc stat --json "$dest_doc" | jq -r '.versionID')"
done

if [ -n "$storage_id" ]; then
  $MINIO_CLI cp --recursive "$(dirname "$source_doc")/attachments/$(filename_without_ext "$source_doc")/" "$(dirname "$dest_doc")/attachments/$(filename_without_ext "$dest_doc")"
fi

# Download and transform the .version value of meta.json of the source doc
meta_json=$(mc cat "$(dirname "$source_doc")/assets/unversioned/$(filename_without_ext "$source_doc")/meta.json")
# Iterate over the versions_map and replace the .version value of meta.json
for version in "${!versions_map[@]}"; do
  meta_json=$(echo "$meta_json" | jq '.[] | select(.snapshotId=="'"$version"'").snapshotId="'"${versions_map["$version"]}"'" | [.]');
done
echo "$meta_json" | $MINIO_CLI pipe "$(dirname "$dest_doc")/assets/unversioned/$(filename_without_ext "$dest_doc")/meta.json"
read -r -p "Purge the destination doc copy? [y/N]"  response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
  $MINIO_CLI rm --versions --force "$dest_doc.bak"
fi
