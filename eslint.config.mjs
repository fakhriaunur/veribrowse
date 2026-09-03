import { FlatCompat } from "@eslint/eslintrc";
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
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      complexity: ["error", 12],
      "max-depth": ["error", 4],
    },
  },
];
