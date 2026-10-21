import { browser } from "@wdio/globals";

class IntraFormPage {
  constructor() {
    this.frame = null;
  }

  // Resolves once the custom widget's iframe is attached, then binds all
  // subsequent queries to that frame's browsing context.
  async attach(page) {
    this.frame = await page.frame({ selector: ".test-custom-widget-ready" });
  }

  get successMessage() {
    return this.frame.$(".form-success");
  }

  get submitButton() {
    return this.frame.$("button*=Valider");
  }

  async selectFileForField(fieldName, fixture) {
    const fileUpload = this.frame.$(`input#file_${fieldName}`);
    // The element needs to be shown in order to interact with
    await fileUpload.execute(
      // assign style to elem in the browser
      (el) => (el.style.display = "block"),
      // pass in element so we don't need to query it again in the browser
      fileUpload,
    );
    await fileUpload.waitForDisplayed();
    return fileUpload.setValue(fixture);
  }

  async waitForSuccessMessageCleared() {
    await browser.waitUntil(async () => {
      return !(await this.successMessage.isExisting());
    });
  }

  async submit() {
    return this.submitButton.click();
  }
}

export default new IntraFormPage();
