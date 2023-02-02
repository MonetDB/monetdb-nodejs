import { Socket, SocketConnectOpts } from 'node:net';
import { once, EventEmitter, Abortable } from 'events';
import { Buffer } from 'buffer';
import { createHash } from 'node:crypto';
import defaults from './defaults';
import { FileUploader } from './file-transfer';

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
    CONTROL='control' // ? Not implemented
}

interface MapiConfig {
    database: string;
    username?: string;
    password?: string;
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
    throw new Error(`Invalid MAPI URI ${uri}!`);
}

// validates and sets defaults on missing properties
function createMapiConfig(params: MapiConfig): MapiConfig {
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
        throw new TypeError(`${host} is not valid hostname`);
    }
    const port = (params && params.port)? Number(params.port) : Number(defaults.port);
    if (isNaN(port)) {
        throw new TypeError(`${port} is not valid port`);
    }

    const timeout = (params && params.timeout)? Number(params.timeout) : undefined;
    if (timeout && isNaN(timeout)) {
        throw new TypeError('timeout must be number');
    }
    const language = (params && params.language)? params.language : MAPI_LANGUAGE.SQL;
    const autoCommit = params.autoCommit || defaults.autoCommit;
    const replySize = params.replySize || defaults.replySize;

    return {database, username, password, language, host, port, timeout, unixSocket, autoCommit, replySize};
}

class Column {
    table: string;
    name: string;
    type: string;
    length?: number;
    index?: number;
    constructor(table: string, name: string, type: string, index?: number, length?: number) {
        this.table = table;
        this.name = name;
        this.type = type;
        this.index = index;
        this.length = length;
    }
}


type QueryResult = {
    id?: number;
    type?: string;
    queryId?: number;
    rowCnt?: number;
    affectedRowCnt?: number;
    columnCnt?: number;
    queryTime?: number; // microseconds
    sqlOptimizerTime?: number;  // microseconds
    malOptimizerTime?: number; // microseconds
    columns?: Column[];
    headers?: ResponseHeaders;
    data?: any[];
}

class QueryStream extends EventEmitter {
    constructor() {
        super();
    }

    end(res?: QueryResult) {
        this.emit('end', res);
    }
}


function parseHeaderLine(hdrLine: string): Object {
    if (hdrLine.startsWith(MSG_HEADER)) {
        const [head, tail] = hdrLine.substring(1).trim().split('#');
        let res = {};
        const vals = head.trim().split(',\t');
        switch(tail.trim()) {
            case 'table_name':
                res = {tableNames: vals};
                break;
            case 'name':
                res = {columnNames: vals};
                break;
            case 'type':
                res = {columnTypes: vals};
                break;
            default:
                res = {};
        }
        return res;
    }
    throw TypeError('Invalid header format!');
}


function parseTupleLine(line: string, types: string[]): any[] {
    if (line.startsWith(MSG_TUPLE) && line.endsWith(']')) {
        var resultline = [];
        var cCol = 0;
        var curtok = '';
        var state = 'INCRAP';
        let endQuotes = 0;
        /* mostly adapted from clients/R/MonetDB.R/src/mapisplit.c */
        for (var curPos = 2; curPos < line.length - 1; curPos++) {
            var chr = line.charAt(curPos);
            switch (state) {
                case 'INCRAP':
                    if (chr != '\t' && chr != ',' && chr != ' ') {
                        if (chr == '"') {
                            state = 'INQUOTES';
                        } else {
                            state = 'INTOKEN';
                            curtok += chr;
                        }
                    }
                    break;
                case 'INTOKEN':
                    if (chr == ',' || curPos == line.length - 2) {
                        if (curtok == 'NULL' && endQuotes === 0) {
                            resultline.push(null);

                        } else {
                            switch(types[cCol]) {
                                case 'boolean':
                                    resultline.push(curtok == 'true');
                                    break;
                                case 'tinyint':
                                case 'smallint':
                                case 'int':
                                case 'wrd':
                                case 'bigint':
                                    resultline.push(parseInt(curtok));
                                    break;
                                case 'real':
                                case 'double':
                                case 'decimal':
                                    resultline.push(parseFloat(curtok));
                                    break;
                                case 'json':
                                    try {
                                        resultline.push(JSON.parse(curtok));
                                    } catch(e) {
                                        resultline.push(curtok);
                                    }
                                    break;
                                default:
                                    // we need to unescape double quotes
                                    //valPtr = valPtr.replace(/[^\\]\\"/g, '"');
                                    resultline.push(curtok);
                                    break;
                            }
                        }
                        cCol++;
                        state = 'INCRAP';
                        curtok = '';
                        endQuotes = 0;
                    } else {
                        curtok += chr;
                    }
                    break;
                case 'ESCAPED':
                    state = 'INQUOTES';
                    switch(chr) {
                        case 't': curtok += '\t'; break;
                        case 'n': curtok += '\n'; break;
                        case 'r': curtok += '\r'; break;
                        default: curtok += chr;
                    }
                    break;
                case 'INQUOTES':
                    if (chr == '"') {
                        state = 'INTOKEN';
                        endQuotes++;
                        break;
                    }
                    if (chr == '\\') {
                        state = 'ESCAPED';
                        break;
                    }
                    curtok += chr;
                    break;
            }
        }
        return resultline;
    }
    throw TypeError('Invalid tuple format!');
}


