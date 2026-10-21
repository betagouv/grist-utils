import { $ } from "@wdio/globals";
import Page from "./page.js";

/**
 * sub page containing specific selectors and methods for a specific page
 */
class LoginPage extends Page {
  /**
   * define selectors using getter methods
   */
  get inputEmail() {
    return $("#email-input");
  }

  get inputPassword() {
    return $("#password-input");
  }

  get btnSubmitEmail() {
    return $("#email-submit-button");
  }

  get btnSubmitPassword() {
    return $("button*=S’identifier");
  }

  get dinumOrgTile() {
    return $("a*=DINUM");
  }

  /**
   * a method to encapsule automation code to interact with the page
   * e.g. to login using username and password
   */
  async login(
    email = process.env.USER_LOGIN,
    password = process.env.USER_PASSWORD,
  ) {
    await this.inputEmail.setValue(email);
    await this.btnSubmitEmail.click();
    await this.inputPassword.setValue(password);
    await this.btnSubmitPassword.click();
    await this.dinumOrgTile.click();
  }

  /**
   * overwrite specific options to adapt it to page object
   */
  open() {
    return super.open("/o/docs/login?next=/");
  }
}

export default new LoginPage();
