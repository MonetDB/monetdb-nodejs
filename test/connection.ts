import assert from 'assert';
import Connection from '../src/connection';

describe('Connection', function() {
    let conn: Connection;
    beforeEach(function() {
        conn = new Connection({database: 'test'});
    });

    afterEach(async function(){
        const closed = await conn.close();
        assert(closed);
    });

    it('should connect', async function(){
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
    })

    it('should handle single select query', async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        const res = await conn.execute('select * from generate_series(1, 10)');
        assert.equal(res.rowCnt, 9);
        assert.equal(res.data.length, 9);
    });

    it('should handle many queres', async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        const [res1, res2, res3] = await Promise.all([
            conn.execute('select * from generate_series(1, 11)'),
            conn.execute('select * from generate_series(11, 21)'),
            conn.execute('select * from generate_series(21, 31)')]);
        assert.deepStrictEqual(res1.data, [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10]]);
        assert.deepStrictEqual(res2.data, [[11], [12], [13], [14], [15], [16], [17], [18], [19], [20]]);
        assert.deepStrictEqual(res3.data, [[21], [22], [23], [24], [25], [26], [27], [28], [29], [30]]);
    });

    it('should handle insert statements', async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        let res = await conn.execute('create schema test');
        res = await conn.execute('create table foo(a string)')
        res = await conn.execute('insert into foo values (\'foo\'), (\'bar\')');
        res = await conn.execute('select * from foo');
        assert.deepStrictEqual(res.data, [['foo'], ['bar']]);
    });


    it("should rollback", async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        let res = await conn.execute('create table foo(a string)');
        res = await conn.execute('select name from tables where name=\'foo\'');
        assert.strictEqual(res.rowCnt, 1);
        res = await conn.rollback();
        res = await conn.execute('select name from tables where name=\'foo\'');
        assert.strictEqual(res.rowCnt, 0);
    });

    it("should handle 2 byte characters exceeding mapi block", async () => {
        let s = 'éééééééééééééééééééééééééééé';
        let string = '';
        for (let i=0; i < 1000; i++)
            string += s;
        const qry = `select \'${string}\'`;
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        const res = await conn.execute(qry);
        assert.strictEqual(res.rowCnt, 1);
    });

});
