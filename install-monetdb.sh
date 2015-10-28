#!/usr/bin/env bash

sudo add-apt-repository -s http://dev.monetdb.org/downloads/deb/

wget --output-document=- https://www.monetdb.org/downloads/MonetDB-GPG-KEY | apt-key add -

apt-get update

apt-get install monetdb5-sql monetdb-client
