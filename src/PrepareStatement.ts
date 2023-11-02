import { MapiConnection, QueryResult } from './mapi';
import { convert } from './monetize';

class PrepareStatement {
    id: number;
    rowCnt: number;
    columnCnt: number;
    mapi: MapiConnection;
    data: any[]; 
    constructor(res: QueryResult, mapi: MapiConnection) {
        this.id = res.id;
        this.rowCnt = res.rowCnt;
        this.columnCnt = res.columnCnt;
        this.data = res.data; // columns and placeholder columns info
        this.mapi = mapi;
    }

    execute(...args: any[]): Promise<any> {
        const colInfo = this.data.slice(-args.length);
        const placeholders = args.map((arg, i) => {
            const type = colInfo[i][0];
            const digits = colInfo[i][1];
            const scale = colInfo[i][2];
            return convert(type, arg, digits, scale);
        })
        const query = `sEXECUTE ${this.id}(${placeholders.join(', ')});\n`;
        return this.mapi.request(query);
    }

    release(): Promise<any> {
        const stmt = `sDEALLOCATE ${this.id};\n`;
        return this.mapi.request(stmt);
    }

}

export default PrepareStatement;
