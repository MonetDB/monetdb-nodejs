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


    constructor(params: MapiConfig | MAPI_URI) {
        super();
        const config = (typeof params === 'string') ? parseMapiUri(params) : createMapiConfig(params);
        this.mapi = new MapiConnection(config);
        this.autoCommit = config.autoCommit;
        this.replySize = config.replySize;
    }

    connect(callback?: ConnectCallback): Promise<boolean> {
        const options = [
            new HandShakeOption(1, 'auto_commit', this.autoCommit, this.setAutocommit),
            new HandShakeOption(2, 'reply_size', this.replySize, this.setReplySize),
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
        if (stream && this.replySize !== -1)
            this.setReplySize(-1);
        return this.mapi.request(query, stream);
    }

    private command(str: string): Promise<any> {
        return this.mapi.request(str);
    }

    setAutocommit(v: boolean): Promise<boolean> {
        const cmd = `Xauto_commit ${Number(v)}`;
        return this.command(cmd).then(() => {
            this.autoCommit = v;
            return this.autoCommit;
        });
    }

    setReplySize(v: number): Promise<number> {
        const cmd = `Xreply_size ${Number(v)}`;
        return this.command(cmd).then(() => {
            this.replySize = Number(v);
            return this.replySize;
        });
    }

    setSizeHeader(v: boolean): Promise<boolean> {
        const cmd = `Xsizeheader ${Number(v)}`;
        return this.command(cmd).then(() => {
            this.sizeHeader = v;
            return this.sizeHeader;
        });
    }

    setTimezone(sec: number): Promise<any> {
        const qry = `SET TIME ZONE INTERVAL '${sec}' SECOND`;
        return this.execute(qry);
    }

    rollback(): Promise<any> {
        return this.execute('ROLLBACK')
    }

}

export default Connection;
