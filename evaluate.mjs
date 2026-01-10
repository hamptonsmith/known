import assert from 'assert';
import * as debug from './debug.mjs';
import * as utils from './utils.mjs';
import instantiate from './instantiate.mjs';

const opEvals = {
    all: (conjuncts, ctx) => {
        const conjunctsEvald = conjuncts.map(c => evaluate(c, ctx));

        if (conjunctsEvald.some(c => c === false)) {
            return false;
        }

        return { all: conjunctsEvald };
    },
    cat: (arg) => ({ cat: arg }),
    diff: ([ left, right ], ctx) => {
        const lEvald = evaluate(left, ctx);
        const rEvald = evaluate(right, ctx);

        if (typeof lEvald === 'number' && typeof rEvald === 'number') {
            return lEvald - rEvald;
        }

        return { diff: [ lEvald, rEvald ] };
    },
    eq: ([ left, right ], ctx) => {
        const lEvald = evaluate(left, ctx);
        const rEvald = evaluate(right, ctx);

        if (lEvald === rEvald) {
            return true;
        }

        if (typeof lEvald !== 'object' && typeof rEvald !== 'object') {
            return false;
        }

        return { eq: [ lEvald, rEvald ] };
    },
    exists: ([ values, where ], ctx) => {
        return debug.push('exists', values, where, () => {
            const freeVars = utils.getFree(where);

            if ([ ...freeVars ].some(v => !values?.includes(v))) {
                return { exists: [ values, where ] };
            }

            const instantiations = instantiate(ctx.rules, where, [], { visited: new Map() });

            return instantiations.length > 0;
        });
    },
    free: (arg) => ({ free: arg }),
    gte: ([ left, right ], ctx) => {
        const lEvald = evaluate(left, ctx);
        const rEvald = evaluate(right, ctx);

        if (typeof lEvald === 'number' && typeof rEvald === 'number') {
            return lEvald >= rEvald;
        }

        return { gte: [ lEvald, rEvald ] };
    },
    not: (arg, ctx) => {
        const argEvald = evaluate(arg, ctx);

        if (typeof argEvald === 'boolean') {
            return !argEvald;
        }

        return { not: argEvald };
    },
    sum: ([ left, right ], ctx) => {
        const lEvald = evaluate(left, ctx);
        const rEvald = evaluate(right, ctx);

        if (typeof lEvald === 'number' && typeof rEvald === 'number') {
            return lEvald + rEvald;
        }

        return { sum: [ lEvald, rEvald ] };
    }
};

export default function evaluate(ast, ctx) {
    assert(arguments.length === 2, 'evaluate given 2 arguments');

    if (ast === null || typeof ast !== 'object') {
        return ast;
    }

    const [ op, arg ] = utils.deast(ast);

    if (!opEvals[op]) {
        return ast;
    }

    return opEvals[op](arg, ctx);
}
