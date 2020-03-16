var Q = require("q");

const mdb = require("../index.js");
const { shouldHaveValidResult, notSoRandom } = require('./common');

function noop() {}

function getMDB() {
    return mdb({warnings: false, dbname: "test"});
}


describe("#Connection", function() {
    this.timeout(5000); 

    var MDB = getMDB();

    it("2 byte characters", async () => {
        var string = 'éééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééé';
            string += string;
            string += string;
            string += string;
            string += string;
            string += string;
        const qry = `select \'${string}\'`;
        const conn = new MDB();
        await conn.connect();
        const res = await conn.query(qry);
        res.data[0][0].should.equal(string);
    });

    it("should fail on invalid hostname", async function() {
        const conn = new MDB({host: "veryinvalidhostnamethathopefullyresolvesnowhere"});
        try {
           await conn.connect().should.be.rejected;
        } finally {
            conn.close();
        }
    });

    it("should fail on non existing database", async function() {
        const conn = new MDB({dbname: "nonexist"});
        try {
            await conn.connect().should.be.rejected;
         } finally {
             conn.close();
         }
    });

    it("should fail on invalid user", async function() {
        const conn = new MDB({user: "nonexist"});
        try {
            await conn.connect().should.be.rejected;
         } finally {
             conn.close();
         }
    });

    it("should connect", async function() {
        const conn = new MDB();
        try {
            await conn.connect().should.not.be.rejected;
         } finally {
             conn.close();
         }
    });

    it("should finish all its queries when closed", async function() {
        const conn = new MDB();
        try {
            conn.connect();
            const qs = [
                conn.query("SELECT 1"),
                conn.query("SELECT 2"),
                conn.query("SELECT 3")
            ];
            const res = await Promise.all(qs);
            res.should.not.be.null;
        } finally {
            conn.close();
        }
    });

    it("should fail all queries on destroyed connection", async function() {
        const conn = new MDB();
        try {
            conn.destroy();
            await Promise.all([
                conn.query("SELECT 1"),
                conn.query("SELECT 2"),
                conn.query("SELECT 3")
            ]).should.be.rejected;
        } finally {
            conn.close();
        }
    });

    it("should have the appropriate state at all times", function() {
        const conn = new MDB();
        conn.getState().should.equal("disconnected");
        return conn.connect().then(function() {
            conn.getState().should.equal("ready");
            return conn.close();
        }).then(function() {
            conn.getState().should.equal("destroyed");
        }).finally(function(){
            conn.close();
        });
    });

    it("should properly start queries after some idle time after connect", function() {
        const conn = new MDB();
        conn.connect();
        return  new Promise((resolve, reject) => {
            setTimeout(function() {
                conn.query("SELECT 42")
                    .then(function(r) {
                        resolve(r);
                    }, function(err) {
                        reject(err);
                    })
                    .finally(function(){
                        conn.close();
                    });
            }, 100);
        });
    });

    it("should give its appropriate environment on request", async function() {
        const conn = new MDB();
        try {
            await conn.connect();
            return conn.env()
                .should.eventually.be.an("object")
                .that.has.property("monet_version")
                .that.is.a("string");
        } finally {
            conn.close();
        }
    });

    it("should fail on non existing defaultSchema", async function() {
        const conn = new MDB({defaultSchema: "non_existant"});
        try {
            await conn.connect().should.be.rejected;
        } finally {
            conn.close();
        }
    });

    it("should pass on existing defaultSchema", async function() {
        const conn1 = new MDB();
        const conn2 = new MDB({defaultSchema: "some_schema"});
        await conn1.connect();
        return conn1.query("START TRANSACTION; " +
            "CREATE SCHEMA some_schema; " +
            "SET SCHEMA some_schema; " +
            "CREATE TABLE a (a INT); " +
            "INSERT INTO a VALUES (1); " +
            "COMMIT;").then(function() {
            return conn2.connect();
        })
        .then(function() {
            return conn2.query("SELECT * FROM a");
        })
        .finally(function() {
            conn1.close();
            conn2.close();
        })
        .should.eventually.have.property("rows", 1)
    });

    it("should have the right aliases", function() {
        const conn = new MDB();
        conn.open.should.equal(conn.connect);
        conn.request.should.equal(conn.query);
        conn.disconnect.should.equal(conn.close);
    });

});

describe("#Reconnect logic", function() {
    this.timeout(10000);
    var MDB = getMDB();

    it("should finish query after reconnect", function() {
        var conn = new MDB({testing: true, debug: true, logger: noop});
        var query = conn.connect()
            .then(function() {
                conn.mapiConnection.socketError("ECONNRESET");
                return conn.query("SELECT 'whatever' AS a");
            })
            .finally(function() {
                conn.close();
            });

        shouldHaveValidResult(query, 1, 1, ["a"])
            .should.eventually.have.property("data")
            .that.deep.equals([["whatever"]]);
    });

    it("should finish many queries when reconnects occur in between", function() {
        this.timeout(300000);

        var conn = new MDB({testing: true});
        return conn.connect()
            .then(function() {
                var qs = [];
                for(var i=0; i<100; ++i) {
                    qs.push(
                        conn.query("SELECT " + i + " AS i")
                            .should.eventually.have.property("data")
                            .that.deep.equals([[i]])
                    );
                }
                // simulate connection failure with a random interval
                var timeout = null;
                function failNow() {
                    try {
                        conn.mapiConnection.socketError("ECONNRESET");
                    } catch(e) {}
                    timeout = setTimeout(failNow, 200 + Math.round(notSoRandom()*500));
                }
                failNow();
                return Q.all(qs)
                    .finally(function() {
                        if(timeout !== null) clearTimeout(timeout);
                        conn.close();
                    });
            });
    });

    it("should give up and fail queries after reaching its limits", function() {
        var conn = new MDB({testing: true, maxReconnects: 2, reconnectTimeout: 1, debug: true, logger: noop});
        return conn.connect()
            .then(function() {
                var qs = [
                    conn.query("SELECT 1").should.be.rejected,
                    conn.query("SELECT 2").should.be.rejected,
                    conn.query("SELECT 3").should.be.rejected
                ];
                try {
                    conn.mapiConnection.socketError("ECONNRESET", true);
                } catch(e) {
                    conn.close();
                }
                return Promise.all(qs)
            })
            .finally(function(){
                conn.close();
            });
            
    });

});

describe("auto_commit logic", function() {
    const MDB = getMDB();

    it('should set auto_commit true by default' , async () => {
        const conn = new MDB();
        conn.autoCommit.should.equals(true);
    });

    it.only('should set auto_commit off and transactions not explicitly commited should be rolled back', async () => {
        let conn = new MDB();
        await conn.connect();
        await conn.query(`
        drop table if exists foo;
        CREATE TABLE foo(a INT, b FLOAT, c BLOB);
        `);
        let res = await conn.query("select * from foo");
        res['rows'].should.equals(0);
        conn.close();
        conn = new MDB({autoCommit: false});
        conn.autoCommit.should.equals(false);
        await conn.connect();
        const qry = `INSERT INTO foo VALUES (42,4.2,'42'),(43,4.3,'43'),(44,4.4,'44'),(45,4.5,'45')`;
        await conn.query(qry);
        res = await conn.query("select * from foo");
        res.rows.should.equals(4);
        conn.close()
        conn = new MDB();
        await conn.connect();
        res = await conn.query("select * from foo");
        res.rows.should.equals(0);
        await conn.query("drop table if exists foo;");
        conn.close();
    });
});
