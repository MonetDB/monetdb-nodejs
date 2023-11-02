
const defaults = {
    host: process.env.MAPI_HOST || 'localhost',
    port: process.env.MAPI_PORT || 50000,
    username: process.env.MAPI_USER || 'monetdb',
    password: process.env.MAPI_PASSWORD || 'monetdb',
    database: process.env.MAPI_DATABASE,
    autoCommit: false,
    replySize: 100,
};

export default defaults;

