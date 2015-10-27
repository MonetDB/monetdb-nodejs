#!/usr/bin/env bash

deb http://dev.monetdb.org/downloads/deb/ precise monetdb
deb-src http://dev.monetdb.org/downloads/deb/ precise monetdb

wget --output-document=- https://www.monetdb.org/downloads/MonetDB-GPG-KEY | sudo apt-key add -

sudo apt-get update

sudo apt-get install monetdb5-sql monetdb-client
