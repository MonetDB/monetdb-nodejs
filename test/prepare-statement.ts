import assert from 'assert';
import Connection from '../src/connection';

describe('Prepare Statement', function() {
    let conn: Connection;
    beforeEach(function() {
        conn = new Connection({database: 'test'});
    });

    afterEach(async function(){
        const closed = await conn.close();
        assert(closed);
    });

    it("should prepare inserts", async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        let res = await conn.execute('create table foo(a int, b boolean, c string, d date, f decimal)');
        const prepStmt = await conn.prepare('insert into foo values (?, ?, ?, ?, ?)');
        res = await prepStmt.execute(1, true, 'first', '2022-12-12', 1.11);
        res = await prepStmt.execute(2, false, 'second', '2022-12-12', 2.22);
        res = await prepStmt.execute(3, true, 'third', '2022-12-12', 3.33);
        await prepStmt.release();
        res = await conn.execute('select count(*) from foo');
        assert.strictEqual(res.data[0][0], 3);
    });
});
