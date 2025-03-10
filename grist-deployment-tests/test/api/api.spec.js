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
    workspaceId = wsCreationRes.data;
  });

  after(async () => {
    if (!noCleanup) {
      await axios.delete(url(`/api/workspaces/${workspaceId}`), {
        headers: headers(),
      });
    }
  });

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
        records: [record],
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

  it("should successfully invite a hundred of people", async () => {
    const docId = await createDoc("doc-invite-test");
    const emailsToInvite = new Array(99).fill(null).reduce(
      (acc, _, index) =>
        Object.assign(acc, {
          [`user${index + 1}@yopmail.com`]: "viewers",
        }),
      {},
    );
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
      102,
      "Does not have the expected number of invitations",
    );
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
});
