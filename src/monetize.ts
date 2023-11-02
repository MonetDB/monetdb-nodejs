function monetEscape(v: any): string {
    let s = String(v).replace("\\", "\\\\");
    s = s.replace("\'", "\\\'");
    return `'${s}'`;
}

function monetDecimal(v: number, digits?: number, scale?: number): string {
    if (digits && scale)
        return `cast(${monetEscape(v)} as decimal(${digits}, ${scale}))`;
    return `cast(${monetEscape(v)} as decimal)`;
}


function monetDate(v: string): string {
    return `DATE${monetEscape(v)}`;
}


function monetTime(v: string): string {
    return `TIME${monetEscape(v)}`;
}


function monetTimestamp(v: string): string {
    return `TIMESTAMP${monetEscape(v)}`;
}


function monetTimestampZone(v: string): string {
    return `TIMESTAMPZ${monetEscape(v)}`;
}


function monetUUID(v: string): string {
    return `UUID${monetEscape(v)}`;
}


function convert(type: string, v: any, digits?: number, scale?: number): any {
    switch(type) {
        case "smallint":
        case "int":
        case "bigint":
        case "hugeint":
        case "double":
        case "float":
            return Number(v);
        case "decimal":
            return monetDecimal(v, digits, scale);
        case "boolean":
            return Boolean(v);
        case "date":
            return monetDate(v);
        case "time":
            return monetTime(v);
        case "timestamp":
            return monetTimestamp(v);
        case "timestampz":
            return monetTimestampZone(v);
        case "uuid":
            return monetUUID(v);
        default:
            return monetEscape(v);
    }
}

export {convert}
