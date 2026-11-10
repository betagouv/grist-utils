import { expect } from "@wdio/globals";
import HomePage from "../pageobjects/homepage.page.js";

describe("Links", () => {
  it("should display custom links", async () => {
    // When
    await HomePage.open();

    // Then
    await expect(HomePage.templatesLink).toBeDisplayed();
    await expect(HomePage.infoServiceLink).toBeDisplayed();
    await expect(HomePage.declAccessLink).toBeDisplayed();
  });
});
