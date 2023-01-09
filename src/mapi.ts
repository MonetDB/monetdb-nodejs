import { Socket, SocketConnectOpts } from 'node:net';
import { Readable, Writable } from 'node:stream';
import { once, EventEmitter, Abortable } from 'events';
import { Buffer } from 'buffer';
import { createHash } from 'node:crypto';
import defaults from './defaults';

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

interface MapiConfig {
    database: string;
    username: string;
    password: string;
    language?: MAPI_LANGUAGE;
    host?: string;
    port?: number;
    unixSocket?: string;
    timeout?: number;
    autoCommit?: boolean;
    replySize?: number;
}

class HandShakeOption {
    level: number;
    name: string;
    value: any;
    fallback?: (v: any) => void;
    sent: boolean;
    constructor(level:number, name:string, value: any,
                fallback: (v: any) => void, sent=false) {
        this.level = level;
        this.name = name;
        this.value = value;
        this.fallback = fallback;
        this.sent = sent;
    }
}


function isMapiUri(uri:string): boolean {
    const regx = new RegExp('^mapi:monetdb://*', 'i');
    return regx.test(uri);
}

function parseMapiUri(uri: string): MapiConfig {
    if (isMapiUri(uri)) {
        const res = {database: '', username: '', password: ''};
        // TODO return parsed result as object
        return res;
    }
    throw new Error(`Unvalid MAPI URI ${uri}!`);
}

