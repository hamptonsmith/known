import * as debug from './debug.mjs';
import instantiate from './instantiate.mjs';
import util from 'util';

import { withDebug } from './debug.mjs';

export function _(name) {
    return { free: name };
}

export const implication = { given };

function validateOpts(ctxName, opts = {}) {
    const optsKeys = Object.keys(opts);
    if (optsKeys.length > 0) {
        throw new Error(`Unexpected ${ctxName}() option: ${optsKeys[0]}`);
    }
}

export function given(antecedents, opts) {
    validateOpts('given', opts);

    antecedents = toList(antecedents, _);

    return {
        conclude(consequent) {
            return { antecedents, conditions: [], consequent };
        },
        where(conditions) {
            conditions = toList(conditions, _);

            return {
                conclude(consequent) {
                    return { antecedents, conditions, consequent };
                }
            }
        },
    }
}

function toList(original, ctx) {
    if (!Array.isArray(original)) {
        original = [original];
    }

    return original
            .map(el => typeof el === 'function' ? el(ctx) : el)
            .flat(Infinity);
}

function known(facts, opts) {
    validateOpts('known', opts);

    facts = toList(facts, { _, implication });

    let shouldDebug = false;

    return {
        facts,
        debug(on = true) {
            shouldDebug = on;
            return this;
        },
        instantiate(templates, opts) {
            validateOpts('instantiate', opts);

            templates = toList(templates, _);

            return debug.withDebug(shouldDebug, () => instantiate(
                facts.map(f =>
                    'consequent' in f
                    ? f
                    : {
                        antecedents: [true],
                        conditions: [],
                        consequent: f
                    }),
                templates));
        },
        known(additionalFacts, opts) {
            validateOpts('known', opts);

            additionalFacts =
                    toList(additionalFacts, { _, given, implication });

            for (const f of additionalFacts) {
                facts.push(f);
            }

            return this;
        }
    }
}

export default known;
