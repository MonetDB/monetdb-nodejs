import { EventEmitter} from 'events';
import { MapiConfig, MapiConnection,
    parseMapiUri, createMapiConfig, HandShakeOption } from './mapi';

// MAPI URI:
//  tcp socket:  mapi:monetdb://[<username>[:<password>]@]<host>[:<port>]/<database>
//  unix domain socket: mapi:monetdb:///[<username>[:<password>]@]path/to/socket?database=<database>
type MAPI_URI = string;

type ConnectCallback = (err?: Error) => void;


class Connection extends EventEmitter {
    autoCommit?: boolean;
    replySize?: number;
    sizeHeader?: boolean;
    mapi: MapiConnection;


    constructor(params?: MapiConfig | MAPI_URI) {
        super();
        const config = (typeof params === 'string') ? parseMapiUri(params) : createMapiConfig(params);
        this.mapi = new MapiConnection(config);
    }

    connect(callback?: ConnectCallback): Promise<boolean> {
        const options = [
            new HandShakeOption(1, 'auto_commit', false, this.setAutocommit),
            new HandShakeOption(2, 'reply_size', 100, this.setReplySize),
            new HandShakeOption(3, 'size_header', true, this.setSizeHeader),
            new HandShakeOption(5, 'time_zone', (new Date().getTimezoneOffset()*60), this.setTimezone)
        ];
        const mapi = this.mapi;
        return new Promise(async function(resolve, reject) {
            try {
                await mapi.connect(options);
                resolve(mapi.ready());
                if (callback)
                    callback();
            } catch(err) {
                reject(err);
                if (callback)
                    callback(err);
            }
        });
    }

    close(): Promise<boolean> {
        return this.mapi.disconnect();
    }

    execute(sql: string, stream: boolean = false): Promise<any> {
        const query = `s${sql};\n`;
        return this.mapi.request(query, stream);
    }

    private command(str: string): void {
        return this.mapi.send(str);
    }

    setAutocommit(v: boolean): void {
        const cmd = `Xauto_commit ${Number(v)}`;
        this.command(cmd);
        this.autoCommit = v;
    }

    setReplySize(v: number) {
        const cmd = `Xreply_size ${Number(v)}`;
        this.command(cmd);
        this.replySize = Number(v);
    }

    setSizeHeader(v: boolean) {
        const cmd = `Xsizeheader ${Number(v)}`;
        this.command(cmd);
        this.sizeHeader = v;
    }

    setTimezone(sec: number) {
        const qry = `SET TIME ZONE INTERVAL '${sec}' SECOND`;
        return this.execute(qry);
    }

}

export default Connection;
