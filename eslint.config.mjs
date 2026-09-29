import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
// Local run artifacts are preserved research records, not application source.
export default defineConfig([...next, ...ts, globalIgnores([".next/**", ".qa/**", "reports/**", "experiments/**", "next-env.d.ts", "schemas/**"])]);
