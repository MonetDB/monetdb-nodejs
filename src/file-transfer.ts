import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { cwd } from 'node:process';


class FileHandler {
    mapi: any;
    file: string;
    state: string;
    err?: string;
    fhandle?: fs.FileHandle;
    resolve?: (v?: any) => void;
    reject?: (err?: Error) => void;

    constructor(mapi: any, file: string) {
        this.mapi = mapi;
        this.file = file;
        this.state = 'init';
    }

    async close(): Promise<void> {
        if (this.fhandle) {
            this.state = 'closed';
            await this.fhandle.close();
            this.fhandle = undefined;
        }
    }

    protected makePromise(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }

    ready(): boolean {
        return this.fhandle !== undefined 
            && this.err === undefined 
            && this.state === 'ready';
    }
}


class FileDownloader extends FileHandler {

    constructor(mapi: any, file: string) {
        super(mapi, file);
    }

    async download(): Promise<void> {
        if (this.fhandle === undefined) {
            // for security reasons we do 
            // expect file to be relative to cwd
            const fpath = path.join(cwd(), this.file);
            if (fpath.startsWith(cwd())) {
                try {
                    this.fhandle = await fs.open(fpath, 'w');
                } catch (err) {
                    await this.mapi.requestFileTransferError(`${err}\n`, this);
                    return this.makePromise();
                }
                // tell server we are okay with the download
                // send magic new line
                await this.mapi.requestFileTransfer(Buffer.from('\n'), this);
                this.state = 'ready';
                return this.makePromise();
            } else {
                // send err msg
                await this.mapi.requestFileTransferError('Forbidden\n', this);
                return this.makePromise();
            }
        }

    }


    async writeChunk(data: Buffer): Promise<number> {
        let bytes = 0;
        if (this.fhandle) {
            try {
                const { bytesWritten, buffer } = await this.fhandle.write(data);
                bytes += bytesWritten;
            } catch(err) {
                this.err = err;
                throw err;
            }
        }
        return bytes;
    }

}


class FileUploader extends FileHandler {
    skip: number;
    bytesSent: number;
    chunkSize: number;
    eof: boolean;
    
    constructor(mapi: any, file: string, skip: number = 0) {
        super(mapi, file);
        this.skip = skip;
        this.bytesSent = 0;
        // configurable?
        this.chunkSize = 1024 * 1024;
    }

    async upload(): Promise<void> {
        if (this.fhandle === undefined) {
            // for security reasons we do 
            // expect file to be relative to cwd
            const fpath = path.join(cwd(), this.file);
            if (fpath.startsWith(cwd())) {
                try {
                    this.fhandle = await fs.open(fpath, 'r');
                } catch(err) {
                    await this.mapi.requestFileTransferError(`${err}\n`, this);
                    return this.makePromise();
                }
                // tell server we are okay with the upload
                // send magic new line
                await this.mapi.requestFileTransfer(Buffer.from('\n'), this);
                this.eof = false;
                this.state = 'ready';
                return this.makePromise();
            } else {
                // send err msg
                await this.mapi.requestFileTransferError('Forbidden\n', this);
                return this.makePromise();
            }
        }
        return this.sendChunk();
    }

    private async sendChunk(): Promise<void> {
        const { bytesRead, buffer } = await this.fhandle.read(Buffer.alloc(this.chunkSize), 0, this.chunkSize);
        if (bytesRead > 0) {
            // console.log(`read ${bytesRead} bytes`)
            await this.mapi.requestFileTransfer(buffer.subarray(0, bytesRead), this);
            this.bytesSent += bytesRead;
            // console.log(`sent ${bytesRead} bytes`)
        } else {
            // reached EOF
            this.eof = true;
            console.log(`reached eof`);
            // send empty block to indicate end of upload
            await this.mapi.requestFileTransfer(Buffer.from(''), this);
        }
    }
}

export { FileUploader, FileDownloader };

