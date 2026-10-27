import { expect } from "@wdio/globals";

import HomePage from "../pageobjects/homepage.page.js";
import LoginPage from "../pageobjects/login.page.js";
import {
  createDoc,
  openDocThroughWebsocket,
  withTmpWorkspace,
} from "./utils.js";

describe("Websocket", () => {
  // Grist clients communicate with the doc workers through a websocket.
  // A misconfigured reverse proxy (e.g. not forwarding the "Upgrade" and "Connection" headers)
  // prevents the documents from being opened.
  it("should connect to the doc worker and open a document", async () => {
    await HomePage.open();
    await HomePage.goToLogin();
    await LoginPage.login();

    await withTmpWorkspace(async (wsId) => {
      const docId = await createDoc(wsId, "websocket-test");
      const { url, clientConnect, openDoc, error } =
        await openDocThroughWebsocket(docId);
      console.log(`Websocket connection to ${url}`);

      expect(error).toBeNull();
      expect(clientConnect).toMatchObject({ type: "clientConnect" });
      expect(openDoc.error).toBeUndefined();
      expect(openDoc.data.doc).toHaveProperty("_grist_DocInfo");
    });
  });
});
