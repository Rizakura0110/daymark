import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sourceRoot = new URL("../src/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

describe("independent product boundaries", () => {
  it("is private and exports only explicit entrypoints", () => {
    expect(manifest.private).toBe(true);
    expect(Object.keys(manifest.exports).sort()).toEqual([
      "./browser",
      "./contracts",
      "./schema",
      "./server",
    ]);
    expect(manifest.exports["./server"].browser).toBeNull();
    expect(manifest.exports["./schema"].browser).toBeNull();
    expect(manifest.dependencies).toBeUndefined();
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
      expect(imports).toEqual(file === "server.ts" ? ["./contracts.js"] : []);
    }
  });
});
