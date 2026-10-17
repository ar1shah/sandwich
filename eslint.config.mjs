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
  {
    // The Remotion rules guard compositions (frame-pure rendering). The Electron UI is plain
    // React: normal <img> tags and CSS transitions are fine there.
    files: ["src/renderer/**"],
    rules: {
      "@remotion/warn-native-media-tag": "off",
      "@remotion/non-pure-animation": "off",
    },
  },
];
