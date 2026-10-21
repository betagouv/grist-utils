import { $, browser } from "@wdio/globals";
import Page from "./page.js";

/**
 * sub page containing specific selectors and methods for a specific page
 */
class HomePage extends Page {
  /**
   * define selectors using getter methods
   */
  get loginBtn() {
    return $(".test-user-sign-in");
  }

  get userIcon() {
    return $(".test-user-icon");
  }

  get logoutMenu() {
    return $(".test-dm-log-out");
  }

  get maintenancePopin() {
    return $("#maintenancePopin");
  }

  get acknowledgeMaintenanceCheckbox() {
    return $("#jaiCompris");
  }

  get closeMaintenancePopinBtn() {
    return $("#fermerPopinMaintenance");
  }

  get addNew() {
    return $(".test-dm-add-new");
  }

  get importDoc() {
    return $(".test-dm-import");
  }

  get importDocInputFile() {
    return $("#file_dialog_input");
  }

  async open() {
    const page = await super.open("/");
    if (await this.maintenancePopin.isDisplayed()) {
      await this.acknowledgeMaintenance();
    }
    return page;
  }

  async goToLogin() {
    await this.loginBtn.click();
  }

  async logout() {
    await this.userIcon.click();
    await this.logoutMenu.click();
  }

  async acknowledgeMaintenance() {
    await this.acknowledgeMaintenanceCheckbox.click();
    await this.closeMaintenancePopinBtn.click();
  }

  async importDocument(fixturePath) {
    await this.#preventDefaultClickAction("#file_dialog_input");
    await this.addNew.click();
    await this.importDoc.click();
    await this.importDocInputFile.addValue(fixturePath);
  }

  // Hack taken from grist-core:
  // https://github.com/gristlabs/grist-core/blob/054c080c0bd1d7108b053b4f45adbb63b92b3e1e/test/nbrowser/gristUtils.ts#L906
  // Apache2 license.
  async #preventDefaultClickAction(selector) {
    function script(_selector) {
      function handler(ev) {
        if (ev.target.matches(_selector)) {
          document.body.removeEventListener("click", handler);
          ev.preventDefault();
        }
      }
      document.body.addEventListener("click", handler);
    }
    await browser.execute(script, selector);
  }
}

export default new HomePage();
