#!/usr/bin/env bash

add-apt-repository "http://dev.monetdb.org/downloads/deb/ monetdb"

wget --output-document=- https://www.monetdb.org/downloads/MonetDB-GPG-KEY | apt-key add -

apt-get update

apt-get install monetdb5-sql monetdb-client

printf "user=monetdb\npassword=monetdb\n" > ~/.monetdb
