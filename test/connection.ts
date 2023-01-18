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

    it('should stream response', async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        await conn.setReplySize(-1);
        const stream = await conn.execute('select * from generate_series(1, 10000)', true);
        const colInfo = [];
        const data = [];
        return new Promise((resolve, reject) => {
            stream.on('header', (cols: any[]) => {
                for (let col of cols)
                    colInfo.push(col);
            });
            stream.on('data', (tuples: any[]) => {
                for (let t of tuples) {
                    data.push(t);
                }
            });
            stream.on('error', (err: Error) => {
                reject(err);
            })
            stream.on('end', () => {
                assert.strictEqual(colInfo.length, 1);
                assert.strictEqual(data.length, 9999);
                resolve();
            });
        })
    });
});
