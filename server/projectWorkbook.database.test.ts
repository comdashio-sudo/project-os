import ExcelJS from "exceljs";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { PROJECT_WORKBOOK_VERSION } from "./domain/projectWorkbook";

// Q-51 batch 1: the project workbook is downloaded through the router, like an import template (dataImports.template): a signed-in person gets the
// blank workbook in the language asked for; nobody signed in gets nothing. The blank workbook holds no company data. Synthetic data only.
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection; let userId = 0;
const signedIn = () => appRouter.createCaller({ user: { id: userId, openId: "q51-user", name: "Q51 User", email: "q51-user@q51.example.test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-51 batch 1: downloading the project workbook", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await connection.query("DELETE FROM users WHERE openId = 'q51-user'");
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('q51-user', 'Q51 User', 'q51-user@q51.example.test', 'user')");
    userId = (await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'q51-user'"))[0][0].id;
  });
  afterAll(async () => { if (connection) { await connection.query("DELETE FROM users WHERE openId = 'q51-user'"); await connection.end(); } });

  it("POSITIVE: a signed-in person downloads it in Arabic, English or Urdu, and the file names its version", async () => {
    for (const locale of ["ar", "en", "ur"] as const) {
      const file = await signedIn().dataImports.projectWorkbook({ locale });
      expect(file.fileName).toBe(`dashio-project-workbook-${locale}.xlsx`);
      const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(file.base64, "base64") as unknown as ArrayBuffer);
      expect(book.getWorksheet("_dashio")!.getCell("A1").value).toBe(PROJECT_WORKBOOK_VERSION);
    }
  });

  it("NEGATIVE: nobody signed in gets nothing", async () => {
    const anonymous = appRouter.createCaller({ user: null } as unknown as TrpcContext);
    await expect(anonymous.dataImports.projectWorkbook({ locale: "ar" })).rejects.toThrow();
  });
});
