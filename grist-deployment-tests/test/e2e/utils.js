import { browser } from "@wdio/globals";

const noCleanup = ["1", "y", "yes", "true"].includes(process.env.NO_CLEANUP);

// This id is a virtual one that is meant to target logged in user's personnal org.
// It remains constant for whoever calls the API and on whatever Grist instance.
const PERSONAL_ORG_ID = 0;

async function createWorkspace() {
  const wsName = `test-e2e__${new Date().toISOString()}`;
  const id = await browser.execute(
    (name, personalOrgId) =>
      fetch(`/o/docs/api/orgs/${personalOrgId}/workspaces`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      }).then((res) => res.json()),
    wsName,
    PERSONAL_ORG_ID,
  );
  return { id, name: wsName };
}

async function deleteWorkspace(id) {
  await browser.execute(async (id) => {
    await fetch(`/o/docs/api/workspaces/${id}/remove`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
  }, id);
}

export async function withTmpWorkspace(callback) {
  const { id: wsId, name: wsName } = await createWorkspace();
  try {
    await browser.refresh();
    await $(`=${wsName}`).click();
    await callback(wsId, wsName);
  } finally {
    if (!noCleanup) {
      await deleteWorkspace(wsId);
    }
  }
}

export async function withTmpTab(url, callback) {
  const originalHandle = await browser.getWindowHandle();
  let newHandle = null;
  try {
    newHandle = await browser.newWindow(url, { type: "tab" });
    await callback();
  } finally {
    if ((await browser.getWindowHandle()) === newHandle) {
      browser.close();
    }
    await browser.switchToWindow(originalHandle);
  }
}

export async function createDoc(workspaceId, name) {
  return browser.execute(
    (wsId, docName) =>
      fetch(`/o/docs/api/workspaces/${wsId}/docs`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: docName }),
      }).then((res) => res.json()),
    workspaceId,
    name,
  );
}

// Connects to the doc worker through a websocket (the same way the Grist client does)
// and asks to open the document. Resolves with the messages received from the server.
export async function openDocThroughWebsocket(docId, timeoutMs = 10_000) {
  return browser.execute(
    async (_docId, _timeoutMs) => {
      const worker = await fetch(`/o/docs/api/worker/${_docId}`, {
        credentials: "include",
      }).then((res) => res.json());
      const wsUrl = new URL(
        "o/docs",
        worker.docWorkerUrl.replace(/^http/, "ws"),
      );
      wsUrl.searchParams.set("clientId", "0");
      wsUrl.searchParams.set("counter", sessionStorage.getItem("clientCounter") ?? "0");
      wsUrl.searchParams.set("newClient", "1");
      wsUrl.searchParams.set(
        "browserSettings",
        JSON.stringify({ timezone: "UTC" }),
      );

      return new Promise((resolve) => {
        const result = { url: wsUrl.href, clientConnect: null, openDoc: null };
        const ws = new WebSocket(wsUrl.href);
        const done = (error) => {
          clearTimeout(timer);
          ws.onclose = null;
          ws.close();
          resolve({ ...result, error });
        };
        const timer = setTimeout(
          () => done(`Timed out after ${_timeoutMs}ms`),
          _timeoutMs,
        );
        ws.onerror = () => done("Websocket error");
        ws.onclose = (ev) => done(`Websocket closed (code ${ev.code})`);
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.type === "clientConnect") {
            result.clientConnect = msg;
            ws.send(
              JSON.stringify({ reqId: 1, method: "openDoc", args: [_docId] }),
            );
          } else if (msg.reqId === 1) {
            result.openDoc = msg;
            done(null);
          }
        };
      });
    },
    docId,
    timeoutMs,
  );
}
