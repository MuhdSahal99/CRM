import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

// ADR-0016: physical direction utilities break RTL. Use ms/me/ps/pe/start/end/text-start/text-end.
// No backslash escapes: esquery's selector parser drops them.
const PHYSICAL =
  "/(^| |:)-?(m[lr]|p[lr]|left|right|border-[lr]|rounded-[lr]|rounded-[tb][lr]|scroll-[mp][lr])(-| |$)|(^| |:)(text|float|clear)-(left|right)( |$)/";
const physicalMsg = "Physical direction class: use the logical one (ms-/me-/ps-/pe-/start-/end-/text-start/text-end).";

const config = [
  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  ...nextVitals,
  ...nextTs,
  {
    plugins: { i18next },
    rules: {
      // ADR-0016: no literal UI text in JSX, nor in user-facing attributes.
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          "jsx-attributes": {
            include: ["aria-label", "aria-description", "aria-valuetext", "title", "placeholder", "alt", "label"],
            exclude: [".*"],
          },
          // next-intl translators: t, tStage, tCommon, …
          callees: { exclude: ["t", "t[A-Z][A-Za-z]*", "require", "addEventListener", "removeEventListener"] },
        },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: `JSXAttribute[name.name='className'] > Literal[value=${PHYSICAL}]`, message: physicalMsg },
        { selector: `CallExpression[callee.name=/^(cn|cva)$/] Literal[value=${PHYSICAL}]`, message: physicalMsg },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "e2e/**"],
    rules: { "i18next/no-literal-string": "off" },
  },
];
export default config;
