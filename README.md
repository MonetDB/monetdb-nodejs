# monetdb-nodejs

[![Linux](https://github.com/MonetDB/monetdb-nodejs/workflows/Linux/badge.svg)
[![macOS](https://github.com/MonetDB/monetdb-nodejs/workflows/macos/badge.svg)
[![Coverage Status](https://coveralls.io/repos/MonetDB/monetdb-nodejs/badge.svg?branch=master&service=github)](https://coveralls.io/github/MonetDB/monetdb-nodejs?branch=master)
[![npm version](https://badge.fury.io/js/monetdb.svg)](https://badge.fury.io/js/monetdb)

MonetDB Node.js connector.

## Getting Started

```bash
npm i monetdb
```
, connect with default options

```js
import { Connection } from monetdb

const opt: MapiConfig = {
    database: 'your_database'
}

const conn = new Connection(opt);
```
, or using mapi URL 

```js
import { Connection } from monetdb
const conn = new Connection('mapi:monetdb://<username>:<password>@<hostname>:<port>/<database>');
```
, then run some queries
```js
    const ready: boolean = await conn.connect();
    const res: QueryResult = await conn.execute('select 42');
    ...
    const closed: boolean = await conn.close();
```
, for detailed api documentation please visit [documentation](docs/README.md).
## Features
- prepared statements
- streaming query results
- bulk import & export with `COPY TO/COPY FROM`
## Contributing

**:heart: contributions!**

We will **happily** accept your pull request if it:

- **has tests**
- looks reasonable
- does not break backwards compatibility

If your change has breaking backwards compatibility please please point that out in the pull request. When you open an issue please provide:
- version of Node
- version of MonetDB
- smallest possible snippet of code to reproduce the problem
### Setting up for local development
- clone the repo
- run ``` npm i && npm run build``` in root folder
- have MonetDB running with `test` database. For more information on how to get started with MonetDB please visit [MonetDB Documentation](https://www.monetdb.org/documentation-Jun2023/user-guide/get-started/)
- run tests with `npm t`

