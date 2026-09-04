import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
let nextConfigs = [];
try {
  nextConfigs = compat.extends("next/core-web-vitals");
} catch {
  nextConfigs = [];
}
export default [
  ...nextConfigs,
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "htmlcov/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // M12 naming cheap win: camelCase variables/functions/params (UPPER_CASE
      // consts + PascalCase components allowed, leading _ for test helpers),
      // PascalCase types. Object properties intentionally unchecked so wire
      // shapes (metrics snake_case keys, OpenAI max_output_tokens, etc.)
      // stay byte-identical.
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "variable",
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "parameter",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
      ],
    },
  },
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      complexity: ["warn", 12],
      "max-depth": ["warn", 4],
    },
  },
];
