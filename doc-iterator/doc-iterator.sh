#!/usr/bin/env bash

set -eEu -o pipefail

# Usage: [MINIO_MC=<minio-mc>] [SQLITE3=<sqlite3>] ./doc-iterator/doc-iterator.sh [-w|--write] s3_path scripts...
help=false
write=false
verbose=false
if [[ $# -eq 0 ]]; then
  help=true
fi

info() {
  if $verbose; then
    echo "INFO: " "$@";
  fi
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      help=true
      shift
      ;;
    -w|--write)
      write=true
      shift
      ;;
    -v|--verbose)
      verbose=true
      shift
      ;;
    -*)
      echo "Unknown option: $1"
      help=true
      shift
      ;;
    *)
      s3_path="${1/%\//}" # Remove trailing slash if present
      shift
      scripts=("$@")
      shift ${#scripts[@]}
      ;;
    esac
  done

  if $help; then
    echo "Usage: ./doc-iterator/doc-iterator.sh [OPTIONS] s3_path scripts..."
    echo "Options:"
    echo "  -h, --help      Show this help message and exit"
    echo "  -w, --write     Push back changes to S3 if the document has changed"
    echo "  -v, --verbose   Enable verbose output"
    echo "  s3_path         The S3 path to the docs"
    echo "  scripts         The scripts to run on the downloaded files"
    echo ""
    echo "Environment Variables:"
    echo "  MINIO_MC       The MinIO client command (default: mc)"
    echo "  SQLITE3        The SQLite3 command, exposed to each script (default: sqlite3)"
    exit 0
  fi

# Check if s3_path is set
if [[ -z "${s3_path:-}" ]]; then
  echo "Error: s3_path is required."
  exit 1
fi

# Check if scripts are set
if [[ -z "${scripts:-}" ]]; then
  echo "Error: No scripts provided."
  exit 1
fi

# Check if MINIO_MC is set, if not, set it to the default value
MINIO_MC=${MINIO_MC:-"mc"}
# if verbose is not set, make mc quiet
if ! $verbose; then
  MINIO_MC="$MINIO_MC --quiet"
fi

for script in "${scripts[@]}"; do
  # Check if the script exists and is executable
  if [[ ! -x "$script" ]]; then
    echo "Error: Script $script does not exist or is not executable."
    exit 1
  fi
done

# Check if we can list the S3 path

# List all .grist files in the S3 path, except those that contain a ~
files=$($MINIO_MC ls --json "$s3_path" | jq -r '.key | select(test("^[^~]+.grist$"))')

dest_tmp_dir=$(mktemp -d)

for file in $files; do
  # Download the file to a temporary location
  remote_path="$s3_path/$file"
  tmp_file="$dest_tmp_dir/$file"
  tmp_file_sha256="${tmp_file}.sha256"
  $MINIO_MC get "$remote_path" "$tmp_file"
  sha256sum "$tmp_file" > "$tmp_file_sha256"

  # Run each script on the downloaded file
  for script in "${scripts[@]}"; do
    info "Running script $script on file $tmp_file"
    SQLITE3=${SQLITE3:-"sqlite3"} $script "$tmp_file"
  done

  # If write is true and changes has been made, push the new file to S3
  if $write; then
    if ! sha256sum -c "$tmp_file_sha256" --quiet; then
      info "Changes detected in $tmp_file, pushing to S3"
      # FIXME: Uncomment the following line to push the file to S3
      # $MINIO_MC put "$tmp_file" "$remote_path"
    else
      info "No changes detected in $tmp_file, not pushing to S3"
    fi
  fi

  # Remove the temporary file
  rm -f "$tmp_file" "$tmp_file_sha256"
done
rm -rf "$dest_tmp_dir"
