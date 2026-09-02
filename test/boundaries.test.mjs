import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const sourceRoot = new URL("../src/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

describe("independent product boundaries", () => {
  it.each(["server", "schema"])("resolves %s for workerd but not a browser", (entrypoint) => {
    const script = `console.log(import.meta.resolve("@rizakura-hontai/daymark/${entrypoint}"))`;
    const options = {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    };
    const resolved = execFileSync(
      process.execPath,
      ["--conditions=workerd", "--conditions=browser", "--input-type=module", "-e", script],
      options,
    );
    expect(resolved.trim()).toBe(new URL(`${entrypoint}.ts`, sourceRoot).href);
    expect(() =>
      execFileSync(
        process.execPath,
        ["--conditions=browser", "--input-type=module", "-e", script],
        options,
      ),
    ).toThrow(/ERR_PACKAGE_PATH_NOT_EXPORTED/);
  });
  it("is private and exports only explicit entrypoints", () => {
    expect(manifest.private).toBe(true);
    expect(Object.keys(manifest.exports).sort()).toEqual([
      "./app",
      "./backup",
      "./browser",
      "./contracts",
      "./schema",
      "./server",
    ]);
    expect(manifest.exports["./server"].browser).toBeNull();
    expect(manifest.exports["./schema"].browser).toBeNull();
    expect(manifest.dependencies).toEqual({
      "drizzle-orm": "0.45.2",
      zod: "4.4.3",
    });
  });
  it("does not import application internals or perform side effects", () => {
    for (const file of readdirSync(sourceRoot)) {
      const source = readFileSync(new URL(file, sourceRoot), "utf8");
      expect(source).not.toMatch(
        /\b(?:import|require)\s*\(|\b(?:fetch|eval)\s*\(|process\.|globalThis\./,
      );
      const imports = [...source.matchAll(/\b(?:from\s*|import\s*)["']([^"']+)["']/g)].map(
        (match) => match[1],
      );
      const allowedImports = {
        "app.tsx": ["react", "./contracts.js", "./browser-date.js"],
        "browser-date.ts": [],
        "browser.ts": [],
        "backup.ts": ["./contracts.js"],
        "contracts.ts": ["zod"],
        "schema.ts": [
          "drizzle-orm/sql",
          "drizzle-orm/sqlite-core/checks",
          "drizzle-orm/sqlite-core/columns/integer",
          "drizzle-orm/sqlite-core/columns/text",
          "drizzle-orm/sqlite-core/indexes",
          "drizzle-orm/sqlite-core/table",
          "./contracts.js",
        ],
        "server.ts": ["./contracts.js"],
      };
      expect(imports).toEqual(allowedImports[file]);
    }
  });
});
