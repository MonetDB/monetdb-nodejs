var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
var Q = require("q");

var should = chai.should();
chai.use(chaiAsPromised);

var mdb = require("../index.js");

function noop() {}

function getMDB() {
    return mdb({warnings: false, dbname: "test"});
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

function constructCurTimezoneStr() {
    var tzOffset = new Date().getTimezoneOffset();
    var negative = tzOffset < 0;
    if(negative) tzOffset = -tzOffset;
    var tzOffsetHours = Math.floor(tzOffset / 60);
    var tzOffsetMinutes = parseInt(tzOffset % 60);
    var tzOffsetHoursStr = (tzOffsetHours < 10 ? "0" : "") + tzOffsetHours;
    var tzOffsetMinutesStr = (tzOffsetMinutes < 10 ? "0" : "") + tzOffsetMinutes;
    return (negative ? "-" : "+") + tzOffsetHoursStr + ":" + tzOffsetMinutesStr;
}

describe("#Options", function() {
    describe("##Global/Local options", function() {
        it("should throw exception when global option has wrong type", function () {
            (function () {
                mdb({dbname: 2, warnings: false});
            }).should.throw(Error);
        });

        it("should throw exception when local option has wrong type", function () {
            (function () {
                new (mdb({warnings: false}))({dbname: 2});
            }).should.throw(Error);
        });

        it("should not throw exception when global required options are missing", function () {
            (function () {
                mdb({warnings: false});
            }).should.not.throw(Error);
        });

        it("should throw exception when local required option is missing", function () {
            (function () {
                new (mdb({warnings: false}))();
            }).should.throw(Error);
        });

        it("should not throw exception when local required option was given globally", function () {
            (function () {
                new (mdb({dbname: "test", warnings: false}))();
            }).should.not.throw(Error);
        });

        it("should use default if both global and local are not given", function () {
            new (mdb({dbname: "test", warnings: false}))()
                .option("user").should.equal("monetdb");
        });

        it("should use global if global is given but local isn't", function () {
            new (mdb({dbname: "test", warnings: false, user: "custom"}))()
                .option("user").should.equal("custom");
        });

        it("should use local if both global and local are given", function () {
            new (mdb({dbname: "test", warnings: false, user: "custom"}))({user: "other"})
                .option("user").should.equal("other");
        });

        it("should use local if only local is given", function () {
            new (mdb({dbname: "test", warnings: false}))({user: "other"})
                .option("user").should.equal("other");
        });
    });

    describe("##MonetDBConnection.option", function() {
        var conn = new (mdb({dbname: "test", warnings: false}))();
        it("should throw exception on getting unknown option", function () {
            (function () {
                conn.option("veryinvalidoption");
            }).should.throw(Error);
        });

        it("should throw exception on setting unknown option", function () {
            (function () {
                conn.option("veryinvalidoption", "value");
            }).should.throw(Error);
        });

        it("should properly get option", function () {
            conn.option("dbname").should.equal("test");
        });

        it("should throw exception on setting unchangeable option", function() {
            (function () {
                conn.option("dbname", "otherdb");
            }).should.throw(Error);
        });

        it("should throw exception on setting option with wrong type", function() {
            (function () {
                conn.option("maxReconnects", "whatever");
            }).should.throw(Error);
        });

        it("should properly set option", function() {
            conn.option("reconnectTimeout", 5000);
            conn.option("reconnectTimeout").should.equal(5000);
        });
    });
});

describe("#Logging", function() {
    this.timeout(10000);

    var calls;
    function increaseCalls() { ++calls; }

    it("should give warning for unrecognized options when debug is set to true", function() {
        calls = 0;
        new (mdb({warningFn: increaseCalls}))({dbname: "test", hopefullyNotAnOption: 1});
        return calls.should.be.above(0);
    });

    it("should be done at least once for debug messages during connect", function() {
        calls = 0;
        var conn = new (mdb({dbname: "test", logger: increaseCalls, warnings: false, debug: true}))();
        return conn.connect().fin(function() {
            calls.should.be.above(0);
        });
    });

    it("should be done at least once for debugMapi messages during connect", function() {
        calls = 0;
        var conn = new (mdb({dbname: "test", logger: increaseCalls, warnings: false, debugMapi: true}))();
        return conn.connect().fin(function() {
            calls.should.be.above(0);
        });
    });

    it("should be done at least once for debugRequests messages during connect", function() {
        calls = 0;
        var conn = new (mdb({dbname: "test", logger: increaseCalls, warnings: false, debugRequests: true}))();
        return conn.connect().fin(function() {
            calls.should.be.above(0);
        });
    });

    it("should be done at least once for debugRequests messages on failing query", function() {
        var conn = new (mdb({dbname: "test", logger: increaseCalls, warnings: false, debugRequests: true}))();
        return conn.connect().then(function() {
            calls = 0;
            return conn.query("WILL NOT PASS");
        }).catch(function() {
            calls.should.be.above(0);
        });
    });

    it("should give warning when queries are issued before a call to connect", function() {
        calls = 0;
        var conn = new (mdb({warningFn: increaseCalls}))({dbname: "test"});
        conn.query("SELECT 42");
        conn.connect();
        return calls.should.be.above(0);
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

    it("should finish all its queries when closed", function() {
        var conn = new MDB();
        conn.connect();

        var qs = [
            conn.query("SELECT 1"),
            conn.query("SELECT 2"),
            conn.query("SELECT 3")
        ];

        conn.close();
        return Q.all(qs);
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

    it("should have the appropriate state at all times", function() {
        var conn = new MDB();
        conn.getState().should.equal("disconnected");
        return conn.connect().then(function() {
            conn.getState().should.equal("ready");
            return conn.close();
        }).then(function() {
            conn.getState().should.equal("destroyed");
        });
    });

    it("should properly start queries after some idle time after connect", function() {
        var conn = new MDB();
        conn.connect();
        var deferred = Q.defer();
        setTimeout(function() {
            conn.query("SELECT 42").then(function() {
                deferred.resolve();
            }, function(err) {
                deferred.reject(err);
            });
        }, 5000);
        return deferred.promise;
    });

    it("should give its appropriate environment on request", function() {
        var conn = new MDB();
        conn.connect();
        return conn.env()
            .should.eventually.be.an("object")
            .that.has.property("monet_version")
            .that.is.a("string");
    });

    it("should fail on non existing defaultSchema", function() {
        var conn = new MDB({defaultSchema: "non_existant"});
        return conn.connect().should.be.rejected;
    });

    it("should pass on existing defaultSchema", function() {
        var conn1 = new MDB();
        var conn2 = new MDB({defaultSchema: "some_schema"});
        conns.push(conn1);
        conns.push(conn2);
        conn1.connect();
        return conn1.query("START TRANSACTION; " +
            "CREATE SCHEMA some_schema; " +
            "SET SCHEMA some_schema; " +
            "CREATE TABLE a (a INT); " +
            "INSERT INTO a VALUES (1); " +
            "COMMIT;").then(function() {
            return conn2.connect();
        }).then(function() {
            return conn2.query("SELECT * FROM a");
        }).should.eventually.have.property("rows", 1);
    });

    it("should have the right aliases", function() {
        var conn = new MDB();
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
        var query = conn.connect().then(function() {
            conn.mapiConnection.socketError("ECONNRESET");
            return conn.query("SELECT 'whatever' AS a");
        });

        return shouldHaveValidResult(query, 1, 1, ["a"])
            .should.eventually.have.property("data")
            .that.deep.equals([["whatever"]]);
    });

    it("should finish many queries when reconnects occur in between", function() {
        this.timeout(300000);

        var conn = new MDB({testing: true});
        return conn.connect().then(function() {
            var qs = [];
            for(var i=0; i<1000; ++i) {
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
            return Q.all(qs).fin(function() {
                if(timeout !== null) clearTimeout(timeout);
            });
        });
    });

    it("should give up and fail queries after reaching its limits", function() {
        var conn = new MDB({testing: true, maxReconnects: 2, reconnectTimeout: 1, debug: true, logger: noop});
        return conn.connect().then(function() {
            var qs = [
                conn.query("SELECT 1").should.be.rejected,
                conn.query("SELECT 2").should.be.rejected,
                conn.query("SELECT 3").should.be.rejected
            ];
            try {
                conn.mapiConnection.socketError("ECONNRESET", true);
            } catch(e) {}
            return Q.all(qs);
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

    it("should properly rebuild stored JSON", function() {
        var json = {a: 9, b: {c: 's'}, c: [1,2,3,{a: 1}]};
        var query = conn.query("CREATE TABLE foo (a JSON)").then(function() {
            return conn.query("INSERT INTO foo VALUES ('" + JSON.stringify(json) + "')");
        }).then(function() {
            return conn.query("SELECT * FROM foo");
        });
        return shouldHaveValidResult(query, 1, 1, ["a"])
            .should.eventually.have.property("data")
            .that.deep.equals([[json]]);
    });

    it("should fail when trying to insert invalid JSON", function() {
        return conn.query("CREATE TABLE foo (a JSON)").then(function() {
            return conn.query("INSERT INTO foo VALUES ('{someInvalidJSON')");
        }).should.be.rejected;
    });

    it("should properly convert booleans", function() {
        var query = conn.query("CREATE TABLE foo (a BOOLEAN, b BOOLEAN)").then(function() {
            return conn.query("INSERT INTO foo VALUES (true, false)");
        }).then(function() {
            return conn.query("SELECT * FROM foo");
        });

        return shouldHaveValidResult(query, 1, 2, ["a", "b"])
            .should.eventually.have.property("data")
            .that.deep.equals([[true, false]]);
    });

    it("should properly handle NULL values", function() {
        var query = conn.query("CREATE TABLE foo (a INT)").then(function() {
            return conn.query("INSERT INTO foo VALUES (NULL)");
        }).then(function() {
            return conn.query("SELECT * FROM foo");
        });

        return shouldHaveValidResult(query, 1, 1, ["a"])
            .should.eventually.have.property("data")
            .that.deep.equals([[null]]);
    });
});

describe("#Time zone offset", function() {
    var baseTimestamp = "2015-10-29 11:31:35.000000";
    var MDB = getMDB();

    function setupConnection(timezoneOffset) {
        var conn = timezoneOffset !== undefined ? new MDB({timezoneOffset: timezoneOffset}) : new MDB();
        conn.connect();
        conn.query("START TRANSACTION; CREATE TABLE foo (a TIMESTAMPTZ)");
        return conn;
    }

    function closeConnection(conn) {
        conn.query("ROLLBACK");
        conn.destroy();
    }

    function testTimezoneOffset(timezoneOffset, timestampIn, timestampOut) {
        if(!timestampOut) timestampOut = timestampIn;
        var conn = setupConnection(timezoneOffset);
        return conn.query("INSERT INTO foo VALUES ('" + timestampIn + "')").then(function() {
            return conn.query("SELECT * FROM foo");
        }).fin(function() {
            closeConnection(conn);
        }).should.eventually.have.property("data")
            .that.deep.equals([[timestampOut]]);
    }

    it("should be automatically set to the current time zone", function() {
        var timestampCurTz = baseTimestamp + constructCurTimezoneStr();
        return testTimezoneOffset(undefined, timestampCurTz);
    });

    it("should be customizable", function() {
        var offset2 = 120;
        var offset1030 = 630;
        var timestampPlus2 = baseTimestamp + "+02:00";
        var timestampMinus2 = baseTimestamp + "-02:00";
        var timestampPlus1030 = baseTimestamp + "+10:30";
        var timestampMinus1030 = baseTimestamp + "-10:30";
        return Q.all([
            testTimezoneOffset(offset2, timestampPlus2),
            testTimezoneOffset(-offset2, timestampMinus2),
            testTimezoneOffset(offset1030, timestampPlus1030),
            testTimezoneOffset(-offset1030, timestampMinus1030)
        ]);
    });

    it("should work cross-timezone", function() {
        // connection works on timezone +01:00, we give it a timestamp in timezone -01:30
        // we expect it to convert it to +01:00, hence adding +02:30 to its time.
        var timestampIn = baseTimestamp + "-01:30";
        var timestampOut = "2015-10-29 14:01:35.000000+01:00";
        return testTimezoneOffset(60, timestampIn, timestampOut);
    });
});

describe("#Prepared queries", function() {
    this.timeout(10000);

    var MDB = getMDB();
    var conn = new MDB();
    conn.connect();

    beforeEach("Starting transaction", function() {
        conn.option("prettyResult", false);
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

    it("should generate pretty results when requested implicitly through query params", function() {
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

    it("should generate pretty results when requested explicitly through prepare function", function() {
        var query = conn.query(
            "INSERT INTO foo VALUES (42,4.2,'42'),(43,4.3,'43'),(44,4.4,'44'),(45,4.5,'45')"
        ).then(function() {
            return conn.prepare("SELECT * FROM foo WHERE d > ?", true);
        }).then(function(prepResult) {
            return prepResult.exec([42]);
        });

        return shouldHaveValidResult(query, 3, 3, ["d", "e", "f"])
            .should.eventually.have.property("data")
            .that.deep.equals([
                {d: 43, e: 4.3, f: "43"},
                {d: 44, e: 4.4, f: "44"},
                {d: 45, e: 4.5, f: "45"}
            ]);
    });

    it("should generate pretty results in .query when pretty option is set", function() {
        conn.option("prettyResult", true);
        var query = conn.query(
            "INSERT INTO foo VALUES (42,4.2,'42'),(43,4.3,'43'),(44,4.4,'44'),(45,4.5,'45')"
        ).then(function() {
            return conn.query("SELECT * FROM foo WHERE d > ?", [42]);
        });

        return shouldHaveValidResult(query, 3, 3, ["d", "e", "f"])
            .should.eventually.have.property("data")
            .that.deep.equals([
                {d: 43, e: 4.3, f: "43"},
                {d: 44, e: 4.4, f: "44"},
                {d: 45, e: 4.5, f: "45"}
            ]);
    });

    it("should properly handle json parameters", function() {
        var json = {a: 9, b: {c: 's'}, c: [1,2,3,{a: 1}]};
        var query = conn.query("CREATE TABLE bar (a JSON)").then(function() {
            return conn.query("INSERT INTO bar VALUES (?)", [json]);
        }).then(function() {
            return conn.query("SELECT * FROM bar");
        });

        return shouldHaveValidResult(query, 1, 1, ["a"])
            .should.eventually.have.property("data")
            .that.deep.equals([[json]]);
    });

    it("should properly handle boolean parameters", function() {
        var query = conn.query("CREATE TABLE bar (a BOOLEAN, b BOOLEAN)").then(function() {
            return conn.query("INSERT INTO bar VALUES (?, ?)", [true, false]);
        }).then(function() {
            return conn.query("SELECT * FROM bar");
        });

        return shouldHaveValidResult(query, 1, 2, ["a", "b"])
            .should.eventually.have.property("data")
            .that.deep.equals([[true, false]]);
    });

    it("should properly handle null parameters", function() {
        var query = conn.query("CREATE TABLE bar (a INT)").then(function() {
            return conn.query("INSERT INTO bar VALUES (?)", [null]);
        }).then(function() {
            return conn.query("SELECT * FROM bar");
        });

        return shouldHaveValidResult(query, 1, 1, ["a"])
            .should.eventually.have.property("data")
            .that.deep.equals([[null]]);
    });

    it("should properly handle timestamp, timestamptz, date, and uuid", function() {

        var vals = [
            "2015-10-29 11:31:35.000000",
            "2015-10-29 11:31:35.000000" + constructCurTimezoneStr(),
            "2015-10-29",
            "422cb031-6329-3b4f-0247-e261db574da6"
        ];
        var query = conn.query("CREATE TABLE bar (a TIMESTAMP, b TIMESTAMPTZ, c DATE, d UUID)").then(function() {
            return conn.query("INSERT INTO bar VALUES (?, ?, ?, ?)", vals);
        }).then(function() {
            return conn.query("SELECT * FROM bar");
        });

        return shouldHaveValidResult(query, 1, 4, ["a", "b", "c", "d"])
            .should.eventually.have.property("data")
            .that.deep.equals([vals]);
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

describe("#CallbackWrapper", function() {
    var MDB = getMDB();

    it("should wrap MonetDBConnection.connect", function(done) {
        var conn1 = new MDB().getCallbackWrapper();
        conn1.connect(function(err) {
            try {
                should.not.exist(err);
            } catch(e) {
                conn1.destroy();
                return done(e);
            }
            var conn2 = new MDB({dbname: "nonexistent"}).getCallbackWrapper();
            conn2.connect(function(err) {
                try {
                    should.exist(err);
                    done();
                } catch(e) {
                    done(e);
                }
                conn1.destroy();
                conn2.destroy();
            })
        });
    });

    it("should wrap succeeding MonetDBConnection.query and .request", function(done) {
        var conn = new MDB().getCallbackWrapper();
        conn.connect();
        conn.query("SELECT 425", function(err, result) {
            try {
                should.not.exist(err);
                result.should.have.property("data").that.deep.equals([[425]]);
                done();
            } catch(e) {
                done(e);
            }
            conn.destroy();
        });
    });

    it("should wrap failing MonetDBConnection.query and .request", function(done) {
        var conn = new MDB().getCallbackWrapper();
        conn.connect();
        conn.query("SELECT will_not_work", function(err) {
            try {
                should.exist(err);
                done();
            } catch(e) {
                done(e);
            }
            conn.destroy();
        });
    });

    it("should wrap MonetDBConnection.prepare", function(done) {
        var conn = new MDB().getCallbackWrapper();
        conn.connect();
        conn.prepare("SELECT * FROM sys.tables WHERE id > ?", function(err, prepResult) {
            try {
                should.not.exist(err);
                prepResult.should.have.property("prepare").that.is.an("object");
                prepResult.should.have.property("exec").that.is.a("function");
                prepResult.should.have.property("release").that.is.a("function");
            } catch(e) {
                conn.destroy();
                return done(e);
            }
            prepResult.exec([1], function(err, result) {
                try {
                    should.not.exist(err);
                    result.should.have.property("rows").that.is.above(0);
                } catch(e) {
                    conn.destroy();
                    return done(e);
                }
                prepResult.exec(["fail"], function(err) {
                    try {
                        should.exist(err);
                        prepResult.release();
                        done();
                    } catch(e) {
                        conn.destroy();
                        done(e);
                    }
                });
            })
        });
    });

    it("should wrap MonetDBConnection.env", function(done) {
        var conn = new MDB().getCallbackWrapper();
        conn.connect();
        return conn.env(function(err, result) {
            try {
                should.not.exist(err);
                result.should.be.an("object").that.has.property("monet_version").that.is.a("string");
                done();
            } catch(e) {
                done(e);
            }
            conn.destroy();
        });
    });

    it("should wrap MonetDBConnection.close", function(done) {
        var conn = new MDB().getCallbackWrapper();;
        conn.connect();
        conn.close(function(err) {
            try {
                should.not.exist(err);
                done();
            } catch(e) {
                done(e);
            }
            conn.destroy();
        });
    });

    it("should enable chaining on all callback based methods", function() {
        var conn = new MDB().getCallbackWrapper();
        ["connect", "query", "env", "close", "prepare"].forEach(function(chainMethod) {
            conn[chainMethod]().should.equal(conn);
        });
    });

    it("should simply link MonetDBConnection.option, .getState, and .destroy", function() {
        var conn = new MDB();
        var wrapper = conn.getCallbackWrapper();
        ["option", "getState", "destroy"].forEach(function(method) {
            conn[method].should.equal(wrapper[method]);
        });
    });

    it("should have the right aliases", function() {
        var conn = new MDB().getCallbackWrapper();
        conn.open.should.equal(conn.connect);
        conn.request.should.equal(conn.query);
        conn.disconnect.should.equal(conn.close);
    });
});
