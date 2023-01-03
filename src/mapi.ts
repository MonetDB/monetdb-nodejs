import { Socket, createConnection } from 'node:net';
import { once, EventEmitter, Abortable } from 'events';
import { Buffer } from 'buffer';
import { createHash } from 'node:crypto';

const MAPI_BLOCK_SIZE = (1024 * 8) - 2;
const MAPI_HEADER_SIZE = 2;

const MSG_PROMPT = "";
const MSG_MORE = "\x01\x02\n";
const MSG_FILETRANS = "\x01\x03\n";
const MSG_INFO = "#";
const MSG_ERROR = "!";
const MSG_Q = "&";
const MSG_QTABLE = "&1";
const MSG_QUPDATE = "&2";
const MSG_QSCHEMA = "&3";
const MSG_QTRANS = "&4";
const MSG_QPREPARE = "&5";
const MSG_QBLOCK = "&6";
const MSG_HEADER = "%";
const MSG_TUPLE = "[";
const MSG_TUPLE_NOSLICE = "=";
const MSG_REDIRECT = "^";
const MSG_OK = "=OK";

const MAX_REDIRECTS = 10;

enum MAPI_STATE {
    INIT=1,
    CONNECTED,
    READY
}

enum MAPI_LANGUAGE {
    SQL='sql',
    MAPI='mapi',
    CONTROL='control'
}

interface MapiOptions {
    database: string;
    username: string;
    password: string;
    host?: string;
    port?: number;
}

// MAPI URI:
//  tcp socket:  mapi:monetdb://[<username>[:<password>]@]<host>[:<port>]/<database>
//  unix domain socket: mapi:monetdb:///[<username>[:<password>]@]path/to/socket?database=<database>

function isMapiUri(uri:string): boolean {
    const regx = new RegExp('^mapi:monetdb://*', 'i');
    return regx.test(uri);
}

function parseMapiUri(uri: string) {
    // return parsed result as object
}


class Store {
    buff: Buffer;
    offset: number;
    segments: Segment[];
    constructor(size: number = MAPI_BLOCK_SIZE) {
        this.buff = Buffer.allocUnsafe(size).fill(0);
        this.offset = 0;
        this.segments = [];
    }

    append(data: Buffer): number {
        let srcStartIndx = 0;
        let srcEndIndx = srcStartIndx + data.length;
        let segment = this.segments.pop();
        let bytesCopied = 0;
        if (!this.isFull()) {
            // check if out of space
            if ((this.buff.length - this.offset) < data.length)
                this.expand(MAPI_BLOCK_SIZE);

            if (segment === undefined || segment.isFull()) {
                const hdr = data.readUInt16LE(0);
                const last = (hdr & 1) === 1;
                const bytes = hdr >> 1;
                srcStartIndx = MAPI_HEADER_SIZE;
                srcEndIndx = srcStartIndx + Math.min(bytes, data.length);
                bytesCopied = data.copy(this.buff, this.offset, srcStartIndx, srcEndIndx);
                segment = new Segment(bytes, last, this.offset, bytesCopied);
                this.segments.push(segment);
                this.offset += bytesCopied;
            } else {
                const byteCntToRead = segment.bytes - segment.bytesOffset;
                srcEndIndx = srcStartIndx + byteCntToRead;
                bytesCopied = data.copy(this.buff, this.offset, srcStartIndx, srcEndIndx);
                this.offset += bytesCopied;
                segment.bytesOffset += bytesCopied;
                console.log(`segment is full $(segment.bytesOffset === segment.bytes)`);
                this.segments.push(segment);
            }
        }
        return bytesCopied;
    }

    expand(byteCount: number): number {
        const buff = Buffer.allocUnsafe(this.buff.length + byteCount).fill(0);
        const bytesCopied = this.buff.copy(buff);
        this.buff = buff;
        // should be byteCount
        return this.buff.length - bytesCopied;
    }

    drain(): string {
        const res = this.toString();
        this.segments = [];
        this.offset = 0;
        this.buff.fill(0);
        return res;
    }

    isFull(): boolean {
        const l = this.segments.length;
        if (l > 0) {
            const segment = this.segments[l-1];
            return segment.last && segment.isFull();
        }
        return false;
    }

    toString() {
        return this.buff.toString();
    }

}

class Segment {
    offset: number;
    bytes: number;
    bytesOffset: number;
    last: boolean;
    constructor(bytes: number, last: boolean, offset: number, bytesOffset: number) {
        this.bytes = bytes;
        this.last = last;
        this.offset = offset;
        this.bytesOffset = bytesOffset;
    }

