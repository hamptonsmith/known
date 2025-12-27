import util from 'util';

let debug = false;
let level = 0;
let marginNeed = 0;

function maybeMargin(need) {
    if (need >= marginNeed) {
        console.log();
    }

    marginNeed = need;
}

export function withDebug(enable, fn) {
    if (typeof enable === 'function') {
        fn = enable;
        enable = true;
    }

    if (enable) {
        debug = true;

        try {
            return fn();
        }
        finally {
            debug = false;
        }
    }

    return fn();
}

function augmentForInspection(o) {
    if (Array.isArray(o)) {
        return o.map(el => augmentForInspection(el));
    }

    if (typeof o !== 'object' || o === null) {
        return o;
    }

    if (o instanceof Set || o instanceof Map) {
        return o;
    }

    const entries = Object.entries(o);
    if (entries.length === 1) {
        const [ k, v ] = entries[0];
        return {
            [util.inspect.custom]: function () {
                if (Array.isArray(v)) {
                    return `${k}(${v.map(el => inspect(el)).join(', ')})`;
                }

                return `${k}(${inspect(v)})`;
            }
        };
    }

    return Object.fromEntries(
            entries.map(([k, v]) => [k, augmentForInspection(v)]));
}

function inspect(o) {
    if (typeof o === 'string') {
        return o;
    }

    return util.inspect(augmentForInspection(o), { colors: true, depth: Infinity });
}

export function print(...args) {
    if (!debug) { return; }

    maybeMargin(1);
    console.log(args
            .map(a => inspect(a)).join(' ')
            .split('\n')
            .map(line => `${indent()}${line}`)
            .join('\n'));
}

export function push(...args) {
    if (!debug) {
        return args[args.length - 1]();
    }

    if (level >= 500) {
        print('recursion too deep');
        process.exit(1);
    }

    const tab = indent();
    const bar = extend('====', 80 - tab.length);

    maybeMargin(2);
    console.log(tab + bar);
    level++;
    print(...(args.slice(0, -1)));
    level--;
    console.log(tab + bar);
    level++;
    let result = args[args.length - 1]();
    level--;
    maybeMargin(2);
    console.log(tab + extend('----', 80 - tab.length));
    level++;
    print(result);
    level--;
    console.log(tab + extend('----', 80 - tab.length));

    return result;
}

function extend(c, length) {
    let result = '';

    while (result.length < length) {
        result += c;
    }

    return result;
}

function indent() {
    return extend('    ', level * 4);
}
