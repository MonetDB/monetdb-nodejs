import assert from 'assert';
import Connection from '../src/connection';

describe('Query Stream', function() {
    let conn: Connection;
    beforeEach(function() {
        conn = new Connection({database: 'test'});
    });

    afterEach(async function(){
        const closed = await conn.close();
        assert(closed);
    });

    it('should stream response', async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
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
