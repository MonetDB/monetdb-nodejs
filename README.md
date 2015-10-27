#MonetDB NodeJS connector v1.0.0

[![Build Status](https://travis-ci.org/MonetDB/monetdb-nodejs.svg)](https://travis-ci.org/MonetDB/monetdb-nodejs)
[![Coverage Status](https://coveralls.io/repos/MonetDB/monetdb-nodejs/badge.svg?branch=master&service=github)](https://coveralls.io/github/MonetDB/monetdb-nodejs?branch=master)

Over here we are working on a renewed version of the MonetDB NodeJS connector. Some of the changes over the previous connector include:
- It will be promise based (with a wrapper for the callback fans, so most of your old code remains usable)
- Reconnect logic will be added, which will be configurable
- Multiple layers of options can be used (global options, connection specific, and query specific options)
- Extended result objects will become available upon request
- A thorough test case will be added

## Note: The current code is not production ready yet. For now, please stick with the 0.\* version
