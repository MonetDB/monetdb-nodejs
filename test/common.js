
var Q = require("q");
const mdb = require("../index.js");

let seed = 1;

module.exports =  {
    getMDB(opts = {warnings: false, dbname: "test"}) {
        return mdb(opts);
    },

    notSoRandom() {
        var x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    },

    shouldHaveValidResult(query, nrRows, nrCols, colNames) {
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
};


