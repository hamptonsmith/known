import assert from 'assert';
import evaluate from './evaluate.mjs';
import util from 'util';

export function apply(x, bindings) {
    if (typeof x === 'function') {
        return (outsideBindings = {}) => x({ ...outsideBindings, ...bindings });
    }

    if (x === null || typeof x !== 'object') {
        return x;
    }

    if (x?.free) {
        return bindings[x.free] !== undefined ?
            apply(bindings[x.free], { ...bindings, [x.free]: undefined })
          : x;
    }

    if (Array.isArray(x)) {
        return x.map(el => apply(el, bindings));
    }

    return Object.fromEntries(Object.entries(x).map(([k, v]) => [
        k,
        apply(v, bindings)
    ]));
}

// Returns either a singleton array with one <Conditional Instantiation>, or an
// empty array if, after application and evaluation, there's an obvious
// contradiction.
export function applyAndEval(
    bindings,
    conditions,
    ctx,
    opts
) {
    assert(arguments.length === 3 || arguments.length === 4,
            'applyAndEval called with 3 or 4 arguments');

    opts = {
        bindingMap: (b) => b,
        ...opts
    };

    bindings = Object.fromEntries(Object.entries(bindings).map(
            ([k, v]) => [ k, evaluate(apply(v, bindings), ctx) ]));
    conditions = conditions.map(c => evaluate(apply(c, bindings), ctx))
            .filter(c => c !== true);

    return conditions.some(c => c === false)
            ? []
            : [ { bindings: opts.bindingMap(bindings), conditions } ];
}

export function arrayToCats(a, blah) {
    let result = blah ? a[a.length - 1] : null;
    if (blah) {
        a = a.slice(0, -1);
    }

    a = [ ...a ];
    a.reverse();
    for (const el of a) {
        result = { cat: [ el, result ] };
    }
    return result;
}

export function concreteBindingsOnly(b) {
    if (!b) {
        return b;
    }

    return Object.fromEntries(Object.entries(b).filter(([, v]) =>
            getFree(v).size === 0));
}

export function deast(o, assertType, defaultArg) {
    if (o === null || typeof o !== 'object' || Array.isArray(o)) {
        return [ null, defaultArg ];
    }

    const oKeys = Object.keys(o);

    if (oKeys.length !== 1) {
        return [ null, defaultArg ];
    }

    const k = oKeys[0];

    if (assertType && k !== assertType) {
        return [ null, defaultArg ];
    }

    return [ k, o[k] ];
}

function dodgeVar(original, varSet) {
    if (!varSet.has(original)) {
        return original;
    }

    let i = 2;
    while (varSet.has(`${original}${i}`)) {
        i++;
    }

    return `${original}${i}`;
}

export function dodgeVars(x, varSet) {
    varSet = new Set(varSet);

    const xFree = getFree(x);

    const renames = {};
    const inverse = {};

    for (const v of new Set(varSet)) {
        if (xFree.has(v)) {
            const newName = dodgeVar(v, varSet);
            renames[v] = { free: newName };
            inverse[newName] = { free: v };
            varSet.add(v);
        }
    }

    return [ apply(x, renames), renames, inverse ];
}

export function getFree(ast, accum = new Set()) {
    if (ast?.free) {
        accum.add(ast.free);
        return accum;
    }

    if (Array.isArray(ast)) {
        for (const el of ast) {
            getFree(el, accum);
        }

        return accum;
    }

    if (typeof ast === 'object' && ast !== null) {
        for (const v of Object.values(ast)) {
            getFree(v, accum);
        }

        return accum;
    }

    return accum;
}

export function indent(level, ...args) {
    let space = '';
    for (let i = 0; i < level; i++) {
        space += '    ';
    }

    let out = '';
    for (const a of args) {
        if (out !== '') {
            out += ' ';
        }

        out += nodeUtil.inspect(a, { depth: Infinity });
    }

    return out.split('\n').map(line => space + line).join('\n');
}

export function pushAll(target, source) {
    for (const x of source) {
        target.push(x);
    }
}
