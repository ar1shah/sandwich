import { config } from "@remotion/eslint-config-flat";

export default [
  ...config,
  {
    ignores: [
      ".vite/**",
      "out/**",
      "dist/**",
      "fixtures/**",
      "test-results/**",
    ],
  },
];
