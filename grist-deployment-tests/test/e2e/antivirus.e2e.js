import path from "node:path";
import { fileURLToPath } from "node:url";

import { browser, expect } from "@wdio/globals";

import DocPage from "../pageobjects/docpage.page.js";
import FormPage from "../pageobjects/form.page.js";
import HomePage from "../pageobjects/homepage.page.js";
import LoginPage from "../pageobjects/login.page.js";
import { withTmpTab, withTmpWorkspace } from "./utils.js";

// These tests are complementary to the API tests.
// NOTE: We should opt for writing them using Webdriver only when a step is at least not trivial doing so using the API
// (like publishing a form)
describe.skip("Antivirus 2", () => {
  it("should block malicious attachments in form", async () => {
    // Given
    await HomePage.open();
    await HomePage.goToLogin();
    await LoginPage.login();
    const fixturePath = path.resolve(
      fileURLToPath(import.meta.url),
      "../../fixtures/",
    );
    const malwarePdfPath = path.join(
      fixturePath,
      "./attachments/malicious.pdf",
    );
    const regularPdfPath = path.join(fixturePath, "./attachments/regular.pdf");

    await withTmpWorkspace(async () => {
      await HomePage.importDocument(
        path.join(fixturePath, "./grist/SimpleForm.grist"),
      );
      const formLink = await DocPage.publishForm();

      await withTmpTab(formLink, async () => {
        await FormPage.selectFileForField("Attachments", malwarePdfPath);
        await FormPage.submit();
        await expect(FormPage.genericErrorMessage).toBeDisplayed();

        await browser.refresh();

        await FormPage.selectFileForField("Attachments", regularPdfPath);
        await FormPage.submit();
        await expect(FormPage.successMessage).toBeDisplayed();
      });
    });
  });
});
