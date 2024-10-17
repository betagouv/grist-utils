# Fetch Github issues

This script gathers the issues and pull requests in the [French administration board](https://github.com/orgs/gristlabs/projects/1) 
and prepares a text so we can add information about our progress.

It produces a markdown output but it can be combined with pandoc to output in other formats (like HTML for Slack).

## Installation

1. Install [jq](https://jqlang.github.io/jq/) and [gh](https://cli.github.com/).
2. Clone the repository or download directly fetch-github-issues.sh.

## Usage

Run `./fetch-github-issuers.sh --help` to show the usage.

It is recommended to use `-A` to archive the issues Done this week.