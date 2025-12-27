import instantiate from './instantiate.mjs';
import util from 'util';

import { withDebug } from './debug.mjs';

export function _(name) {
    return { free: name };
}

export const implication = { given };

export function given(...antecedents) {
    return {
        conclude(consequent) {
            return { antecedents, conditions: [], consequent };
        },
        where(...conditions) {
            return {
                conclude(consequent) {
                    return { antecedents, conditions, consequent };
                }
            }
        },
    }
}

function known(facts) {
    if (typeof facts === 'function') {
        facts = facts({ _, given, implication });
    }

    return {
        facts,
        instantiate(...templates) {
            templates = templates.map(t => {
                if (typeof t === 'function') {
                    let result = t(_);

                    if (result === undefined) {
                        throw new Error('instantiate() function argument '
                                + 'evaluated to undefined');
                    }

                    if (!Array.isArray(result)) {
                        result = [result];
                    }

                    return result;
                }

                return t;
            }).flat(Infinity);

            return instantiate(
                facts.map(f =>
                    'consequent' in f
                    ? f
                    : {
                        antecedents: [],
                        conditions: [],
                        consequent: f
                    }),
                templates);
        },
        known(additionalFacts) {
            if (typeof additionalFacts === 'function') {
                additionalFacts = (facts({ _, given, implication }));
            }

            for (const f of additionalFacts) {
                facts.push(f);
            }

            return this;
        }
    }
}

export default known;
