# Doc rights management

**Status: 🧪 Experimental**

Set of tools to manage the rights for a document.

## retrieve-rights.sh

### Requirements

- curl
- a Grist instance

### Usage

This command is simply meant to retrieve the access for a specific document.

```bash
$ read -s BEARER
# 👀 Enter your API Key
$ export BEARER
$ DOC_ID=<your-doc-id> bash ./retrieve-rights.sh
# ✅ The output is saved in rights-<your-doc-id>.json
```

## apply-rights

### Requirements

- Grist instance **with SCIM enabled**.
- jq
- curl

### Usage

This command is meant to apply new rights (as specified in the `RIGHTS` env var) for a document.
It should be typically used with the output of `retrieve-rights.sh`, especially useful to replicate the rights to another document.
⚠️ It does not remove the existing rights that are not specified in the passed RIGHTS file.
⚠️ Also it does not apply the rights for the workspaces and the org the document belongs to. You should specify them manually or migrate them with another tool the rights for them.

```bash
$ read -s TARGET_BEARER
# 👀 Enter your API Key
$ export TARGET_BEARER
# MAX_INHERITED_ROLE can be omitted, it defaults to "owners"
$ RIGHTS=rights-<some-doc-id>.json TARGET_DOMAIN=... \
  TARGET_DOC_ID=<your-target-doc-id> MAX_INHERITED_ROLE=... ./apply-rights.sh
```
