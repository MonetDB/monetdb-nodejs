#!/usr/bin/env bash

monetdbd create ./dbfarm
monetdbd start ./dbfarm

sleep 10

monetdb create test
monetdb release test
monetdb start test


function test_monetdb_connection() {
  mclient -d test -s 'SELECT 1' &> /dev/null
  local status=$?
  if [ $status -ne 0 ]; then
    return 0
  fi
  return 1
}

for i in {30..0}; do
  echo 'Testing MonetDB connection ' $i
	if test_monetdb_connection ; then
		echo 'Waiting for MonetDB to start...'
  	sleep 1
  else
    echo 'MonetDB is running'
    break
	fi
done
if [ "$i" = 0 ]; then
	echo >&2 'MonetDB startup failed'
	exit 1
fi



