import { config as sharedConfig } from "./wdio.conf.js";

export const config = {
  ...sharedConfig,
  capabilities: [
    {
      browserName: "firefox", // or "firefox", "microsoftedge", "safari"
      "moz:firefoxOptions": {
        args: ["-headless"],
      },
    },
  ],
};
