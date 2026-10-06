import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Flat config. eslint-config-next 16 exports native `Linter.Config[]` arrays,
 * so no FlatCompat shim is needed (and FlatCompat cannot be used with them —
 * it tries to JSON-clone the plugin objects and throws on the cycle).
 */
const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "supabase/tests/**",
    ],
  },
  {
    rules: {
      /* The CMS stores user prose; the double-quote style is ours, not theirs. */
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];

export default eslintConfig;