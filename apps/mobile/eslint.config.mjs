import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  // public/sw.js and swe-worker-*.js are build output of @serwist/next (src/app/sw.ts).
  { ignores: [".next/**", "next-env.d.ts", "public/sw.js", "public/swe-worker-*.js"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