interface ResponseCallbacks {
    resolve: (v: QueryResult | QueryStream | Promise<any>) => void;
    reject: (err: Error) => void;
}

interface ResponseHeaders {
    tableNames?: string[];
    columnNames?: string[];
    columnTypes?: string[];
}


class Response {
    buff: Buffer;
    offset: number;
    parseOffset: number;
    stream: boolean;
    settled: boolean;
    segments: Segment[];
    result?: QueryResult;
    callbacks?: ResponseCallbacks;
    queryStream?: QueryStream;
    headers?: ResponseHeaders;

    constructor(stream: boolean=false, callbacks?: ResponseCallbacks) {
        this.buff = Buffer.allocUnsafe(MAPI_BLOCK_SIZE).fill(0);
        this.stream = stream;
        this.offset = 0;
        this.parseOffset = 0;
        this.segments = [];
        this.settled = false;
        this.callbacks = callbacks;
        if (stream) {
            this.queryStream = new QueryStream();
            if (callbacks && callbacks.resolve)
                callbacks.resolve(this.queryStream);
        }
    }

    append(data: Buffer): number {
        let srcStartIndx = 0;
        let srcEndIndx = srcStartIndx + data.length;
        const l = this.segments.length;
        let segment = (l > 0 && this.segments[l - 1]) || undefined;
        let bytesCopied = 0;
        let bytesProcessed = 0;
        if (!this.complete()) {
            // check if out of space
            if ((this.buff.length - this.offset) < data.length) {
                const bytes = this.expand(MAPI_BLOCK_SIZE);
                // console.log(`expanding by ${bytes} bytes!`);
            }

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
                bytesProcessed = MAPI_HEADER_SIZE + bytesCopied;
            } else {
                const byteCntToRead = segment.bytes - segment.bytesOffset;
                srcEndIndx = srcStartIndx + byteCntToRead;
                bytesCopied = data.copy(this.buff, this.offset, srcStartIndx, srcEndIndx);
                this.offset += bytesCopied;
                segment.bytesOffset += bytesCopied;
                // console.log(`segment is full ${segment.bytesOffset === segment.bytes}`);
                bytesProcessed = bytesCopied;
            }
            if (this.isQueryResponse()) {
                const tuples = [];
                const firstPackage = this.parseOffset === 0;
                this.parseOffset += this.parse(this.toString(this.parseOffset), tuples);
                if (tuples.length > 0) {
                    if (this.queryStream) {
                        // emit header once
                        if (firstPackage && this.result && this.result.columns) {
                            this.queryStream.emit('header', this.result.columns);
                        }
                        // emit tuples
                        this.queryStream.emit('data', tuples);
                    } else {
                        this.result.data = this.result.data || [];
                        for (let t of tuples) {
                            this.result.data.push(t);
                        }
                    }
                }
            }
        }
        return bytesProcessed;
    }

    complete(): boolean {
        const l = this.segments.length;
        if (l > 0) {
            const segment = this.segments[l-1];
            return segment.last && segment.isFull();
        }
        return false;
    }

    private expand(byteCount: number): number {
        const buff = Buffer.allocUnsafe(this.buff.length + byteCount).fill(0);
        const bytesCopied = this.buff.copy(buff);
        this.buff = buff;
        // should be byteCount
        return this.buff.length - bytesCopied;
    }

    private firstCharacter(): string {
        return this.buff.toString('utf8', 0, 1);
    }

    errorMessage(): string {
        if (this.firstCharacter() === MSG_ERROR) {
            return this.buff.toString('utf8', 1);
        }
        return '';
    }

    isFileTransfer(): boolean {
        return this.toString().startsWith(MSG_FILETRANS);
    }

    isPrompt(): boolean {
        // perhaps use toString
        return this.complete() && this.firstCharacter() === '\x00';
    }

    isRedirect(): boolean {
        return this.firstCharacter() === MSG_REDIRECT;
    }

    isQueryResponse(): boolean {
        if (this.result && this.result.type) {
            return this.result.type.startsWith(MSG_Q);
        }
        return this.firstCharacter() === MSG_Q;
    }

    isMsgMore(): boolean {
        // server wants more ?
        return this.toString().startsWith(MSG_MORE);
    }

    toString(start?: number) {
        const res = this.buff.toString('utf8', 0, this.offset);
        if (start)
            return res.substring(start);
        return res;
    }

    settle(res?: Promise<any>): void {
        if (this.settled === false && this.complete()) {
            const err: string = this.errorMessage();
            if (this.queryStream) {
                if (err)
                    this.queryStream.emit('error', new Error(err));
                this.queryStream.end();
            } else {
                if (this.callbacks) {
                    if (err) {
                        this.callbacks.reject(new Error(err));
                    } else {
                        this.callbacks.resolve(res || this.result);
                    }
                }
            }
            this.settled = true;
        }
    }

    parse(data: string, res: any[]): number {
        let offset = 0;
        const lines = data.split('\n').length;
        if (this.isQueryResponse()) {
            let eol = data.indexOf('\n');
            this.result = this.result || {};
            // process 1st line
            if (this.result.type === undefined && data.startsWith(MSG_Q) && lines > 5) {
                const line = data.substring(0, eol);
                this.result.type = line.substring(0, 2);
                const rest = line.substring(3).trim().split(' ');
                if (this.result.type === MSG_QTABLE) {
                    const [id, rowCnt, columnCnt,
                        rows, queryId, queryTime,
                        malOptimizerTime, sqlOptimizerTime] = rest;
                    this.result.id = parseInt(id);
                    this.result.rowCnt = parseInt(rowCnt);
                    this.result.columnCnt = parseInt(columnCnt);
                    this.result.queryId = parseInt(queryId);
                    this.result.queryTime = parseInt(queryTime);
                    this.result.malOptimizerTime = parseInt(malOptimizerTime);
                    this.result.sqlOptimizerTime = parseInt(sqlOptimizerTime);
                } else if(this.result.type === MSG_QUPDATE) {
                    const [affectedRowCnt, autoIncrementId, queryId,
                        queryTime, malOptimizerTime, sqlOptimizerTime] = rest;
                    this.result.affectedRowCnt = parseInt(affectedRowCnt);
                    this.result.queryId = parseInt(queryId);
                    this.result.queryTime = parseInt(queryTime);
                    this.result.malOptimizerTime = parseInt(malOptimizerTime);
                    this.result.sqlOptimizerTime = parseInt(sqlOptimizerTime);
                } else if(this.result.type === MSG_QSCHEMA) {
                    const [queryTime, malOptimizerTime] = rest;
                    this.result.queryTime = parseInt(queryTime);
                    this.result.malOptimizerTime = parseInt(malOptimizerTime);
                } else if(this.result.type === MSG_QTRANS) {
                    // skip
                } else if(this.result.type === MSG_QPREPARE) {
                    const [id, rowCnt, columnCnt, rows] = rest;
                    this.result.id = parseInt(id);
                    this.result.rowCnt = parseInt(rowCnt);
                    this.result.columnCnt = parseInt(columnCnt);
                }

                if (this.headers === undefined && (data.charAt(eol + 1) === MSG_HEADER)) {
                    let headers: ResponseHeaders = {};
                    while(data.charAt(eol + 1) === MSG_HEADER) {
                        const hs = eol + 1;
                        eol = data.indexOf('\n', hs);
                        headers = {...headers, ...parseHeaderLine(data.substring(hs, eol))};
                    }
                    this.headers = headers;
                    const colums: Column[] = [];
                    for (let i=0; i<this.result.columnCnt; i++) {
                        const table = headers.tableNames && headers.tableNames[i];
                        const name = headers.columnNames && headers.columnNames[i];
                        const type = headers.columnTypes && headers.columnTypes[i];
                        colums.push({
                            table,
                            name,
                            type,
                            index: i
                        });
                    }
                    this.result.columns = colums;
                }
            }
            offset = eol + 1;
            let ts: number = undefined; // tuple index
            if (data.startsWith(MSG_TUPLE)) {
                ts = 0;
            } else if (data.charAt(eol + 1) === MSG_TUPLE) {
                ts = eol + 1;
                eol = data.indexOf('\n', ts);
            }
            if (ts !== undefined && eol > 0) {
                // we have a data row
                do {
                    offset = eol + 1;
                    const tuple = parseTupleLine(data.substring(ts, eol), this.headers.columnTypes);
                    res.push(tuple);
                    if (data.charAt(eol + 1) === MSG_TUPLE) {
                        ts = eol + 1;
                        eol = data.indexOf('\n', ts);
                    } else {
                        ts = undefined;
                    }
                } while (ts && (eol > -1));
            }
        }
        return offset;
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
    queue: Response[];

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
            //console.log('socket close event');
            this.emit('end');
        });
        this.redirects = 0;
        this.queue = [];
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
            let counterResponse = `LIT:${this.username}:${pwhash}:${this.language}:${this.database}:`;
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
            this.send(Buffer.from(counterResponse), (err) => {
                if (err) {
                    this.emit('error', err);
                } else {
                    this.queue.push(new Response());
                }
            });
        } else {
            this.emit('error', new TypeError(`None of the hashes ${hashes} are supported`));
        }
    }

    send(buff: Buffer, callback?: (err?: Error) => void): void {
        let last = 0;
        let offset = 0;
        while (last === 0) {
            const seg = buff.subarray(offset, offset + MAPI_BLOCK_SIZE);
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

    request(sql: string, stream:boolean=false): Promise<QueryResult|QueryStream> {
        if (this.ready() === false)
            throw new Error('Not Connected');
        return new Promise((resolve, reject) => {
            this.send(Buffer.from(sql), (err?: Error) => {
                if (err) {
                    reject(err);
                } else {
                    const resp = new Response(stream, {resolve, reject});
                    this.queue.push(resp)
                }
            });
        });
    }

    private recv(data: Buffer): void {
        console.log(data.toString('utf8', 2));
        let bytesLeftOver: number;
        let resp: Response;
        // process queue left to right, find 1st uncomplete response
        // remove responses that are completed
        while(this.queue.length) {
            const next = this.queue[0];
            if (next.complete()) {
                this.queue.shift();
            } else {
                resp = next;
                break;
            }
        }
        if (resp === undefined && (this.queue.length === 0)) {
            // must be a challenge message
            // possibly after redirect
            resp = new Response();
            this.queue.push(resp);
        }
        const offset = resp.append(data);
        if (resp.complete())
            this.handleResponse(resp);
        bytesLeftOver = data.length - offset;
        if (bytesLeftOver) {
            const msg = `some ${bytesLeftOver} bytes left over!`;
            console.warn(msg);
            this.recv(data.subarray(offset));
        }
    }

    private handleResponse(resp: Response): void {

        if (this.state == MAPI_STATE.CONNECTED) {
            const err = resp.errorMessage();
            if (err) {
                this.emit('error', new Error(err));
                return;
            }
            if (resp.isRedirect()) {
                this.redirects += 1;
                if (this.redirects > MAX_REDIRECTS)
                   this.emit('error', new Error(`Exceeded max number of redirects ${MAX_REDIRECTS}`));
                return;
            }
            if (resp.isPrompt()) {
                console.log('login OK');
                this.state = MAPI_STATE.READY;
                this.emit('ready', this.state);
                return;
            }
            return this.login(resp.toString());
        }

        if (resp.isFileTransfer()) {
            let fhandler: any;
            const msg = resp.toString(MSG_FILETRANS.length).trim();
            let mode: string, offset: string, file: string;
            if (msg.startsWith('r ')) {
                [mode, offset, file] = msg.split(' ');
                try {
                    fhandler = resp.fhandler || new FileUploader(this, file, mode, parseInt(offset));
                    return resp.settle(fhandler.upload());
                } catch(err) {
                    resp.settle(Promise.reject(err));
                }

            } else if (msg.startsWith('rb')) {
                [mode, file] = msg.split(' ');
            } else if (msg.startsWith('w')) {
                [mode, file] = msg.split(' ');
            } else {
                // invalid msg
                // settle with err, throw err?
            }
            
        }

        resp.settle();
    }
}

export { MapiConfig, MapiConnection, parseMapiUri, createMapiConfig, HandShakeOption, QueryResult };
