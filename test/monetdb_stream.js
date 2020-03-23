
const { getMDB } = require('./common');
 

describe('Query stream', () => {
	const MDB = getMDB();

	it('should call callbacks', async () => {
		const conn = new MDB();
		const sql = 'select * from columns';
		
		await conn.connect();
		
		const { header: hdrEventCount, data: dataEventCnt, end: endEventCount } = await test_callbacks(conn, sql);
		hdrEventCount.should.equal(1);
		(dataEventCnt > 0).should.be.true;
		endEventCount.should.equal(1);
		conn.close();
	});

	it('should produce result', async () => {
		const sql = 'SELECT table_type_id,table_type_name FROM table_types where table_type_id in (0,1,3,4,5)';
		const conn = new MDB();
		await conn.connect();
		
		const res = await test_result(conn, sql);
		Boolean(res).should.be.true;
		conn.close();
	});

	it('should produce equal results', async() => {
		const sql = 'select * from columns';
		const conn = new MDB();
		await conn.connect();
		const left = await conn.query(sql);
		const right = await test_result(conn, sql);
		left.data.toString().should.equal(right.data.toString());
	});


});


function test_callbacks (conn, sql) {
	const lookup = {
		header: 0,
		data: 0,
		end: 0
	};
	return new Promise((resolve, reject) => {
		conn.querystream(sql)
			.on('error', (err) => {
				return reject(err);
			})
			.on('header', (header) => {
				lookup.header +=1;
			})
			.on('data', (data) => {
				lookup.data +=1;
			})
			.on('end', () => {
				lookup.end +=1;
				resolve(lookup);
			});
	});
}


function test_result(conn, sql){
	var result;
	return new Promise(function(resolve, reject) {
		//we simulate the same structure produced by buffer response (/query)
			var query = conn.querystream(sql);	
			var firstchunck = true;
			var error_flag = false;
			query
			.on('error', function(err) {
				error_flag = true;
				reject(err);
				// Handle error, an 'end' event will be emitted after this as well		
			})
			.on('header', function(header) {		  
				// the field packets for the rows to follow		
				var strheader = JSON.stringify(header);
				result = strheader.substr(0,strheader.length-1);
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
					var res = JSON.parse(result);
					resolve(res);		
				}
			});		
		});	
}	
