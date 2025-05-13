# Doc migrator

**Status: ✅ Ready to be used in production**

⚠️ The option `--all-versions` is experimental, and *may* probably never work (we may have to remove it at some point). The main difficulty is that Grist actually relies on version upload date on S3 ([which cannot be altered by the client](https://github.com/minio/minio/discussions/20296))), and not on the `lastModified` date in the `meta.json` file.

Migrate a document from a bucket to another one. It can also migrate a doc with their external attachments when specifying `--storage-id=...`.

You may check the usages and the options through:
```bash
$ ./migrate-doc-bucket.sh --help
```

## Migrate the rights

If you want to also apply the same rights for the document, you may take a look at the tools of `doc-rights-management`, especially `./retrieve-rights.sh` and `./apply-rights.sh`.
