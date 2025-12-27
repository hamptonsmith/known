import bind from './bind.mjs';
import * as debug from './debug.mjs';
import chalk from 'chalk';
import deepEqual from 'deep-equal';
import evaluate from './evaluate.mjs';
import * as utils from './utils.mjs';

import { isSolvableAst } from './solve.mjs';

import util from 'util';
function inspect(x) {
    return util.inspect(x, { depth: Infinity });
}

const axiomaticRules = [
    {
        antecedents: [
            ({ x, y }, ctx) => {
                let bindings = bind(x, y, ctx);
                return bindings ? [{ bindings, conditions: [] }] : [];
            }
            //utils.getFree([x, y]).size <= 1 ? solve(x, y) : []
        ],
        consequent: { eq: [{ free: 'x' }, { free: 'y' }] },
        conditions: []
    }
];

export default function axiomaticInstantiate(
    rules, templates, conditions = []
) {
    const candidates =
            instantiate([ ...axiomaticRules, ...rules ], templates, conditions);

    return candidates.filter(({ conditions }) => conditions.length === 0)
            .map(({ bindings }) => bindings);
}

function instantiate(rules, templates, conditions = []) {
    return debug.push('instantiate', templates, () => {
        if (templates.length === 0) {
            return [{ bindings: {}, conditions }];
        }

        const bindCtx = { rules };
        const [ head, ...rest ] = templates;

        const results = [];
        for (const r of rules) {
            const applications = typeof head === 'function'
                    ? head(bindCtx)
                    : applyRule(rules, head, r);

            for (const a of applications) {
                const restApplied = utils.apply(rest, a.bindings);
                const conditionsApplied = conditions.map(
                        c => evaluate(utils.apply(c, a.bindings), bindCtx));

                if (conditionsApplied.some(c => c === false)) {
                    continue;
                }

                if (rest.length === 0) {
                    utils.pushAll(results, utils.applyAndEval(
                        a.bindings, conditionsApplied, bindCtx));
                }
                else {
                    utils.pushAll(results, instantiate(
                        rules,
                        restApplied,
                        [ ...conditionsApplied, ...a.conditions ]
                    ).map((i) => ({
                        ...i,
                        bindings: { ...a.bindings, ...i.bindings }
                    })));
                }
            }
        }

        return results;
    });
}

// Returns [ <Conditional Instantiation> ]
function applyRule(rules, template, { antecedents, conditions, consequent }) {
    // Short circuit when clearly irrelevant.
    const [ tOp ] = utils.deast(template);
    const [ cOp ] = utils.deast(consequent);

    if (tOp !== 'free' && cOp !== 'free' && tOp !== cOp
            && !isSolvableAst(template) && !isSolvableAst(consequent)) {
        return [];
    }

    if (typeof tOp === 'object' && typeof cOp === 'object'
            && Object.keys(tOp).length !== Object.keys(cOp)) {
        return [];
    }

    return debug.push('applyRule', '\n\n', { antecedents, conditions, consequent },
        '\n\n',
        template,
        () => {
            const bindCtx = { rules };

            const startFreeVars = utils.getFree(template);

            const [ dodgingTemplate, dodgeBindings, undodgeBindings ] =
                    utils.dodgeVars(template, utils.getFree(consequent));

            const consequentBinding =
                    bind(consequent, dodgingTemplate, bindCtx);

            debug.print('consequentBinding', consequentBinding);

            if (!consequentBinding) {
                return [];
            }

            const conditionsApplied = conditions.map(
                    c => evaluate(utils.apply(c, consequentBinding), bindCtx));

            debug.print('conditionsApplied', conditionsApplied);

            if (conditionsApplied.some(c => c === false)) {
                return [];
            }

            const antecedentsApplied =
                    utils.apply(antecedents, consequentBinding);
            const consequentApplied =
                    utils.apply(consequent, consequentBinding);

            debug.print('antecedentsApplied', antecedentsApplied);

            const antecedentInstantiations = instantiate(
                    rules, antecedentsApplied, conditionsApplied);

            debug.print('antecedentInstantiations', antecedentInstantiations);

            const results = [];
            for (const i of antecedentInstantiations) {
                const expandedUndodgedConsequent = utils.apply(
                        utils.apply(consequentApplied, i.bindings),
                        undodgeBindings);

                const expandedUndodgedConditions = utils.apply([
                    ...conditionsApplied,
                    ...i.conditions
                ], undodgeBindings);

                const templateBinding = bind(
                        template, expandedUndodgedConsequent, bindCtx);

                debug.print('templateBinding', templateBinding);

                if (!templateBinding) {
                    continue;
                }

                for (const v of Object.values(templateBinding)) {
                    const vars = utils.getFree(v);

                    if (!startFreeVars.isSupersetOf(vars)) {
                        console.log('Huh?');
                        console.log(inspect(template));
                        console.log(inspect(antecedents), inspect(conditions), inspect(consequent));
                        console.log(inspect(templateBinding));
                        process.exit(1);
                    }
                }

                const additionalResults = utils.applyAndEval(
                        templateBinding,
                        expandedUndodgedConditions,
                        bindCtx);

                for (const r of additionalResults) {
                    for (const k of Object.keys(r.bindings)) {
                        if (!startFreeVars.has(k)) {
                            console.error('Introduced a bad var applying', antecedents, consequent);
                            console.error(r.bindings);
                            process.exit(1);
                        }
                    }
                }

                utils.pushAll(results, utils.applyAndEval(
                        templateBinding,
                        expandedUndodgedConditions,
                        bindCtx));
            }

            return results;
        });
}
