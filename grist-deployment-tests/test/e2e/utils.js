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
