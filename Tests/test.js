var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
var Q = require("q");

chai.should();
chai.use(chaiAsPromised);

var mdb = require("../index.js");
function getMDB() {
    return mdb({debug: false, dbname: "test"});
}

function shouldHaveValidResult(query, nrRows, nrCols, colNames) {
    var colObj = colNames.reduce(function(o, v, i) {
        o[v] = i;
        return o;
    }, {});
    return Q.all([
        query.should.not.be.rejected,
        query.should.eventually.have.all.keys(["rows", "cols", "data", "col", "structure", "queryid", "type"]),
        query.should.eventually.have.property("rows", nrRows),
        query.should.eventually.have.property("cols", nrCols),
        query.should.eventually.have.property("col")
            .that.is.an("object")
            .that.deep.equals(colObj),
        query.should.eventually.have.property("queryid")
            .that.is.a("number"),
        query.should.eventually.have.property("type")
            .that.equals("table"),
        query.should.eventually.have.property("structure")
            .that.is.an("array")
            .with.length(nrCols)
            .and.has.property("0")
            .that.has.all.keys(["table", "column", "type", "typelen", "index"])
    ]).then(function() {
        return query;
    });
}

// The Javascript built in random function does not offer giving in a seed, making failing test cases
// based on random things a bit annoying to reproduce. Hence, we create a (not so) random function
// that looks random enough for testing purposes, and does offer a seed-based sequence.
var seed = 1;
function notSoRandom() {
    var x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

describe("#Options", function() {
    it("should throw exception when global option has wrong type", function() {
        (function() { mdb({dbname: 2, debug: false}); }).should.throw(Error);
    });

    it("should throw exception when local option has wrong type", function() {
        (function() { new (mdb({debug: false}))({dbname: 2}); }).should.throw(Error);
    });

    it("should not throw exception when global required options are missing", function() {
        (function() { mdb({debug: false}); }).should.not.throw(Error);
    });

    it("should throw exception when local required option is missing", function() {
        (function() { new (mdb({debug: false}))(); }).should.throw(Error);
    });

    it("should not throw exception when local required option was given globally", function() {
        (function() { new (mdb({dbname: "test", debug: false}))(); }).should.not.throw(Error);
    });

    it("should use default if both global and local are not given", function() {
        new (mdb({dbname: "test", debug: false}))()
            .option("user").should.equal("monetdb");
    });

    it("should use global if global is given but local isn't", function() {
        new (mdb({dbname: "test", debug: false, user: "custom"}))()
            .option("user").should.equal("custom");
    });

    it("should use local if both global and local are given", function() {
        new (mdb({dbname: "test", debug: false, user: "custom"}))({user: "other"})
            .option("user").should.equal("other");
    });

    it("should use local if only local is given", function() {
        new (mdb({dbname: "test", debug: false}))({user: "other"})
            .option("user").should.equal("other");
    });
});

describe("#Logging", function() {
    this.timeout(10000);

    var calls;
    function mylogger() { ++calls; }

    it("should give warning for unrecognized options when debug is set to true", function() {
        calls = 0;
        function myDebugFn(logger, type) { if(type == "warn") ++calls; }
        new (mdb({logger: function() { }, debugFn: myDebugFn}))({dbname: "test", hopefullyNotAnOption: 1});
        return calls.should.be.above(0);
    });

    it("should be done at least once for debug messages during connect", function() {
        calls = 0;
        var conn = new (mdb({dbname: "test", logger: mylogger}))();
        return conn.connect().fin(function() {
            calls.should.be.above(0);
        });
    });

    it("should be done at least once for debugMapi messages during connect", function() {
        calls = 0;
        var conn = new (mdb({dbname: "test", logger: mylogger, debug: false, debugMapi: true}))();
        return conn.connect().fin(function() {
            calls.should.be.above(0);
        });
    });

    it("should be done at least once for debugRequests messages during connect", function() {
        calls = 0;
        var conn = new (mdb({dbname: "test", logger: mylogger, debug: false, debugRequests: true}))();
        return conn.connect().fin(function() {
            calls.should.be.above(0);
        });
    });
});


describe("#Connection", function() {
    this.timeout(10000);

    var conns = [];
    var MDB = getMDB();

    after("Cleanup connections", function() {
        conns.forEach(function(conn) {
            conn.destroy();
        });
    });

    it("should fail on invalid hostname", function() {
        var conn = new MDB({host: "veryinvalidhostnamethathopefullyresolvesnowhere"});
        conns.push(conn);
        return conn.connect()
            .should.be.rejected;
    });

    it("should fail on non existing database", function() {
        var conn = new MDB({dbname: "nonexist"});
        conns.push(conn);
        return conn.connect()
            .should.be.rejected;
    });

    it("should fail on invalid user", function() {
        var conn = new MDB({user: "nonexist"});
        conns.push(conn);
        return conn.connect()
            .should.be.rejected;
    });

    it("should connect", function() {
        var conn = new MDB();
        conns.push(conn);
        return conn.connect()
            .should.not.be.rejected;
    });

    it("should fail all queries on destroyed connection", function() {
        var conn = new MDB();
        conn.destroy();
        return Q.all([
            conn.query("SELECT 1"),
            conn.query("SELECT 2"),
            conn.query("SELECT 3")
        ]).should.be.rejected;
    });
});

describe("#Reconnect logic", function() {
    this.timeout(10000);
    var MDB = getMDB();

    it("should finish query after reconnect", function() {
        var conn = new MDB({testing: true});
        var query = conn.connect().then(function() {
            conn.mapiConnection.socketError("ECONNRESET");
            return conn.query("SELECT 'whatever' AS a");
        });

        return shouldHaveValidResult(query, 1, 1, ["a"])
            .should.eventually.have.property("data")
            .that.deep.equals([["whatever"]]);
    });

    it("should finish many queries when reconnects occur in between", function() {
        this.timeout(30000);

        var conn = new MDB({testing: true});
        return conn.connect().then(function() {
            var qs = [];
            for(var i=0; i<1000; ++i) {
                qs.push(
                    conn.query("SELECT " + i + " AS i")/*.then(function(result) { console.log(result.data[0][0]); return result; })*/
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
                timeout = setTimeout(failNow, Math.round(notSoRandom()*300));
            }
            failNow();
            return Q.all(qs).fin(function() {
                if(timeout !== null) clearTimeout(timeout);
            });
        });
    });
});

describe("#Regular querying", function() {
    this.timeout(10000);

    var MDB = getMDB();
    var conn = new MDB();
    conn.connect();

    beforeEach("Starting transaction", function() {
        return conn.query("START TRANSACTION");
    });

    afterEach("Rollback transaction", function() {
        return conn.query("ROLLBACK");
    });

    after("Destroy connection", function() {
        conn.destroy();
    });

    it("should yield a valid result", function() {
        var query = conn.query(
            "CREATE TABLE foo(a INT, b FLOAT, c BLOB);\n" +
            "INSERT INTO foo VALUES (42,4.2,'42'),(43,4.3,'43'),(44,4.4,'44'),(45,4.5,'45')"
        ).then(function() {
            return conn.query("SELECT * FROM foo");
        });

        return shouldHaveValidResult(query, 4, 3, ["a", "b", "c"])
            .should.eventually.have.property("data")
            .that.deep.equals([
                [42, 4.2, "42"],
                [43, 4.3, "43"],
                [44, 4.4, "44"],
                [45, 4.5, "45"]
            ]);
    });

    it("should yield a valid pretty result on demand", function() {
        var query = conn.query(
            "CREATE TABLE foo(a INT, b FLOAT, c BLOB);\n" +
            "INSERT INTO foo VALUES (42,4.2,'42'),(43,4.3,'43'),(44,4.4,'44'),(45,4.5,'45')"
        ).then(function() {
            return conn.query("SELECT * FROM foo", true);
        });

        return shouldHaveValidResult(query, 4, 3, ["a", "b", "c"])
            .should.eventually.have.property("data")
            .that.deep.equals([
                {a: 42, b: 4.2, c: "42"},
                {a: 43, b: 4.3, c: "43"},
                {a: 44, b: 4.4, c: "44"},
                {a: 45, b: 4.5, c: "45"}
            ]);
    });

    it("should work on queries that exceed mapi block size", function() {
        function rep(str,n) {
            ret = '';
            for (var i = 0; i< n; i++) {
                ret += str;
            }
            return ret;
        }
        var longstr = rep('ABCDEFGHIJKLMNOP', 10000);
        var query = conn.query("SELECT '" + longstr + "' AS longstr");
        return shouldHaveValidResult(query, 1, 1, ["longstr"])
            .should.eventually.have.property("data")
            .that.deep.equals([[longstr]]); // for some reason, if equals fails here, the truncateThreshold is
                                            // ignored and the huge string is printed... let's just
                                            // hope this equals test always passes
    });

    it("should fail on invalid queries", function() {
        return conn.query("MEHR BIER").should.be.rejected;
    });

    it("should properly handle (escaped) quotes", function() {
        var query = conn.query("SELECT '\\\\asdf' AS a, '\"' AS b, '\\\"' AS c, '\\\\\"' AS d, '\\'' AS e");
        return shouldHaveValidResult(query, 1, 5, ["a", "b", "c", "d", "e"])
            .should.eventually.have.property("data")
            .that.deep.equals([['\\asdf', '"', '\\"', '\\"', "'"]]);
    });

    it("should properly store and retrieve escaped values", function() {
        var query = conn.query(
            "CREATE TABLE foo(a string);\n" +
            "INSERT INTO foo VALUES ('\t\n\r\n\tlalala\t\n\r')"
        ).then(function() {
            return conn.query("SELECT * FROM foo");
        });

        return shouldHaveValidResult(query, 1, 1, ["a"])
            .should.eventually.have.property("data")
            .that.deep.equals([['\t\n\r\n\tlalala\t\n\r']]);
    });

    it("should work on many queries", function() {
        var qs = [];
        for(var i=0; i<1000; ++i) {
            qs.push(
                conn.query("SELECT " + i + " AS i")
                    .should.eventually.have.property("data")
                    .that.deep.equals([[i]])
            );
        }
        return Q.all(qs);
    });
});

describe("#Prepared queries", function() {
    this.timeout(10000);

    var MDB = getMDB();
    var conn = new MDB();
    conn.connect();

    beforeEach("Starting transaction", function() {
        return conn.query("START TRANSACTION; CREATE TABLE foo(d INT, e FLOAT, f CHAR(5))");
    });

    afterEach("Rollback transaction", function() {
        return conn.query("ROLLBACK");
    });

    after("Destroy connection", function() {
        conn.destroy();
    });

    it("should be executable multiple times", function() {
        var prepResult;
        var query = conn.prepare("INSERT INTO foo VALUES (?, ?, ?)").then(function(prepResult_) {
            prepResult = prepResult_;
            return Q.all([
                prepResult.exec([55, 5.5, "5.5"]),
                prepResult.exec([56, 5.6, "5.6"]),
                prepResult.exec([57, 5.7, "5.7"]),
                prepResult.exec([58, 5.8, "5.8"])
            ]);
        }).then(function() {
            prepResult.release();
            return conn.query("SELECT * FROM foo");
        });

        return shouldHaveValidResult(query, 4, 3, ["d", "e", "f"])
            .should.eventually.have.property("data")
            .that.deep.equals([
                [55, 5.5, "5.5"],
                [56, 5.6, "5.6"],
                [57, 5.7, "5.7"],
                [58, 5.8, "5.8"]
            ]);
    });

    it("should be interleavable with normal queries", function() {
        var queryFns = [
            function() { return conn.query("SELECT COUNT(*) FROM foo"); },
            function() { return conn.query("SELECT AVG(d + e) AS avg FROM foo GROUP BY f"); },
            null,
            null,
            null
        ];
        var query = Q.all([
            conn.prepare("INSERT INTO foo VALUES (?, ?, ?)"),
            conn.prepare("SELECT COUNT(*) FROM foo WHERE d > ? AND e < ?"),
            conn.prepare("DELETE FROM foo WHERE d < ?")
        ]).then(function(prepResults) {
            queryFns[2] = function() {
                return prepResults[0].exec([Math.round(notSoRandom()*10), notSoRandom()*10, 'str']);
            };
            queryFns[3] = function() {
                var a = Math.abs(notSoRandom() * 5);
                return prepResults[1].exec([Math.round(a), a + notSoRandom() * 5]);
            };
            queryFns[4] = function() {
                return prepResults[2].exec([Math.round(notSoRandom()*2)]);
            };

            var qs = [];
            for(var i=0; i<1000; ++i) {
                var fnIndex = Math.round(notSoRandom()*(queryFns.length-1));
                qs.push(queryFns[fnIndex]());
            }
            return Q.all(qs);
        });

        return query.should.not.be.rejected;
    });

    it("should be created automatically when query params are given", function() {
        var query = conn.query(
            "INSERT INTO foo VALUES (?, ?, ?)",
            [8, 8.8, "8.8.8"]
        ).then(function() {
            return conn.query(
                "INSERT INTO foo VALUES (?, ?, ?)",
                [9, 9.9, "9.9.9"]
            );
        }).then(function() {
            return conn.query(
                "SELECT * FROM foo WHERE d > ?",
                [5]
            );
        });

        return shouldHaveValidResult(query, 2, 3, ["d", "e", "f"])
            .should.eventually.have.property("data")
            .that.deep.equals([
                [8, 8.8, "8.8.8"],
                [9, 9.9, "9.9.9"]
            ]);
    });

    it("should generate pretty results when requested", function() {
        var query = conn.query(
            "INSERT INTO foo VALUES (42,4.2,'42'),(43,4.3,'43'),(44,4.4,'44'),(45,4.5,'45')"
        ).then(function() {
            return conn.query("SELECT * FROM foo WHERE d > ?", [42], true);
        });

        return shouldHaveValidResult(query, 3, 3, ["d", "e", "f"])
            .should.eventually.have.property("data")
            .that.deep.equals([
                {d: 43, e: 4.3, f: "43"},
                {d: 44, e: 4.4, f: "44"},
                {d: 45, e: 4.5, f: "45"}
            ]);
    });

    it("should fail when too few params are given", function() {
            return conn.query("INSERT INTO foo VALUES (?, ?, ?)", [2])
                .should.be.rejected;
    });

    it("should fail when too many params are given", function() {
        return conn.query("INSERT INTO foo VALUES (?, ?, ?)", [2, 4.5, "s", 2])
            .should.be.rejected;
    });

    it("should fail when too few question marks are in the query", function() {
        return conn.query("INSERT INTO foo VALUES (?, ?)", [2, 4.5, "s"])
            .should.be.rejected;
    });

    it("should fail when too many question marks are in the query", function() {
        return conn.query("INSERT INTO foo VALUES (?, ?, ?, ?)", [2, 4.5, "s"])
            .should.be.rejected;
    });
});
