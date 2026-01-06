import assert from 'assert';
import * as debug from './debug.mjs';
import deepEqual from 'deep-equal';
import evaluate from './evaluate.mjs';
import nodeUtil from 'util';
import * as utils from './utils.mjs';

const rules2 = {
    diff(arg, argIndex, otherExp) {
        return this.sum([arg[0], -arg[1]], argIndex, otherExp);
    },
    eq: (arg, argIndex, otherExp) => {
        if (otherExp === true) {
            return [ arg[argIndex], arg[argIndex === 0 ? 1 : 0] ];
        }

        const [ otherOp, otherArg ] = utils.deast(otherExp, 'eq');

        if (!otherOp) {
            return;
        }

        return [ arg[argIndex], otherArg[argIndex] ];
    },
    free: (arg, argIndex, otherExp) => {
        return [ { free: arg }, otherExp ];
    },
    sum: (arg, argIndex, otherExp) => {
        return [
            arg[argIndex],
            { diff: [ otherExp, arg[argIndex === 0 ? 1 : 0] ] }
        ];
    }
};

export function solveFor(...args) {
    return debug.push(
            'solveFor', ...args.slice(0, -1), () => _solveFor(...args));
}

export function solveForAll(template, target, ctx) {
    const free = utils.getFree(template);

    const binding = {};
    for (const v of free) {
        binding[v] = solveFor(template, target, v, ctx);

        if (binding[v] === undefined) {
            return false;
        }
    }

    return binding;
}

function tryPath(eqLeft, eqRight, targetVar, path, ctx) {
    path = [ ...path ];

    while (path.length > 0) {
        debug.print('solve', eqLeft, '=', eqRight, path);

        const component = path.shift();

        const oldEqLeft = eqLeft;
        let [ eqLeftOp, eqLeftArg ] = utils.deast(eqLeft);

        if (eqLeftOp) {
            assert(component === eqLeftOp, `${nodeUtil.inspect(component)} = ${nodeUtil.inspect(eqLeftOp)}`);
            let argIndex;
            if (typeof path[0] === 'number') {
                argIndex = path[0];
            }

            if (Array.isArray(eqLeftArg)) {
                eqLeftArg = eqLeftArg.map(x => evaluate(x, ctx));
            }
            else {
                eqLeftArg = evaluate(eqLeftArg, ctx);
            }

            const [ newEqLeft, newEqRight ] =
                    rules2[eqLeftOp]?.(eqLeftArg, argIndex, eqRight) ?? [];

            debug.print('newEqLeft', eqLeftOp, newEqLeft);

            if (newEqLeft) {
                eqLeft = newEqLeft;
                eqRight = newEqRight;
                path.shift();
            }
        }

        if (eqLeft === oldEqLeft) {
            if (typeof eqRight === 'object'
                    && eqRight !== null
                    && Array.isArray(eqLeft) === Array.isArray(eqRight)
                    && eqLeft?.length === eqRight?.length
            ) {
                const eqLeftCopy = utils.shallowCopy(eqLeft);
                const eqRightCopy = utils.shallowCopy(eqRight);

                eqLeftCopy[component] = undefined;
                eqRightCopy[component] = undefined;

                if (deepEqual(eqLeftCopy, eqRightCopy)) {
                    eqLeft = eqLeft[component];
                    eqRight = eqRight[component];
                }
                else {
                    return undefined
                }
            }
            else {
                return undefined;
            }
        }
    }

    if (eqLeft?.free !== targetVar) {
        throw new Error('Snuh? '
                + nodeUtil.inspect(eqLeft) + ' ' + nodeUtil.inspect(eqRight));
    }

    return eqRight;
}

function _solveFor(eqLeft, eqRight, targetVar, ctx) {
    assert(arguments.length === 4, 'solveFor called with 4 arguments');

    const paths = find({ eq: [ eqLeft, eqRight ] }, targetVar)

        // We introduced two helper levels above--the { eq } level, and the
        // array holding its arguments. Remove those from the path as we process.
        .map(p => p.slice(2));

    debug.print('paths', targetVar, paths);

    for (const p of paths) {
        const result = tryPath(eqLeft, eqRight, targetVar, p, ctx);

        if (result !== undefined) {
            return result;
        }
    }

    return undefined;
}

export function isSolvableAst(o) {
    const [ op ] = utils.deast(o);

    return op && rules2[op];
}

function find(exp, targetVar, path = []) {
    if (exp?.free === targetVar) {
        return [ [...path] ];
    }

    if (typeof exp !== 'object' || exp === null) {
        return [];
    }

    const array = Array.isArray(exp);
    if (!array && !isSolvableAst(exp)) {
        return [];
    }

    let result = [];
    for (const [k, v] of Object.entries(exp)) {
        const finds = find(v, targetVar, [ ...path, array ? parseInt(k) : k ]);

        for (const f of finds) {
            result.push(f);
        }
    }

    return result;
}
