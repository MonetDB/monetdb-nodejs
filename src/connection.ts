import { once, EventEmitter, Abortable } from 'events';
import { MapiConfig, MapiConnection, parseMapiUri, createMapiConfig } from './mapi';

// MAPI URI:
//  tcp socket:  mapi:monetdb://[<username>[:<password>]@]<host>[:<port>]/<database>
//  unix domain socket: mapi:monetdb:///[<username>[:<password>]@]path/to/socket?database=<database>
type MAPI_URI = string;

type ConnectCallback = (err?: Error) => void;


class Connection extends EventEmitter {
    autoCommit: boolean;
    mapi: MapiConnection;


    constructor(params?: MapiConfig | MAPI_URI) {
        super();
        const config = (typeof params === 'string') ? parseMapiUri(params) : createMapiConfig(params);
        this.mapi = new MapiConnection(config);
    }

    connect(callback?: ConnectCallback): Promise<boolean> {
        // TODO hand shake options
        const options = [

        ];
        const mapi = this.mapi;
        return new Promise(async function(resolve, reject) {
            try {
                await mapi.connect();
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

    close() {
        return this.mapi.disconnect();
    }

    execute(query: string) {
        return this.command(`s${query}\n;`);
    }

    private command(str: string): void {
        return this.mapi.send(str);
    }

}

export default Connection;
