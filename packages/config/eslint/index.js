import js from "@eslint/js";
import nextPlugin from "eslint-config-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import globals from "globals";

/** @type {import('eslint').Linter.Config[]} */
export const baseConfig = [
  js.configs.recommended,
  {
    // Apply browser + node globals across all linted JS/TS so things like
    // `crypto`, `setTimeout`, `window`, `process` are recognized. This is
    // infrastructure, not a rule relaxation.
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: true,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs["strict-type-checked"].rules,
      // The TypeScript compiler already reports undefined identifiers and
      // duplicate declarations with full type awareness; the base ESLint
      // versions misreport on namespace types and declaration merging. The
      // typescript-eslint project explicitly recommends disabling these in
      // TS code. Not a rule weakening — TS catches the same violations.
      "no-undef": "off",
      "no-redeclare": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  prettier,
];

/** @type {import('eslint').Linter.Config[]} */
export const nextConfig = [...baseConfig, ...nextPlugin];
