import assert from 'assert';
import Connection from '../src/connection';
import fs from 'node:fs/promises';

describe('File Upload', function() {
    let conn: Connection;
    let fooFile = 'test/tmp/foo'
    beforeEach(function() {
        conn = new Connection({database: 'test'});
    });

    afterEach(async function() {
        const closed = await conn.close();
        assert(closed);
    });

    it('should upload binary file', async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        await conn.execute('create table foo(i int)');
        const f = await fs.open(fooFile, 'w');
        const buff = Buffer.alloc(12);
        buff.writeInt32LE(1, 0);
        buff.writeInt32LE(2, 4);
        buff.writeInt32LE(3, 8);
        f.write(buff);
        await f.close();
        let res = await conn.execute(`copy binary into foo from \'${fooFile}\' on client`);
        res = await conn.execute('select * from foo');
        assert.deepStrictEqual(res.data, [[1], [2], [3]]);
    })

    it('should upload text file', async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        await conn.execute('create table foo(i varchar(10))');
        const f = await fs.open(fooFile, 'w');
        for (let word of ['foo', 'bar', 'bazz']) {
            f.write(word + '\n');
        }
        await f.close();
        let res = await conn.execute(`copy into foo from \'${fooFile}\' on client`);
        res = await conn.execute('select * from foo');
        assert.deepStrictEqual(res.data, [['foo'], ['bar'], ['bazz']]);
    })

});
