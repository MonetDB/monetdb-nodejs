var MDB = require('monetdb')();
 
var options = {
    host     : 'localhost', 
    port     : 50000, 
    dbname   : 'demo', 
    user     : 'monetdb', 
    password : 'monetdb'
};
 
var conn = new MDB(options);
conn.connect();
 
//conn.query('SELECT * FROM tables where name =\'test\'').then(function(result) {
var string = 'éééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééé';
string += string;
string += string;
string += string;
string += string;
string += string;


conn.query('SELECT \'' + string +'\' FROM tables ').then(function(result) {	
    //Request simulate a lot of 2 bytes characters. Some characters are truncated by the buffering in _handleData of mapi-connection.js
	//Without correction some caracters became unknown
	//Solved by using a StringDecoder
	var res = JSON.stringify(result);
	const regex = /é/gi;
	console.log(res.replace(regex,''));
	
});


conn.close();