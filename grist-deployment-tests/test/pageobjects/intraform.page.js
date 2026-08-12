import { $ } from "@wdio/globals";
import Page from "./page.js";

class IntraFormPage extends Page {
  get widgetIframe() {
    return $(".test-custom-widget-ready");
  }

  get successMessage() {
    return $(".form-success");
  }

  get submitButton() {
    return $("button*=Valider");
  }

  async selectFileForField(fieldName, fixture) {
    const fileUpload = $(`input#file_${fieldName}`);
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