    isFull(): boolean {
        return this.bytes === this.bytesOffset;
    }
}

class MAPIConnection extends EventEmitter {
    state: MAPI_STATE;
    socket: Socket;
    timeout?: number; 
    username?: string;
    password?: string;
    database?: string;
    hostname?: string;
    language: MAPI_LANGUAGE;
    port?: number;
    redirects: number;
    store: Store;

    constructor() {
        super();
        this.state = MAPI_STATE.INIT;
        this.socket = null;
        this.redirects = 0;
        this.store = new Store(MAPI_BLOCK_SIZE);
    }

    connect(database: string, username?: string, password?: string,
            hostname?: string, port?: number, timeout?: number, language=MAPI_LANGUAGE.SQL): Promise<any[]> {
        if (isMapiUri(database)) {
            // parse URI
        } else {
            this.username = username;
            this.password = password;
            this.port = port;
            this.database = database;
            this.language = language;
        }

        this.socket = createConnection(this.port, this.hostname, () => this.state = MAPI_STATE.CONNECTED);
        this.socket.setKeepAlive(true);
        this.socket.setNoDelay(true);
        if (timeout)
            this.socket.setTimeout(timeout);
        this.socket.addListener('data', this.recv.bind(this));
        this.socket.addListener('error', this.handleSocketError.bind(this));
        this.socket.addListener('timeout', this.handleTimeout.bind(this));

        return once(this, 'ready');
    }

    disconnect() {
        this.send("");
        this.socket.end();
        this.state = MAPI_STATE.INIT;
        this.socket = null;
        this.redirects = 0;
    }

    private login(resp: string): void {
        const [challenge, identity, protocol, hashes, endian, algo] = resp.split(':');
        let password: string;
        try {
            password = createHash(algo).update(this.password).digest('hex');
        } catch(err) {
            console.error(algo)
            this.emit('error', err);
            return;
        }
        let pwhash = null;
        // try hash algorithms in the order provided by the server
        for (const algo of hashes.split(',')) {
            try {
                const hash = createHash(algo);
                pwhash = `{${algo}}` + hash.update(password + challenge).digest('hex');
                break;
            } catch {}
        }
        if (pwhash) {
            const counterResponse = `${endian}:${this.username}:${pwhash}:${this.language}:${this.database}:`;
            this.send(counterResponse);
        } else {
            this.emit('error', 'Unsupported hash algorithm')
        }
    }

    private send(msg: string): void {
        console.log(`Sending ${msg}`);
        let buff = Buffer.from(msg);
        let last = 0;
        let offset = 0;
        while (last === 0) {
            const bs = Math.min((buff.length - offset) + MAPI_HEADER_SIZE, MAPI_BLOCK_SIZE);
            last = (bs < MAPI_BLOCK_SIZE) ? 1 : 0;
            const bytesOut = bs - MAPI_HEADER_SIZE;
            const outBuff = Buffer.allocUnsafe(bs).fill(0);
            let pos = 0;
            pos += outBuff.writeUint16LE((bytesOut << 1) | last , 0);
            const start = offset;
            const end = offset + bytesOut;
            offset += buff.copy(outBuff, pos, start, end);
            this.socket.write(outBuff);
        }
    }

    private handleTimeout() {
        this.emit('error', new Error('Timeout'));
    }

    private handleSocketError(err: Error) {
        console.error(err);
    }

    private recv(data: Buffer) {
        const bytesLeftOver = data.length - this.store.append(data);
        if (this.store.isFull()) {
            return this.handleResponse(this.store.drain());
        }
        if (bytesLeftOver) {
            const msg = `some $(bytesLeftOver) bytes left over!`;
            console.warn(msg);
            this.recv(data.subarray(bytesLeftOver));
        }
    }

    private handleResponse(resp: string): void {
        console.log('>>', resp);
        if (resp.startsWith(MSG_ERROR)) {
            const err = new Error(resp.substring(1));
            this.emit('error', err);
        }

        if (this.state != MAPI_STATE.READY) {
            const isRedirect = resp.startsWith(MSG_REDIRECT);
            if (isRedirect) {
                this.redirects += 1;
                console.log('received redirect');
                if (this.redirects > MAX_REDIRECTS)
                   this.emit('error', `Exceeded max number of redirects $(MAX_REDIRECTS)`);
                return;
            }
            if (resp.startsWith(MSG_OK) || resp.startsWith('\x00')) {
                console.log('OK');
                this.state = MAPI_STATE.READY;
                this.emit('ready', this.state);
                return;
            }
            return this.login(resp);
        }

    }


}

export default MAPIConnection;
