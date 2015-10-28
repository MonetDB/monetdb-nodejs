#!/usr/bin/env bash

monetdbd create ./dbfarm
monetdbd start ./dbfarm

function test_monetdb_connection() {
  mclient -d blaeu -s 'SELECT 1' &> /dev/null
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

monetdb create test
monetdb release test
