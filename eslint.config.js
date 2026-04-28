import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "skipped", "v1.72.3-working-code"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      sonarjs,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "no-var": "error",
      "@typescript-eslint/no-restricted-types": "off",

      // --- SonarJS: Code smells & complexity ---
      "sonarjs/cognitive-complexity": ["warn", 15],
      "sonarjs/no-duplicate-string": ["warn", { threshold: 4 }],
      "sonarjs/no-identical-functions": "warn",
      "sonarjs/no-collapsible-if": "warn",
      "sonarjs/no-redundant-boolean": "warn",
      "sonarjs/no-unused-collection": "off",
      "sonarjs/no-dead-store": "off",
      "sonarjs/no-unused-function-argument": "off",
      "sonarjs/no-unused-vars": "off",
      "sonarjs/prefer-immediate-return": "warn",
      "sonarjs/no-small-switch": "warn",
      "sonarjs/no-gratuitous-expressions": "warn",

      // ── Template-literal standardization ─────────────────────────────
      // `no-nested-template-literals` was previously "warn" and tripped
      // CI only because of `--max-warnings=0`. Promoting to "error" makes
      // the intent explicit in the config itself, so a future contributor
      // who relaxes `--max-warnings` (or runs ESLint locally without it)
      // still gets a hard failure on nested back-tick interpolations.
      // Companion guard `scripts/check-no-nested-template-literals.mjs`
      // hard-pins the same rule on `run-summary-types.ts` even if this
      // line is ever softened.
      "sonarjs/no-nested-template-literals": "error",
      // Standardize on template literals for any string concatenation that
      // already mixes a literal with a variable (`"x" + foo` → `` `x${foo}` ``).
      // Pure literal joins like `"a" + "b"` are NOT flagged.
      "prefer-template": "error",
      // Forbid useless backticks like `` `plain string` `` — keep template
      // literals reserved for actual interpolation or multi-line strings.
      "no-useless-concat": "error",

      // --- Function size (matches 25-line standard) ---
      "max-lines-per-function": ["warn", {
        max: 25,
        skipBlankLines: true,
        skipComments: true,
      }],
    },
  },
  // --- Overrides: suppress known-safe patterns ---
  {
    files: ["standalone-scripts/**/*.{ts,tsx}"],
    rules: {
      // no-explicit-any enforced here too — no exceptions
    },
  },
  {
    files: ["standalone-scripts/macro-controller/src/**/*.ts"],
    rules: {
      "max-lines-per-function": ["warn", { max: 60, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}", "standalone-scripts/**/src/__tests__/**/*.{ts,tsx}", "chrome-extension/tests/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "max-lines-per-function": "off",
      "sonarjs/no-duplicate-string": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}", "src/components/theme/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // --- Build configs & generated files — disable function size ---
  {
    files: ["vite.config*.ts", "chrome-extension/vite.config.ts", "src/test/snapshots/**/*.{ts,tsx}"],
    rules: {
      "max-lines-per-function": "off",
    },
  },
  // --- React components with JSX — raise to 50 ---
  {
    files: ["src/components/**/*.tsx", "src/pages/**/*.tsx", "src/options/**/*.tsx", "src/popup/**/*.tsx"],
    rules: {
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],
    },
  },
  // --- Background handlers & content scripts — raise to 40 ---
  {
    files: ["src/background/**/*.ts", "src/content-scripts/**/*.ts", "src/hooks/**/*.ts", "src/lib/**/*.ts", "src/platform/**/*.ts"],
    ignores: ["**/__tests__/**"],
    rules: {
      "max-lines-per-function": ["warn", { max: 40, skipBlankLines: true, skipComments: true }],
    },
  },
  // --- Standalone scripts (non-controller) — raise to 50 ---
  {
    files: ["standalone-scripts/**/src/**/*.ts"],
    ignores: ["standalone-scripts/**/__tests__/**"],
    rules: {
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["skipped/**/*.{js,ts}"],
    rules: {
      // Archived / inactive scripts — skip all linting
    },
  },
);
