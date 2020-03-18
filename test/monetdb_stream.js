
const express = require('express')
const app = express()
const port = 3000

var MDB = require('monetdb')();
var MonetDBPool = require("monetdb-pool");
 
var options = {
    host     : 'localhost', 
    port     : 50000, 
    dbname   : 'demo', 
    user     : 'monetdb', 
    password : 'monetdb'
};
 
var poolOptions = {
	nrConnections : 10	
} 

var pool = new MonetDBPool(poolOptions, options); 

pool.connect().fail(function(error) {
	console.log("Connexion Impossible : "+ error);
});

//We create a cartesian product to have some lines
var sql = 'SELECT * FROM table_types,tables,columns';

app.get('/query', (request, response) => {

	pool.query(sql).then(function(result) {	
		// Do something with the result
		response.send(result);
	});
})

app.get('/querystream', (request, response) => {
	
	//we simulate the same structure produced by buffer response (/query)
	var query = pool.querystream(sql);	
	var firstchunck = true;
	query
	  .on('error', function(err) {
		  console.log("error");
			console.log(err);
		// Handle error, an 'end' event will be emitted after this as well		
	  })
	  .on('header', function(header) {		  
		// the field packets for the rows to follow		
		var strheader = JSON.stringify(header);
		response.setHeader('Content-Type', 'application/json');
		response.write(strheader.substr(0,strheader.length-1));
		console.log("pool load via querystream - header",pool.getRunningQueries());
	  })
	  .on('data', function(rows) {	
		var strrows = JSON.stringify(rows);
		
		if (firstchunck) {
			strrows = ',"data":' + strrows.substr(0,strrows.length-1);			
		} else {
			strrows = ',' + strrows.substr(1,strrows.length-2);		
		}
		firstchunck = false;  
		response.write(strrows);
	  })
	  .on('end', function() {
		// all rows have been received		
		response.write(']}');
		response.end();		
		console.log("pool load via querystream - end",pool.getRunningQueries());
	  });

	query.catch(function(error) {
  		console.error(error);
	});

})

app.get('/pool', (request, response) => {
	var p = pool.getRunningQueries();
	
	response.send(p);
})	

app.get('/querystream2', (request, response) => {
		//we simulate the same structure produced by buffer response (/query)
		var query = pool.querystream(sql);	
		var firstchunck = true;
		query
		  .on('error', function(err) {
			  console.log("error");
				console.log(err);
			// Handle error, an 'end' event will be emitted after this as well		
		  })
		  .on('header', function(header) {		  
			// the field packets for the rows to follow		
			var strheader = JSON.stringify(header);
			response.setHeader('Content-Type', 'application/json');
			response.write(strheader.substr(0,strheader.length-1));
			console.log("pool load via querystream2 - header",pool.getRunningQueries());
		  })
		  .on('data', function(rows) {	
			var strrows = JSON.stringify(rows);
			
			if (firstchunck) {
				strrows = ',"data":' + strrows.substr(0,strrows.length-1);			
			} else {
				strrows = ',' + strrows.substr(1,strrows.length-2);		
			}
			firstchunck = false;  
			response.write(strrows);
		  })
		  .on('end', function() {
			// all rows have been received		
			response.write(']}');
			response.end();
			console.log("pool load via querystream2 - end",pool.getRunningQueries());
		  });
		  query.catch(function(error) {
			console.error(error);
	  	});
  
  })
  

app.get('/', (request, response) => {
  response.send('Hello from Express!')
})

app.listen(port, (err) => {
  if (err) {
    return console.log('something bad happened', err)
  }

  console.log(`server is listening on ${port}`)
})
