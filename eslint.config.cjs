const js = require("@eslint/js");
const react = require("eslint-plugin-react");
const hooks = require("eslint-plugin-react-hooks");
const importPlugin = require("eslint-plugin-import");

module.exports = [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.jsx"],
    ignores: ["node_modules/**", "dist/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        console: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        window: "readonly",
        document: "readonly",
        performance: "readonly",
        requestIdleCallback: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        AbortController: "readonly",
      },
    },
    plugins: { react, hooks, import: importPlugin },
    rules: {
      "no-unused-vars": "warn",
      "react/jsx-uses-vars": "error",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off"
    }
  }
];