function createMapiConfig(params?: MapiConfig): MapiConfig {
    const database = (params && params.database)? params.database : defaults.database;
    if (typeof database != 'string') {
        throw new Error("database name must be string");
    }

    const username = (params && params.username)? params.username : defaults.username;
    const password = (params && params.password)? params.password : defaults.password;

    let host = params && params.host;
    const unixSocket = params && params.unixSocket;
    if (!unixSocket && !host)
        host = defaults.host;
    if (typeof host != 'string') {
        throw new Error(`${host} is not valid hostname`);
    }
    const port = (params && params.port)? Number(params.port) : Number(defaults.port);
    if (isNaN(port)) {
        throw new Error(`${port} is not valid port`);
    }

    const timeout = (params && params.timeout)? Number(params.timeout) : undefined;
    if (timeout && isNaN(timeout)) {
        throw new Error('timeout must be number');
    }
    const language = (params && params.language)? params.language : MAPI_LANGUAGE.SQL;

    return {database, username, password, language, host, port, timeout, unixSocket};
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
        const l = this.segments.length;
        let segment = (l > 0 && this.segments[l - 1]) || undefined;
        let bytesCopied = 0;
        if (!this.isFull()) {
            // check if out of space
            if ((this.buff.length - this.offset) < data.length)
                this.expand(MAPI_BLOCK_SIZE);

            if (segment === undefined || (segment && segment.isFull())) {
                const hdr = data.readUInt16LE(0);
                const last = (hdr & 1) === 1;
                const bytes = hdr >> 1;
                srcStartIndx = MAPI_HEADER_SIZE;
                srcEndIndx = srcStartIndx + Math.min(bytes, data.length);
                bytesCopied = data.copy(this.buff, this.offset, srcStartIndx, srcEndIndx);
                segment = new Segment(bytes, last, this.offset, bytesCopied);
                this.segments.push(segment);
                this.offset += bytesCopied;
                return MAPI_HEADER_SIZE + bytesCopied;
            } else {
                const byteCntToRead = segment.bytes - segment.bytesOffset;
                srcEndIndx = srcStartIndx + byteCntToRead;
                bytesCopied = data.copy(this.buff, this.offset, srcStartIndx, srcEndIndx);
                this.offset += bytesCopied;
                segment.bytesOffset += bytesCopied;
                console.log(`segment is full ${segment.bytesOffset === segment.bytes}`);
                return bytesCopied;
            }
        }
    }

    expand(byteCount: number): number {
        console.log('expanding ...');
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
    offset: number; // where segment starts
    bytes: number;
    bytesOffset: number; // meaningful bytes e.g. if offset + bytesOffset == bytes, then segment full
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

class MapiConnection extends EventEmitter {
    state: MAPI_STATE;
    socket: Socket;
    database: string;
    timeout: number; 
    username: string;
    password: string;
    host?: string;
    unixSocket?: string;
    port: number;
    language: MAPI_LANGUAGE;
    handShakeOptions?: HandShakeOption[];
    redirects: number;
    store: Store;

    constructor(config: MapiConfig) {
        super();
        this.state = MAPI_STATE.INIT;
        this.socket = new Socket();
        if (config.timeout)
            this.socket.setTimeout(config.timeout);
        this.socket.addListener('data', this.recv.bind(this));
        this.socket.addListener('error', this.handleSocketError.bind(this));
        this.socket.addListener('timeout', this.handleTimeout.bind(this));
        this.socket.addListener('close', () => {
            console.log('socket close event');
            this.emit('end');
        });
        this.redirects = 0;
        this.store = new Store(MAPI_BLOCK_SIZE);
        this.database = config.database;
        this.language = config.language || MAPI_LANGUAGE.SQL;
        this.unixSocket = config.unixSocket;
        this.host = config.host;
        this.port = config.port;
        this.username = config.username;
        this.password = config.password;
    }

    connect(handShakeOptions: HandShakeOption[] = []): Promise<any[]> {
        this.handShakeOptions = handShakeOptions;
        // TODO unix socket
        const opt: SocketConnectOpts = {
            port: this.port,
            host: this.host,
            noDelay: true
        };
        this.socket.connect(opt, () => {
            this.state = MAPI_STATE.CONNECTED;
            this.socket.setKeepAlive(true);
        });

        return once(this, 'ready');
    }

    ready(): boolean {
        return this.state === MAPI_STATE.READY;
    }

    disconnect(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.socket.end(() => {
                this.redirects = 0;
                this.state = MAPI_STATE.INIT;
                resolve(this.state === MAPI_STATE.INIT);
            });
        })
    }

    private login(challenge: string): void {
        const challengeParts = challenge.split(':');
        const [salt, identity, protocol, hashes, endian, algo, opt_level] = challengeParts;
        let password: string;
        try {
            password = createHash(algo).update(this.password).digest('hex');
        } catch(err) {
            console.error(err)
            this.emit('error', new TypeError(`Algorithm ${algo} not supported`));
            return;
        }
        let pwhash = null;
        // try hash algorithms in the order provided by the server
        for (const algo of hashes.split(',')) {
            try {
                const hash = createHash(algo);
                pwhash = `{${algo}}` + hash.update(password + salt).digest('hex');
                break;
            } catch {}
        }
        if (pwhash) {
            let counterResponse = `${endian}:${this.username}:${pwhash}:${this.language}:${this.database}:`;
            if (opt_level && opt_level.startsWith('sql=')) {
                let level = 0;
                counterResponse += 'FILETRANS:';
                try {
                    level = Number(opt_level.substring(4));
                } catch(err) {
                    this.emit('error', new TypeError('Invalid handshake options level in server challenge'));
                    return;
                }
                // process handshake options
                const options = [];
                for (const opt of this.handShakeOptions) {
                    if (opt.level < level) {
                        options.push(`${opt.name}=${Number(opt.value)}`);
                        opt.sent = true;
                    }
                }
                if (options)
                    counterResponse += options.join(',') + ':';
            }
            this.send(counterResponse);
        } else {
            this.emit('error', new TypeError(`None of the hashes ${hashes} are supported`));
        }
    }

    send(msg: string, callback?: (err?: Error) => void): void {
        if (msg)
            console.log(`Sending ${msg}`);
        let buff = Buffer.from(msg);
        let last = 0;
        let offset = 0;
        while (last === 0) {
            const seg = buff.subarray(offset, MAPI_BLOCK_SIZE);
            last = (seg.length < MAPI_BLOCK_SIZE) ? 1 : 0;
            const header = Buffer.allocUnsafe(2).fill(0);
            header.writeUint16LE((seg.length << 1) | last , 0);
            const outBuff = Buffer.concat([header, seg]);
            this.socket.write(outBuff, (err?: Error) => {
                if (last && callback)
                    callback(err);
            });
            offset += seg.length;
        }
    }

    private handleTimeout() {
        this.emit('error', new Error('Timeout'));
    }

    private handleSocketError(err: Error) {
        console.error(err);
    }

    private recv(data: Buffer): void {
        const offset = this.store.append(data);
        const bytesLeftOver = data.length - offset;
        if (this.store.isFull()) {
            this.handleResponse(this.store.drain());
        }
        if (bytesLeftOver) {
            const msg = `some ${bytesLeftOver} bytes left over!`;
            console.warn(msg);
            this.recv(data.subarray(offset));
        }
    }

    private handleResponse(resp: string): void {
        console.log(resp);
        if (resp.startsWith(MSG_ERROR)) {
            const err = new Error(resp.substring(1));
            this.emit('error', err);
        }

        if (this.state == MAPI_STATE.CONNECTED) {
            const isRedirect = resp.startsWith(MSG_REDIRECT);
            if (isRedirect) {
                this.redirects += 1;
                console.log('received redirect');
                if (this.redirects > MAX_REDIRECTS)
                   this.emit('error', new Error(`Exceeded max number of redirects ${MAX_REDIRECTS}`));
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

export { MapiConfig, MapiConnection, parseMapiUri, createMapiConfig, HandShakeOption };
