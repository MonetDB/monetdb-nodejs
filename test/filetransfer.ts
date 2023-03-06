import assert from 'assert';
import Connection from '../src/connection';
import fs from 'node:fs/promises';

describe('File Transfer', function() {
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
    });

    it('should upload text file', async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        await conn.execute('create table foo(i int, a varchar(10))');
        const f = await fs.open(fooFile, 'w');
        for (let word of ['1|one', '2|two', '3|three']) {
            f.write(word + '\n');
        }
        await f.close();
        let res = await conn.execute(`copy into foo from \'${fooFile}\' on client`);
        res = await conn.execute('select * from foo order by i');
        assert.deepStrictEqual(res.data, [[1, 'one'], [2, 'two'], [3, 'three']]);
    });

    it('should cancel upload on fewer rows', async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        await conn.execute('create table foo(i int, a varchar(10))');
        const f = await fs.open(fooFile, 'w');
        for (let word of ['1|one', '2|two', '3|three', '4|four', '5|five', '6|six']) {
            f.write(word + '\n');
        }
        await f.close();
        let res = await conn.execute(`copy 3 records into foo from \'${fooFile}\' on client`);
        res = await conn.execute('select * from foo order by i');
        assert.deepStrictEqual(res.data, [[1, 'one'], [2, 'two'], [3, 'three']]);
    });

    it('should upload text file skip 2', async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        await conn.execute('create table foo(i int, a varchar(10))');
        const f = await fs.open(fooFile, 'w');
        for (let word of ['1|one', '2|two', '3|three', '4|four', '5|five', '6|six']) {
            f.write(word + '\n');
        }
        await f.close();
        let res = await conn.execute(`copy offset 3 into foo from \'${fooFile}\' on client`);
        res = await conn.execute('select * from foo order by i');
        assert.deepStrictEqual(res.data, [[3, "three"], [4, "four"], [5, "five"], [6, "six"]]);
    });


    it('should download text file', async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        let res = await conn.execute('copy (select * from sys.generate_series(1,1001)) into \'test/tmp/foo\' on client');
        assert.strictEqual(res.affectedRows, 1000);
    });

    it('should fail on forbidden path', async function() {
        const ready = await conn.connect();
        assert(ready, new Error('failed to connect'));
        await conn.execute('create table foo(i varchar(10))');
        await assert.rejects(conn.execute(`copy into foo from \'../../foo\' on client`), Error);
    });

});
