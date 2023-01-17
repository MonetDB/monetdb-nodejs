import { EventEmitter, Abortable } from 'events';

class QueryStream extends EventEmitter {
    constructor() {
        super();
    }

    end(res?: any) {
        this.emit('end');
    }
}

export default QueryStream;
