#!/usr/bin/env bash

monetdbd create ./dbfarm
monetdbd start ./dbfarm

sleep 10

monetdb create test
monetdb release test
