#!/usr/bin/env bash

add-apt-repository -h

add-apt-repository "http://dev.monetdb.org/downloads/deb/ monetdb"

cat /etc/apt/sources.list

wget --output-document=- https://www.monetdb.org/downloads/MonetDB-GPG-KEY | apt-key add -

apt-get update

apt-get install monetdb5-sql monetdb-client
