import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { cwd } from 'node:process';


class FileUploader {
    mapi: any;
    file: string;
    mode: string;
    offset: number;
    chunkSize: number;
    fhandle?: fs.FileHandle;

    private resolve: (v?: any) => void;
    private reject: (err?: Error) => void;
    
    constructor(mapi: any, file: string, mode: string='r', offset: number = 0) {
        this.mapi = mapi;
        this.file = file;
        this.mode = mode;
        this.offset = offset;
        // configurable?
        this.chunkSize = 1024 * 1024;
    }

    async upload(): Promise<any> {
        if (this.fhandle === undefined) {
            // for security we do expect file
            // to be relative to cwd
            this.fhandle = await fs.open(path.join(cwd(), this.file), this.mode);
        }
        return this.sendChunk();
    }

    private async sendChunk(): Promise<any> {
        const { bytesRead, buffer } = await this.fhandle.read(Buffer.alloc(this.chunkSize), 0, this.chunkSize);
        if (bytesRead > 0) {
            const ok = await this.mapi.send(buffer.subarray(bytesRead));
            return new Promise((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;
            });
        }
        // reached EOF
        if (this.resolve)
            return this.resolve();
        return Promise.resolve();
    }

}

export { FileUploader };
