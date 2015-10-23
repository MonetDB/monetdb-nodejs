var MDB = require("../index.js")();


var conn = new MDB({dbname: "blaeu", maxReconnects: 10, debug: true, debugMapi: false, debugRequests: false});

conn.connect().then(function() {
    console.log("Connected!");
}, function(err) {
    console.log("Connection failed: " + err);
});

conn.env().then(function(env) {
    console.log('Received env: ' + JSON.stringify(env, null, "\t"));
}, function(err) { console.log('Could not get env: ' + err)});

conn.query("SELECT * FROM sys.functions WHERE name LIKE \'%bam%\'", true).then(function(result) {
    console.log("Received functions: " + JSON.stringify(result.data, null, "\t"));
}, function(err) {
    console.log(err);
});


exports.f = function() {
    // Note: Exec function of prepared statement executes at some later point, when the message
    // queue might have already cleared out. Hence, when conn.close is called, when only the prepare
    // statement is in the queue, the connection will be closed after this statement and the exec
    // function will fail.
    conn.query("SELECT * FROM sys.functions WHERE name = ?", ["bam_export"]).then(function(result) {
        console.log("Received function: " + JSON.stringify(result.data, null, "\t"));
    }, function(err) { console.log(err); });
};

//var connOld = mdbOld.connect({dbname: "blaeu", debug: true});

/*exports.q = function() {
    conn.query("SELECT * FROM dashboard.\"user\"", function(err, data) {
        console.log(err);
        console.log(JSON.stringify(data, null, "\t"));
    });
};*/
