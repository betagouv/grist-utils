import { Blob } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { URL } from "node:url";
import axios from "axios";
import { assert } from "chai";

describe("API", function () {
  this.timeout("30s");
  const gristBaseDomain = new URL(process.env.GRIST_DOMAIN);
  const apiKey = process.env.USER_API_KEY;
  const orgId = Number.parseInt(process.env.ORG_ID || "0", 10);
  let workspaceId;
  const noCleanup = ["1", "y", "yes", "true"].includes(process.env.NO_CLEANUP);

  function headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
  }

  axios.interceptors.response.use(
    (response) => response,
    (err) => {
      console.error("Response error: ", err?.response?.data);
      console.error(
        'If the below error is "Document worker is not present", you may manually open a document on your instance to fix that. (FIXME: that is quite surprising)',
      );
      return Promise.reject(err);
    },
  );

  function url(path) {
    return new URL(path, gristBaseDomain).href;
  }

  before(async () => {
    if (!["https:", "http:"].includes(gristBaseDomain.protocol)) {
      throw new Error("GRIST_DOMAIN is not a valid URL");
    }
    assert.isString(apiKey, "USER_API_KEY is not a string");
    const wsCreationRes = await axios.post(
      url(`/api/orgs/${orgId}/workspaces`),
      {
        name: `test__ ${new Date().toISOString()}`,
      },
      {
        headers: headers(),
      },
    );
    assert.equal(wsCreationRes.status, 200, "Failed to create workspace");
    const { data: scimUser } = await axios.get(url("/api/scim/v2/Me"), {
      headers: headers(),
    });
    console.log("Connected as ", scimUser.userName);
    workspaceId = wsCreationRes.data;
  });

  after(async () => {
    if (!noCleanup) {
      await axios.delete(url(`/api/workspaces/${workspaceId}`), {
        headers: headers(),
      });
    }
  });

  /**
   * Small util to either return the same value if the parameter is already an array
   * or creates an array of a single element
   */
  const enforceArray = (val) => [].concat(val);

  async function createDoc(name) {
    const res = await axios.post(
      url(`/api/workspaces/${workspaceId}/docs`),
      {
        name,
      },
      {
        headers: headers(),
      },
    );
    assert.equal(res.status, 200, "Failed to create document");
    return res.data;
  }

  async function addRecord(docId, tableId, record) {
    const res = await axios.post(
      url(`/api/docs/${docId}/tables/${tableId}/records`),
      {
        records: enforceArray(record),
      },
      {
        headers: headers(),
      },
    );
    assert.equal(res.status, 200, "Failed to add record");
    return res.data;
  }

  async function addColumn(docId, tableId, id, fields) {
    const res = await axios.post(
      url(`/api/docs/${docId}/tables/${tableId}/columns`),
      {
        columns: [{ id, fields }],
      },
      {
        headers: headers(),
      },
    );
    assert.equal(res.status, 200, "Failed to add column");
    return res.data;
  }

  async function readTableRecords(docId, tableId) {
    const res = await axios.get(
      url(`/api/docs/${docId}/tables/${tableId}/records`),
      {
        headers: headers(),
      },
    );
    assert.equal(res.status, 200, "Failed to read table records");
    return res.data.records;
  }

  async function setDocSettings(docId, docSettings) {
    const changeSettingsUrl = url(
      `/api/docs/${docId}/tables/_grist_DocInfo/records`,
    );
    await axios.patch(
      changeSettingsUrl,
      {
        records: [
          {
            id: 1,
            fields: { documentSettings: JSON.stringify(docSettings) },
          },
        ],
      },
      {
        headers: headers(),
      },
    );
  }

  async function getWorkerInfoForDoc(docId) {
    const res = await axios.get(url(`/api/worker/${docId}`), {
      headers: headers(),
    });
    assert.equal(res.status, 200, "Failed to fetch doc info");
    return res.data;
  }

  // This is the most basic test
  it("should successfully create a document, put data and read document content", async () => {
    const docId = await createDoc("doc-creation-test");
    await addRecord(docId, "Table1", { fields: { A: "value1" } });
    const records = await readTableRecords(docId, "Table1");
    assert.lengthOf(records, 1);
    assert.equal(records[0].fields.A, "value1");
  });

  it("should evaluate formulas in a sandbox", async () => {
    const docId = await createDoc("doc-formulas-test");
    await addColumn(docId, "Table1", "legit_formula", {
      type: "Int",
      label: "legit formula",
      formula: "$A + $B",
      isFormula: true,
    });
    await addColumn(docId, "Table1", "bad_formula", {
      type: "Text",
      label: "Bad formula",
      formula: "import glob\nglob.glob('/etc/*')",
      isFormula: true,
    });
    await addRecord(docId, "Table1", { fields: { A: 1, B: 2 } });
    const records = await readTableRecords(docId, "Table1");
    assert.lengthOf(records, 1);
    assert.equal(
      records[0].fields.legit_formula,
      3,
      "The legit formula should have been evaluated",
    );
    assert.equal(
      records[0].fields.bad_formula,
      "[]",
      "The bad formula should not have access to system resources!",
    );
  });

  // In a multitenant environment, the Grist instance should be configured with the correct APP_HOME_INTERNAL_URL
  // This test ensure that this variable is correctly set
  it("should successfully duplicate a document", async () => {
    const sourceDocumentId = await createDoc("doc-duplication-test");
    const expectedValue = "test-dup";
    const fields = { A: expectedValue };
    await addRecord(sourceDocumentId, "Table1", { fields });
    const res = await axios.post(
      url("/api/docs"),
      {
        documentName: "test-dup",
        asTemplate: false,
        sourceDocumentId,
        workspaceId,
      },
      {
        headers: headers(),
      },
    );

    assert.equal(res.status, 200, "Failed to duplicate document");
    const destDocId = res.data;
    const records = await readTableRecords(destDocId, "Table1");
    assert.lengthOf(records, 1);
    assert.equal(records[0].fields.A, expectedValue);
  });

  it("should successfully invite 100 users", async () => {
    const docId = await createDoc("doc-invite-test");
    const resInvitationsBefore = await axios.get(
      url(`/api/docs/${docId}/access`),
      {
        headers: headers(),
      },
    );
    const numUsersBefore = resInvitationsBefore.data.users.length;
    assert.isFalse(
      resInvitationsBefore.data.users.some((u) =>
        u.email.match(/user\d+@yopmail\.com/),
      ),
      "Already have fake yopmail users, please clean up the org.",
    );
    const emailsToInvite = new Array(100).fill(null).reduce((acc, _, index) => {
      acc[`user${index + 1}@yopmail.com`] = "viewers";
      return acc;
    }, {});
    const res = await axios.patch(
      url(`/api/docs/${docId}/access`),
      {
        delta: {
          users: emailsToInvite,
        },
      },
      {
        headers: headers(),
      },
    );

    assert.equal(res.status, 200, "Invitation failed");
    const resInvitations = await axios.get(url(`/api/docs/${docId}/access`), {
      headers: headers(),
    });
    assert.equal(resInvitations.status, 200, "Get invitations failed");
    assert.lengthOf(
      resInvitations.data.users,
      numUsersBefore + 100,
      "Does not have the expected number of invitations",
    );
  });

  it("should format the number according to the language specified in the doc settings", async () => {
    const docId = await createDoc("doc-format-numbers");
    const tableId = "Table1";
    const lastColRegex = /(?<=,)("[^"]*"|[^,]*)$/gm;
    await addColumn(docId, tableId, "Num", {
      type: "Numeric",
      label: "Num",
      widgetOptions: JSON.stringify({
        alignment: "right",
        numMode: "currency",
        currency: "EUR",
      }),
    });
    await addRecord(docId, tableId, [
      { fields: { Num: 0.5 } },
      { fields: { Num: 42_000 } },
    ]);
    const csvExportApi = url(
      `/api/docs/${docId}/download/csv?viewSection=1&tableId=${tableId}`,
    );

    await setDocSettings(docId, { locale: "en-US" });
    const csvUSLocalized = await axios.get(csvExportApi, {
      headers: headers(),
    });
    assert.deepEqual(csvUSLocalized.data.match(lastColRegex), [
      "Num",
      "€0.50",
      '"€42,000.00"',
    ]);

    await setDocSettings(docId, { locale: "fr-FR" });
    const csvFRLocalized = await axios.get(csvExportApi, {
      headers: headers(),
    });
    const thousandsSeparatorFR = "\u202f";
    assert.deepEqual(csvFRLocalized.data.match(lastColRegex), [
      "Num",
      '"0,50 €"',
      `"42${thousandsSeparatorFR}000,00 €"`,
    ]);
  });

  // This test ensures that the S3 provider is correctly configured and handles versions correctly.
  it("should successfully create snapshots and restore them", async function () {
    this.timeout("180s");
    console.warn("this test takes a while to run");
    const docId = await createDoc("doc-snapshot-test");
    const expectedFields = { A: "value1", B: null, C: null };
    await addRecord(docId, "Table1", { fields: expectedFields });
    // Wait for 30s for the snapshot to be created
    console.log("Wait for 30s for the first snapshot to be created...");
    await setTimeout(30_000);
    await addRecord(docId, "Table1", { fields: { A: "value2" } });

    // Wait for 30s for the snapshot to be created
    console.log("Wait for 30s for the second snapshot to be created...");
    await setTimeout(30_000);
    console.log("Now the test resumes!");
    const recordsBeforeRestore = await readTableRecords(docId, "Table1");
    assert.lengthOf(recordsBeforeRestore, 2);
    assert.deepEqual(recordsBeforeRestore[0].fields, expectedFields);
    assert.equal(recordsBeforeRestore[1].fields.A, "value2");

    // Get the list of snapshots
    const resGetSnapshot = await axios.get(
      url(`/api/docs/${docId}/snapshots`),
      {
        headers: headers(),
      },
    );
    assert.equal(resGetSnapshot.status, 200, "Failed to get snapshots");
    const { snapshots } = resGetSnapshot.data;
    assert.lengthOf(snapshots, 2);

    // Ensure the snapshot can be fetched
    const olderSnapshotId = snapshots[1].snapshotId;
    const docSnapshotPreviewId = `${docId}~v=${olderSnapshotId}`;
    const previewRecords = await readTableRecords(
      docSnapshotPreviewId,
      "Table1",
    );
    assert.lengthOf(
      previewRecords,
      1,
      "Number of records in snapshot preview is greater than expected",
    );
    assert.deepEqual(previewRecords[0].fields, expectedFields);

    // Replace the current document with the older snapshots
    const resRestore = await axios.post(
      url(`/api/docs/${docId}/replace`),
      {
        sourceDocId: docSnapshotPreviewId,
      },
      {
        headers: headers(),
      },
    );

    assert.equal(resRestore.status, 200, "Failed to restore snapshot");
    const recordsAfterRestore = await readTableRecords(docId, "Table1");
    assert.lengthOf(
      recordsAfterRestore,
      1,
      "Number of records after restore is greater than expected",
    );
    assert.deepEqual(recordsAfterRestore[0].fields, expectedFields);
  });

  describe("Antivirus", () => {
    for (const ctx of [
      {
        itMsg: "should pass for regular attachments",
        docId: "doc-regular-attachment",
        attachmentFilePath: new URL(
          "../fixtures/attachments/regular.pdf",
          import.meta.url,
        ),
        expectedStatus: 200,
      },
      {
        itMsg: "should reject for malicious pdf",
        docId: "doc-malicious-attachment",
        attachmentFilePath: new URL(
          "../fixtures/attachments/malicious.pdf",
          import.meta.url,
        ),
        expectedStatus: 400,
      },
      {
        itMsg: "should pass for regular grist files",
        docId: "doc-regular-grist",
        attachmentFilePath: new URL(
          "../fixtures/grist/Hello.grist",
          import.meta.url,
        ),
        expectedStatus: 200,
      },
    ]) {
      it(ctx.itMsg, async () => {
        const docId = await createDoc(ctx.docId);
        await addColumn(docId, "Table1", "attachment", {
          type: "Attachments",
          label: "attachment",
        });
        const workerInfo = await getWorkerInfoForDoc(docId);
        const formData = new FormData();
        formData.append(
          "upload",
          new Blob([await fs.readFile(ctx.attachmentFilePath)]),
          path.basename(ctx.attachmentFilePath.pathname),
        );
        const urls = [
          new URL("uploads", workerInfo.docWorkerUrl),
          new URL("o/docs/uploads", workerInfo.docWorkerUrl),
          url(`/o/docs/api/docs/${docId}/attachments`),
          url(`/api/docs/${docId}/attachments`),
        ];

        for (const url of urls) {
          console.log(`Uploading using ${url}`);
          const res = await axios
            .post(url, formData, {
              headers: {
                ...headers(),
                "Content-Type": "multipart/form-data",
              },
            })
            .catch((err) => err.response || err);
          assert.equal(res.status, ctx.expectedStatus);
        }
      });
    }
  });
});
