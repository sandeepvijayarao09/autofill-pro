import js from "@eslint/js";
import globals from "globals";

/**
 * Flat ESLint config. Three contexts coexist in this repo:
 *  - extension runtime (browser + WebExtension globals)
 *  - Node tooling (build scripts, icon generator)
 *  - the Node test runner
 */
export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "test_form.html",
      "test_application.html",
      "inject_profile.js",
    ],
  },
  js.configs.recommended,

  // Extension runtime — runs in the browser with the chrome.* API.
  {
    files: ["background.js", "content.js", "popup.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      eqeqeq: ["error", "smart"],
      "prefer-const": "warn",
    },
  },

  // Node tooling + tests.
  {
    files: ["scripts/**/*.{js,mjs}", "test.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { sourceType: "module" },
  },
];
