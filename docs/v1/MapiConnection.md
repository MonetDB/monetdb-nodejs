# The MapiConnection object

[![Build Status](https://travis-ci.org/MonetDB/monetdb-nodejs.svg)](https://travis-ci.org/MonetDB/monetdb-nodejs)
[![Coverage Status](https://coveralls.io/repos/MonetDB/monetdb-nodejs/badge.svg?branch=master&service=github)](https://coveralls.io/github/MonetDB/monetdb-nodejs?branch=master)
[![npm version](https://badge.fury.io/js/monetdb.svg)](https://badge.fury.io/js/monetdb)
[![Dependency Status](https://david-dm.org/MonetDB/monetdb-nodejs.svg)](https://david-dm.org/MonetDB/monetdb-nodejs)

The MapiConnection object manages the socket connection to the server, and communicates over this socket. 
It also contains the reconnect logic.

The MonetDB NodeJS module does not expose the constructor of the MapiConnection directly, since for normal usage a 
MapiConnection object should be managed by a [MonetDBConnection object](https://github.com/MonetDB/monetdb-nodejs#mdbconnection).
You can however use a MapiConnection object directly, since every MonetDBConnection object exposes one.

If you insist, you could also include src/mapi-connection.js directly into your project to be able to construct one yourself.

<a name="constructor"></a>
### MapiConnection(\[options\])
Construct a MapiConnection object. For the available options in the options object, [see here](https://github.com/MonetDB/monetdb-nodejs#options).

**Note: As opposed to the [MonetDBConnection object](#https://github.com/MonetDB/monetdb-nodejs#mdbconnection), 
the options are not checked for validity on constructing a MapiConnection object. This might cause unexpected behavior,
since we do not test the creation of a MapiConnection object other than by a MonetDBConnection object.**

<a name="connect"></a>
### .connect()
This method is documented int the [MonetDBConnection object section](https://github.com/MonetDB/monetdb-nodejs#mdbconnection_connect).

<a name="request"></a>
### .request(request)
Adds a Mapi request to the queue. If you want to issue an SQL query this way, you should pack it in between an 's' and a ';':

```javascript
mapiConn.request('sSELECT * FROM foo;');
```

Returns a promise that resolves with a [query result](https://github.com/MonetDB/monetdb-nodejs#mdbconnection_query), or
gets rejected with a proper error message.

<a name="getstate"></a>
### .getState()
This method is documented in the [MonetDBConnection object section](https://github.com/MonetDB/monetdb-nodejs#mdbconnection_getstate).


<a name="close"></a>
### .close()
This method is documented in the [MonetDBConnection object section](https://github.com/MonetDB/monetdb-nodejs#mdbconnection_close).


<a name="destroy"></a>
### .destroy(\[msg\])
This method is documented in the [MonetDBConnection object section](https://github.com/MonetDB/monetdb-nodejs#mdbconnection_destroy).

