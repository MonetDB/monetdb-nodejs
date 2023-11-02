import assert from "assert";
import Connection from "../src/connection";

describe("Connection", function () {
  let conn: Connection;

  it("should connect with default opt", async function () {
    conn = new Connection({ database: "test" });
    const ready = await conn.connect();
    assert(ready, new Error("failed to connect"));
    const closed = await conn.close();
    assert(closed);
  });

  it("should build Connection from mapi uri default username and password", function () {
    conn = new Connection("mapi:monetdb://foo.com:55555/test");
    assert.strictEqual(conn.mapi.host, "foo.com");
    assert.strictEqual(conn.mapi.port, 55555);
    assert.strictEqual(conn.mapi.username, "monetdb");
    assert.strictEqual(conn.mapi.password, "monetdb");
    assert.strictEqual(conn.mapi.database, "test");
  });

  it("should build Connection from mapi uri with auth component", function () {
    conn = new Connection(
      "mapi:monetdb://barname:barpassword@foo.com:55555/test"
    );
    assert.strictEqual(conn.mapi.host, "foo.com");
    assert.strictEqual(conn.mapi.port, 55555);
    assert.strictEqual(conn.mapi.username, "barname");
    assert.strictEqual(conn.mapi.password, "barpassword");
    assert.strictEqual(conn.mapi.database, "test");
  });

  it("should build Connection from mapi uri no port", function () {
    conn = new Connection("mapi:monetdb://foo.com/test");
    assert.strictEqual(conn.mapi.host, "foo.com");
    assert.strictEqual(conn.mapi.port, 50000);
    assert.strictEqual(conn.mapi.username, "monetdb");
    assert.strictEqual(conn.mapi.password, "monetdb");
    assert.strictEqual(conn.mapi.database, "test");
  });
});
