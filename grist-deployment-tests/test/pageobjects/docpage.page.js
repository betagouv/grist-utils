import { $ } from "@wdio/globals";
import Page from "./page.js";

class DocPage extends Page {
  get publishFormButton() {
    return $(".test-forms-publish");
  }

  get shareFormButton() {
    return $(".test-forms-share");
  }

  get sharedUrlFormInput() {
    return $(".test-forms-link");
  }

  // FIXME: Should be worth to add it in its own component
  // Well, not much selectors at this moment, so let's take this decision later.
  get confirmModal() {
    return $(".test-modal-confirm");
  }

  async publishForm() {
    await this.publishFormButton.click();
    if (await this.confirmModal.isExisting()) {
      await this.confirmModal.click();
    }
    await this.shareFormButton.click();
    return await this.sharedUrlFormInput.getValue();
  }
}

export default new DocPage();
