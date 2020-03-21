
var MDB = require('monetdb')();
//var MonetDBPool = require("monetdb-pool");
 
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

var conn = new MDB(options);
conn.connect().fail(function(error) {
	console.log("Connexion Impossible : "+ error);
});
//var pool = new MonetDBPool(poolOptions, options); 
/*pool.connect().fail(function(error) {
	console.log("Connexion Impossible : "+ error);
});
*/

function test_querysteam(){
	var sql = 'SELECT table_type_id,table_type_name FROM table_types where table_type_id in (0,1,3,4,5)';
	var result;
	return new Promise(function(resolve, reject) {
		//we simulate the same structure produced by buffer response (/query)
			var query = conn.querystream(sql);	
			//var query = pool.querystream(sql);	
			var firstchunck = true;
			var error_flag = false;
			query
			.on('error', function(err) {
				//console.log("error");
				//console.log(err);
				error_flag = true;
				reject(err);
				// Handle error, an 'end' event will be emitted after this as well		
			})
			.on('header', function(header) {		  
				// the field packets for the rows to follow		
				var strheader = JSON.stringify(header);
				result = strheader.substr(0,strheader.length-1);
				//console.log("pool load via querystream - header",pool.getRunningQueries());
			})
			.on('data', function(rows) {	
				var strrows = JSON.stringify(rows);
				if (firstchunck) {
					strrows = ',"data":' + strrows.substr(0,strrows.length-1);			
				} else {
					strrows = ',' + strrows.substr(1,strrows.length-2);		
				}
				firstchunck = false;  
				result += strrows;
			})
			.on('end', function() {
				if (!error_flag) {
					// all rows have been received	withour error	
					result += ']}';
					//console.log(result);
					var res = JSON.parse(result);
					resolve(res);
					//console.log("pool load via querystream - end",pool.getRunningQueries());		
				}
			});		
		});	
}	

var query = test_querysteam();

query.then(function(result) {
  	console.log(result);
  	console.log("result.data.length == 5 ?")
	console.log(result.data.length == 5)
	conn.close();
  //pool.close();
}).catch(function(error) {
	console.error(error);
});



