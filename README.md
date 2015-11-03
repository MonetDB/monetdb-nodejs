# MonetDB NodeJS connector version 1.\*

[![Build Status](https://travis-ci.org/MonetDB/monetdb-nodejs.svg)](https://travis-ci.org/MonetDB/monetdb-nodejs)
[![Coverage Status](https://coveralls.io/repos/MonetDB/monetdb-nodejs/badge.svg?branch=master&service=github)](https://coveralls.io/github/MonetDB/monetdb-nodejs?branch=master)
[![npm version](https://badge.fury.io/js/monetdb.svg)](https://badge.fury.io/js/monetdb)
[![Dependency Status](https://david-dm.org/MonetDB/monetdb-nodejs.svg)](https://david-dm.org/MonetDB/monetdb-nodejs)


This NodeJS module provides an easy and powerful way to use MonetDB inside your NodeJS programs.


For version 0.\* users:
* **[Click here for documentation of version 0.\*](https://github.com/MonetDB/monetdb-nodejs/blob/master/docs/README.v0.md)**
* **[Click here for update notes, including new features, backward compatibility notes, and upgrade instructions](https://github.com/MonetDB/monetdb-nodejs/blob/master/docs/v1-notes.md)**


<a name="example"></a>
## Example usage

```javascript
var MDB = require('monetdb')();

var options = {
	host     : 'localhost', 
	port     : 50000, 
	dbname   : 'mydb', 
	user     : 'monetdb', 
	password : 'monetdb'
};

var conn = new MDB(options);
conn.connect();

conn.query('SELECT * FROM mytable').then(function(result) {
    // Do something with the result
});

conn.close();
```



<a name="options"></a>
# Options
There are three flavors of setting options:
1. providing global options
2. providing local options
3. changing local options

Let's look at how we could use these flavors to setup connections for multiple users:

```javascript
// We set the global option 'dbname' to 'db', for all connections
var MDB = require('monetdb')({dbname: 'db'});

// We can now create two connections for different users
// Both connections will use the globally set 'dbname' option
var conn1 = new MDB({user: 'foo', password: 'bar'});
var conn2 = new MDB({user: 'dumb', password: '0000'});

// Now let's change a local option of conn1 
// (which is only possible for non-connection specific options)
conn1.option("setMaxReconnects", 1);
```

In general, the order in which options are consider is:
1. local
2. global
3. default (if available)

The MonetDB NodeJS module recognizes many options.
You do not need to know them all. 
There is **only one** option that does not have a default value, and that is the database name (dbname).

The available options can be subdivided into several categories:


### Connection options
These options are used to make the actual connection to MonetDB. Note that these options can not be changed with the
[MonetDBConnection.option](#mdbconnection_option) method.
If you want to change these settings on an open connection, just construct a new connection.

| Option            | Type      | Default                         | Additional description |
| :---------------- | :-------- | :------------------------------ | :--------------------- |
| host              | string    | localhost                       |
| port              | integer   | 50000                           |
| dbname            | string    |                                 | No default value for this one.
| user              | string    | monetdb                         |
| password          | string    | monetdb                         |
| language          | string    | sql                             | The language of the issued queries. Should be one of sql/mal.
| defaultSchema     | string    | sys                             | The default schema to set the connection to after connecting.
| timezoneOffset    | integer   | offset of current timezone      | The offset in minutes that holds for the required timezone. See [connection timezone](#timezone) for more info.


### Reconnection options
These options are used to determine how to reconnect whenever a connection fails.

| Option            | Type      | Default                         | Additional description |
| :----------       | :-------- | :------------------------------ | :--------------------- |
| maxReconnects     | integer   | 10                              | The maximum number of reconnect attempts after a connection failure. Set to 0 if you do not want to reconnect on connection failures.
| reconnectTimeout  | integer   | 2000                            | The timeout used in between reconnect attempts.


### Query options
These options influence the way queries are executed.

| Option            | Type      | Default                         | Additional description |
| :---------------- | :-------- | :------------------------------ | :--------------------- |
| prettyResult      | boolean   | false                           | The value for this option will be the default value for how query results are returned. This can be overwritten on a per-query basis. See [pretty results](#pretty) for more info.
                                                                                          
### Logging
The MonetDB NodeJS module comes with a very extensive logging functionality. It distinguishes between many types of different
messages, and allows you to fully customize the way the MonetDB NodeJS module deals with log messages when they occur.
See the [logging section](#logging) for more information.

| Option            | Type      | Default                         | Additional description |
| :---------------- | :-------- | :------------------------------ | :--------------------- |
| logger            | function  | console.log                     | This function will be used by all of the default logging functions.
| warnings          | boolean   | true                            | Whether or not to log warnings. **It is highly adviced to keep this set to true, otherwise you will not be notified on e.g. unrecognized options or reconnection attempts.**
| warningFn         | function  | See [logging section](#logging) | Warning messages will be passed to this function when they occur.
| debug             | boolean   | false                           | Whether or not to log general debug messages.
| debugFn           | function  | See [logging section](#logging) | Debug messages will be passed to this function when they occur.
| debugRequests     | boolean   | false                           | Whether or not to log requests (SQL or MAL) when they resolve.
| debugRequestFn    | function  | See [logging section](#logging) | SQL or MAL requests, including their results, will be passed to this function when they occur.
| debugMapi         | boolean   | false                           | Whether or not to show the Mapi messages that are being sent back and forth between the MonetDB NodeJS module and the MonetDB server.
| debugMapiFn       | function  | See [logging section](#logging) | Mapi messages will be passed to this function when they occur.



### Testing
Options provided solely for testing.

| Option            | Type      | Default                         | Additional description |
| :---------------- | :-------- | :------------------------------ | :--------------------- |
| testing           | boolean   | false                           | When set to true, some additional (undocumented) methods will be exposed, e.g. to simulate socket failures.







<a name="mdbconnection"></a>
# MonetDBConnection

Getting a MonetDBConnection object is easy:

```javascript
var MDB = require('monetdb')();

// MDB is a constructor function; let's construct a MonetDBConnection object, shall we?
var conn = new MDB({dbname: 'mydb'});

// conn now is a MonetDBConnection object
```

All of its exposed attributes and methods are listed here:


<a name="mdbconnection_constructor"></a>
### MonetDBConnection(\[options\])
Constructor for a MonetDBConnection object, that takes an optional options object. For possible options, see the 
[options section](#options).

Throws an error when the provided options object is not ok.



<a name="mdbconnection_mapiconnection"></a>
### .mapiConnection
Instance of MapiConnection. This attribute will be managed by the MonetDBConnection object, so in normal cases you should 
not use this. Only if you want to e.g. fire raw queries against the database, you might want to reference it directly. 
Just in case you are wondering, 
[here is the documentation](https://github.com/MonetDB/monetdb-nodejs/blob/master/docs/MapiConnection.md).



<a name="mdbconnection_connect"></a>
### .connect()
*This method links to [MapiConnection.connect](https://github.com/MonetDB/monetdb-nodejs/blob/master/docs/MapiConnection.md#connect)*

Open the connection to the MonetDB server.

Returns a promise that resolves when the connection succeeded, and gets rejected with an error message otherwise.
Note that you **do not have to wait** for the connection promise to be resolved before issueing queries, since incoming
queries will be properly cached.



### .open()
Alias for [MonetDBConnection.connect](#mdbconnection_connect).



<a name="mdbconnection_query"></a>
### .query(query, \[params\], \[prettyResult\])
Issue a query against the database. For a simple example, [see here](#example).

| Argument      | Type          | Required       | Description     |
| :------------ | :------------ | :------------- | :-------------- |
| query         | string        | yes            | The query you want to run. In case language is sql, this should be a valid SQL query.
| params        | array         | no             | If this array is given, a prepared statement will be used under the hood. Very useful if you want to easily protect against SQL injection.
| prettyResult  | boolean       | no             | If this is set to true, the query result will be prettified. If not given, the default from the options is used. See the [pretty result section](#pretty) for more info.
                                                   
Example of a query with parameters:
```javascript
var MDB = require('monetdb')();

var conn = new MDB({dbname: 'mydb'});
conn.connect();

conn.query(
    'SELECT * FROM mytable WHERE c < ? AND d > ?', 
    [40, 102]
).then(function(result) {
    // Do something with the result
});
```

Returns a promise that resolves with an object with the following properties:

| Property               | Type                   | Description     |
| :--------------------- | :--------------------- | :-------------- |
| data                   | array\[array\|object\] | If this is the result of a SELECT query, this property contains the resulting data returned by the database. Every array entry represents one row of the result set. If the 'prettyResult' option was set to true, every array entry will be an object, where the object properties equal the column names. Otherwise, the array entries will be arrays containing just the column values.
| col                    | object                 | Object maps column names to query result indices. So if you for example did SELECT a, b FROM ... you can access b in a tuple array by issuing tuple[result.col.b], which in this case would resolve to tuple[1].
| rows                   | integer                | The number of rows in the result set.
| cols                   | integer                | The number of columns in the result set.
| structure              | array\[object\]        | An array containing an object for every column, with column information.
| structure\[i\].table   | string                 | The name of the table to which column i belongs.
| structure\[i\].column  | string                 | The name of column i.
| structure\[i\].type    | string                 | The database type of column i.
| structure\[i\].typelen | integer                | The length in the database of column i.
| structure\[i\].index   | index                  | The array index of column i, which will equal i.
| queryid                | integer                | A unique identifier for this query.
| type                   | string                 | The type of the result (currently only 'table' is supported).


### .request(query, \[params\], \[prettyResult\])
Alias for [MonetDBConnection.query](#mdbconnection_query).



<a name="mdbconnection_prepare"></a>
### .prepare(query, \[prettyResult\])
Prepares a query for repeated execution, and generates execution and release convenience functions.

| Argument      | Type          | Required       | Description     |
| :------------ | :------------ | :------------- | :-------------- |
| query         | string        | yes            | The query that has to be prepared. If it does not start with prepare (case insensitive), 'PREPARE ' will be prepended to the query.
| prettyResult  | boolean       | no             | If this is set to true, the exec function will return prettified results. If not given, the default from the options is used. See the [pretty result section](#pretty) for more info.
                                                   
Returns a promise that resolves with an object with the following properties:

| Property               | Type         | Description     |
| :--------------------- | :----------- | :-------------- |
| prepare                | object       | The regular query result for the PREPARE statement, as is described under [MonetDBConnection.query](#mdbconnection_query).
| exec                   | function     | A function that executes the prepared statement. As its first and only argument, it takes an array of values. It returns a promise equivalent to the promise returned by [MonetDBConnection.query](#mdbconnection_query).
| release                | function     | A parameterless function that you can call when you want to free the resources used by the prepared statement. After calling this function, calls to the exec function will fail. This function **does not** return anything. You cannot be notified of whether or not this worked.

Example:

```javascript
var MDB = require('monetdb')();

var conn = new MDB({dbname: 'mydb'});
conn.connect();

conn.prepare('SELECT * FROM mytable WHERE c < ? AND d > ?').then(function(prepResult) {
    // execute query twice
    prepResult.exec([10, 5]).then(function(result) {
        // do something with the result
    });
    prepResult.exec([50, -20]).then(function(result) {
        // do something with the result
    });
    
    // we are done, release it (and do not wait for it, release method does not return a promise)
    prepResult.release();
});
```


<a name="mdbconnection_env"></a>
### .env()
Get the connection environment. Example:

```javascript
var MDB = require('monetdb')();

var conn = new MDB({dbname: 'mydb'});
conn.connect();

conn.env().then(function(env) {
    console.log(env);
});
```

Will output:

```
{
	"gdk_dbpath": "/home/robin/dbfarm/test",
	"gdk_debug": "0",
	"gdk_vmtrim": "no",
    ..
```


<a name="mdbconnection_option"></a>
### .option(name, [value])
Get or set an option.

| Argument      | Type                | Required       | Description     |
| :------------ | :------------------ | :------------- | :-------------- |
| name          | string              | yes            | The name of the option. See the [option section](#options) for the recognized options.
| value         | depending on option | no             | If this argument is provided, it is assumed that you want to set the option to this argument. Note that setting options is not possible for connection options. The connection options are mentioned in the [option section](#options).

Throws an error if either the provided option is not found, or if the provided value is invalid.

If the second argument is omitted, the value of the option is returned.


<a name="mdbconnection_getstate"></a>
### .getState()
*This method links to [MapiConnection.getState](https://github.com/MonetDB/monetdb-nodejs/blob/master/docs/MapiConnection.md#getstate)*

Get the current state of the connection. For normal usage you will never need to use this.

Returns one of the following state strings:

| State         | Meaning       |
| :------------ | :------------ |
| disconnected  | There is currently no open connection, either because it has never been opened yet, or because a reconnect is going on.
| connected     | There is an open connection to the server, but authentication has not finished yet.
| ready         | There is an open connection to the server, and we have successfully authenticated. The connection is ready to accept queries.
| destroyed     | The connection is destroyed, either because it was explicitly destroyed by a call to [MonetDBConnection.destroy](#mdbconnection_destroy), or because of a failure to keep the connection open.

Regardless of the return value of this method, you can safely issue queries to the connection, since they will be properly queued until the connection is ready.



<a name="mdbconnection_close"></a>
### .close()
*This method links to [MapiConnection.close](https://github.com/MonetDB/monetdb-nodejs/blob/master/docs/MapiConnection.md#close)*

Finishes all the current queries in the queue, and then destroys the socket by calling [MonetDBConnection.destroy](#mdbconnection_destroy).
After closing a connection, it cannot be reopened. If reopening is desired, you should create a [new MonetDBConnection object](#mdbconnection_constructor).

When queries are issued after calling close, they are still accepted and put into the queue, so a connection remains active
until it becomes idle.

Note that when you have issued a query with parameters, this will under the hood be executed in two steps (one prepare step
and one execution step). If the close method is called after firing a prepared statement, it might therefore fail because the 
socket can be destroyed after finishing the first step.

Returns a promise that resolves when all queries in the queue are done and the socket is destroyed.



### .disconnect()
Alias for [MonetDBConnection.close](#mdbconnection_close).



<a name="mdbconnection_destroy"></a>
### .destroy(\[msg\])
*This method links to [MapiConnection.destroy](https://github.com/MonetDB/monetdb-nodejs/blob/master/docs/MapiConnection.md#destroy)*

Fails all queries currently in the queue (including the one that is currently being executed), and destroys the socket.

| Argument      | Type                | Required       | Description     |
| :------------ | :------------------ | :------------- | :-------------- |
| msg           | string              | no             | An error message that will be sent to all queries that are rejected. If none is given, a default error message is sent. 


### .getCallbackWrapper()
This method is added for backward compatability. For information on how to use it, see 
[the updates page](https://github.com/MonetDB/monetdb-nodejs/blob/master/docs/update.md#callbackwrapper).



<a name="pretty"></a>
# Pretty query results
By default, every row in a query result is represented by an array. However, if the pretty flag is set, the query result
will instead be an array of objects, where every object has the column names as its properties. This makes using the result
a lot more intuitive and fault-tolerant (e.g. if you hard code indices into row arrays, your code might start failing 
when you change the SQL query).
The default value of the pretty flag can be overwritten by providing the global or local option 'prettyResult'. Even then,
you can override this default value on a per query basis, by providing a boolean value as last argument to either the 
[MonetDBConnection.query](#mdbconnection_query) or the [MonetDBConnection.prepare](#mdbconnection_prepare) function.
Example:

```javascript
var MDB = require('monetdb')();

var conn = new MDB({dbname: 'mydb'});
conn.connect();

// we did not set the option 'prettyResult', hence we will pass true to our queries to have them return prettified results.
conn.query("SELECT a, b FROM yourtable").then(function(result) {
    console.log(result.data);
});
```

Outputs (depending on the values of columnns a and b and the number of resulting tuples):
```
[
    { a: 'val1', b: 'val2' },
    { a: 'val3', b: 'val4' }
]
```



<a name="timezone"></a>
# Connection time zone
For every connection that is opened to the server, the timezone is automatically set to the current timezone of the system
that opens the connection. You can change this behavior by passing a value for the [option 'timezoneOffset'](#options).
The value for this option represents the number of minutes to deviate from GMT.
This value is used by MonetDB to present timestamps with timezone. Example:

```javascript
var MDB = require('monetdb')();

// Create two connections with different time zone

// One GMT+02:00
var conn1 = new MDB({timezoneOffset: 120, dbname: 'mydb'});

// And one GMT-03:30 (= -210 minutes)
var conn2 = new MDB({timezoneOffset: -210, dbname: 'mydb'});

conn1.connect();
conn2.connect();

conn1.query('SELECT NOW').then(function(result) {
    // result.data[0][0] will be something like '2015-11-02 08:11:31.000000+02:00'
});

conn2.query('SELECT NOW').then(function(result) {
    // result.data[0][0] will be something like '2015-11-02 02:45:56.000000-03:30'
});
```



<a name="logging"></a>
# Logging
As you can see from the [options section](#options), there are many logging options. By default, only warning messages
are logged, and console.log is used for this. The following types of log events can occur:
1. Warnings
    * Unrecognized options
    * Connection failures
    * Queries are issued before calling [connect()](#mdbconnection_connect)
2. Debug messages
    * State changes (see 
    [MapiConnection object](https://github.com/MonetDB/monetdb-nodejs/blob/master/docs/MapiConnection.md#getstate)
    for possible states)
    * Read/write counts on opened socket
3. Resolved requests
4. Mapi messages

You can manipulate whether or not these events are logged or not, and which functions are used to do this.
For all of these events, a default log function is specified in 
[utils.js](https://github.com/MonetDB/monetdb-nodejs/blob/master/src/utils.js)
Every log function receives as its first argument the logger that it should use, where the logger simply
takes a string and logs it somewhere. By default, the logger is **console.log**. You can change this in
the [options](#options).

In case you want to overwrite the default log functions, here are the function signatures:

### options.warningFn(logger, msg)

| Argument      | Type                 | Description     |
| :------------ | :------------------- | :-------------- |
| logger        | function             | The logger that is used, which defaults to console.log but can be specified through the [options](#options).
| msg           | string               | The message to write to the provided logger.

### options.debugFn(logger, msg)
Same as options.warningFn

### options.debugRequestFn(logger, request, error, result)

| Argument      | Type                 | Description     |
| :------------ | :------------------- | :-------------- |
| logger        | function             | The logger that is used, which defaults to console.log but can be specified through the [options](#options).
| request       | string               | The request message (SQL query string in case this request is an SQL query)
| error         | Error|null           | If this request failed, this argument contains the error that was thrown. Otherwise, this argument will be null.
| result        | Object|null          | If this request passed, this argument contains the [resulting object](#mdbconnection_query).

### options.debugMapiFn(logger, type, msg)

| Argument      | Type                 | Description     |
| :------------ | :------------------- | :-------------- |
| logger        | function             | The logger that is used, which defaults to console.log but can be specified through the [options](#options).
| type          | string               | Either 'TX' for transmitted messages, or 'RX' for received messages.
| msg           | string               | The string that was communicated over the socket.
    
