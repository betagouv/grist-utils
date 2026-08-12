import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "@wdio/globals";

import HomePage from "../pageobjects/homepage.page.js";
import IntraFormPage from "../pageobjects/intraform.page.js";
import LoginPage from "../pageobjects/login.page.js";
import { withTmpWorkspace } from "./utils.js";

describe("Upload of files through widgets", () => {
  // This is a non-regression test for Grav:
  // https://forum.grist.libre.sh/t/upload-de-pieces-jointes-depuis-un-widget-personnalise-bloque-par-cors/3434
  //
  // And the technical explanation:
  // https://github.com/betagouv/grist-grav/pull/11
  it("should pass", async () => {
    await HomePage.open();
    await HomePage.goToLogin();
    await LoginPage.login();
    const fixturePath = path.resolve(
      fileURLToPath(import.meta.url),
      "../../fixtures/",
    );
    const regularPdfPath = path.join(fixturePath, "./attachments/regular.pdf");
    const dummyFile1 = path.join(fixturePath, "./attachments/dummy1.txt");
    await withTmpWorkspace(async () => {
      await HomePage.importDocument(
        path.join(fixturePath, "./grist/IntraForm.grist"),
      );
      await expect(IntraFormPage.widgetIframe).toBeDisplayed();
      await browser.switchFrame(IntraFormPage.widgetIframe);

      await IntraFormPage.selectFileForField("PJ", regularPdfPath);
      await IntraFormPage.submit();
      await expect(IntraFormPage.successMessage).toBeDisplayed();
      await IntraFormPage.waitForSuccessMessageCleared();
      await IntraFormPage.selectFileForField("PJ", dummyFile1);
      await IntraFormPage.submit();
      await expect(IntraFormPage.successMessage).toBeDisplayed();
    });
  });
});
