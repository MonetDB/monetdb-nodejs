# Major changes since v0.\*

[![Build Status](https://travis-ci.org/MonetDB/monetdb-nodejs.svg)](https://travis-ci.org/MonetDB/monetdb-nodejs)
[![Coverage Status](https://coveralls.io/repos/MonetDB/monetdb-nodejs/badge.svg?branch=master&service=github)](https://coveralls.io/github/MonetDB/monetdb-nodejs?branch=master)
[![npm version](https://badge.fury.io/js/monetdb.svg)](https://badge.fury.io/js/monetdb)
[![Dependency Status](https://david-dm.org/MonetDB/monetdb-nodejs.svg)](https://david-dm.org/MonetDB/monetdb-nodejs)


### Our interface is now promise based
In version 0.\*, all asynchronous methods were callback based. 
We did provide a wrapper for Q fans, but the focus was not on promises.
This has changed. 
Our interface is now fully promise based, meaning all asynchronous methods return promises.
For backwards compatibility, we provide a [callback based wrapper](#callbackwrapper], that adheres as much as possible to the old API.


### Global and local options
In version 0.\*, you could provide one options object when creating a new connection. Now you can provide
options to the result of the require('monetdb') call, which are considered to be the global options applied to all
connections you make. Then, on creating a connection you can again pass options specific to this connection.
And there are some options that you can change after you created a connection.
See [the options section](https://github.com/MonetDB/monetdb-nodejs/#options) for all possible options.


### Reconnect logic has been added
A connection from version 0.\* failed on a socket error or a socket close, leaving it up to the caller to create
a new connection. This is integrated into v1.\*, allowing you to specify how many times we should try to reconnect
and with what timeout intervals.
See [the reconnect section](https://github.com/MonetDB/monetdb-nodejs/#reconnect) for more details.


### Prettified result objects can be returned
In version 0.\*, an array of arrays is returned as the result set of a SELECT query. 
This is still the default behavior, but upon request you can now receive an array of objects, where the column names
are used as the object keys.
See [the pretty result section](https://github.com/MonetDB/monetdb-nodejs/#pretty) for more info.   


### No internal information is exposed anymore
Version 0.\* allowed access to all internal variables, like the socket and the connection state. 
Fiddling with these variables could cause unexpected behavior, and therfore we removed this possibility.
For normal usage, a [MonetDBConnection object](https://github.com/MonetDB/monetdb-nodejs/#mdbconnection) should offer plenty of possibilities.
For advanced usage, like firing raw queries against the database, you can directly access the 
[MapiConnection object](https://github.com/MonetDB/monetdb-nodejs/blob/master/docs/MapiConnection.md)
from a [MonetDBConnection object](https://github.com/MonetDB/monetdb-nodejs/#mdbconnection).

<a name="raw"></a>
### Raw queries are not directly possible anymore
Version 0.\* allowed the execution of raw queries by adding the boolean value 'true' to a query call. 
**This now has another effect**.
Providing a boolean value to a query call influences whether or not the query result will be prettified or not.
See [the section on pretty results](https://github.com/MonetDB/monetdb-nodejs/#pretty) for more information.
If you want to execute raw queries, you need to do a request to the
[MapiConnection object](https://github.com/MonetDB/monetdb-nodejs/blob/master/docs/MapiConnection.md) object that is
contained within every MonetDBConnection object:

```javascript
var MDB = require('monetdb')();

var conn = new MDB(options);
conn.connect();
conn.mapiConnection.request('Xreply_size -1')
```

Note: if you do not know what raw queries (like the above example) are, you will probably not need them. You can stick to
using normal SQL queries.

### Timezone is set automatically
From version 1.\*, the timezone of every connection will be set automatically to the timezone of the system on which the
MonetDB NodeJS module is run. This behavior can be overwritten by providing the right options. See
[the timezone section](https://github.com/MonetDB/monetdb-nodejs/#timezone) for more information.

<a name="env"></a>
### Connection environment is not loaded automatically anymore
Version 0.\* automatically loaded the connection environment (result of query 'SELECT * FROM sys.env()') into every 
connection object. In version 1.\* this does not happen anymore. If you want to easily access it, use the
[MonetDBConnection.env method](https://github.com/MonetDB/monetdb-nodejs/#mdbconnection_env)

### Null values now map directly from database to Javascript
Version 0.\* mapped NULL values in query results to the Javascript keyword undefined. Version 1.\* maps NULL values
directly to Javascript null keywords.

### Continuous integration has been set up
To guarantee continuity, we now use Travis-CI to automatically test all of the code. 
When the tests pass, we compute the coverage and upload this to Coveralls.
To show the current build status and testing coverage, we added appropriate badges to the top of the documentation pages.





<a name="callbackwrapper"></a>
# Backward compatibility
All asynchronous methods of the [MonetDBConnection object](https://github.com/MonetDB/monetdb-nodejs/#mdbconnection) return promises.
To provide backward compatibility with version 0.\*, where asynchronous methods were callback based (and chainable),
we created a wrapper that mimics the behavior of v0.\*. Example:

```javascript
var MDB = require('monetdb')();

// Instantiate connection object and get its wrapper
var conn = new MDB({dbname: 'mydb'}).getCallbackWrapper();

conn.connect(function(err) {
    if(err) {
        console.log('Connection error: ' + err);
        return;
    }
    console.log('Connection succeeded!');
});

// Chain queries (not possible with promise based API)
conn.query('SELECT something FROM sometable', function(err, result) {
    if(err) {
        // something went wrong, handle query error here
        return;
    }
    // do something with query result
    
}).query('SELECT something_else FROM sometable', function(err, result) {
    if(err) {
        // something went wrong, handle query error here
        return;
    }
    // do something with query result
});
```

Note that you could also use the promise based API and the callback based API interchangeably for the same connection:

```javascript
var MDB = require('monetdb')();

// Instantiate connection object
var conn = new MDB({dbname: 'mydb'});

// Store its wrapper in another variable
var connWrapped = conn.getCallbackWrapper();

// Connect using promises
conn.connect().then(function() {
    console.log('Connection succeeded!')
});

// Query using callbacks
connWrapped.query('SELECT * FROM foo', function(err, result) {
    ...
});
```

You can however safely throw away the promise based object. All methods described for the [MonetDBConnection object](https://github.com/MonetDB/monetdb-nodejs/#mdbconnection)
are also available on the wrapper. All promise returning functions become callback based, and all others are exactly the same.


# Upgrade instructions
Upgrading from v0.\* to v1.\* should be easy. For minimal work, here are some hints:

1. Replace *var mdb = require('monetdb')* with *var MDB = require('monetdb')()*
If you want, you can even pass default options: *var MDB = require('monetdb')(options)*
2. Look for usages of .connect() in your code
    - If you used callback functions, replace *conn = mdb.connect()* with 
    *conn = new MDB(options).getCallbackWrapper(); conn.connect();*.
    You can then keep on using callback based functionality and query chaining as you did.
    - If you already used the promise wrapper, you can replace *conn = mdb.connect()* with
    *conn = new MDB(options); conn.connect();*
3. If you used the promise wrapper, remove the trailing Q from the calls to functions 
   connectQ, requestQ, queryQ, prepareQ, closeQ, and disconnectQ.
4. Check all your calls to the query and request methods and see if you ever provide the boolean
value 'true' as a last argument. Those calls execute a raw query. See [here](#raw) for how to do 
raw queries in v1.\*.
5. See if you use [attributes from the connection environment](#env) in your code. 
If you do, fetch them using the 
[MonetDBConnection.env](https://github.com/MonetDB/monetdb-nodejs#mdbconnection_env) method instead.
