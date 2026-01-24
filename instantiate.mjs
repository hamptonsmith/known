import assert from 'assert';
import bind from './bind.mjs';
import * as debug from './debug.mjs';
import chalk from 'chalk';
import deepEqual from 'deep-equal';
import evaluate from './evaluate.mjs';
import hash from 'object-hash';
import * as utils from './utils.mjs';

import { isSolvableAst, solveForAll } from './solve.mjs';

import util from 'util';
function inspect(x) {
    return util.inspect(x, { depth: Infinity });
}

const axiomaticRules = [
    {
        antecedents: [
            ({ x, y }, ctx) => {
                let bindings = bind(x, y, ctx);
                return bindings.map(b => ({ bindings: b, conditions: [] }));
            }
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

export function explain(rules, templates, qBinding) {
    const candidates =
            instantiate([ ...axiomaticRules, ...rules ], templates, []);

    return candidates
            .filter(({ conditions }) => conditions.length === 0)
            .filter(({ bindings: aBinding }) => deepEqual(aBinding, qBinding))
            .map(({ explanation }) => explanation);
}

function instantiate(rules, templates, conditions = [],
        env = { visited: new Map(), visited2: new Map() }) {
    assert(arguments.length === 3 || arguments.length === 4, 'instantiate called with 4 args');

    return debug.push('instantiate', templates, () => {
        if (templates.length === 0) {
            return [{
                bindings: {},
                conditions,
                explanation: []
            }];
        }

        const bindCtx = { rules };
        const [ head, ...rest ] = templates;

        return utils.detectLoops(env.visited2, [], null, [ head, conditions ], () => {
            if (evaluate(head, bindCtx) === true) {
                return instantiate(rules, rest, conditions, env);
            }

            if (head?.templates) {
                return instantiate(
                    rules,
                    [
                        ...(Array.isArray(head.templates)
                                ? head.templates : [ head.templates ]),
                        ...rest
                    ],
                    conditions,
                    env);
            }

            const results = [];
            for (const r of rules) {
                const [ rDodged ] = utils.dodgeVars(r, utils.getFree(head));

                const applications = typeof head === 'function'
                        ? head(bindCtx).map(a => ({
                            ...a,
                            explanation: {
                                appliedFunctionTemplate: {
                                    fn: '' + head,
                                    explanation: a.explanation
                                }
                            }
                        }))
                        : applyRule(rules, head, rDodged, env).map(a => ({
                            ...a,
                            explanation: {
                                applyRule: {
                                    rule: rDodged,
                                    explanation: a.explanation
                                }
                            }
                        }));

                for (const a of applications) {
                    const restApplied = utils.apply(rest, a.bindings);
                    const conditionsApplied = conditions.map(
                            c => evaluate(utils.apply(c, a.bindings), bindCtx));

                    if (conditionsApplied.some(c => c === false)) {
                        continue;
                    }

                    if (rest.length === 0) {
                        utils.pushAll(results, utils
                            .applyAndEval(
                                a.bindings, conditionsApplied, bindCtx)
                            .map(r => ({
                                ...r,
                                explanation: [ {
                                    template: utils.apply(head, a.bindings),
                                    explanation: a.explanation
                                } ]
                            })));
                    }
                    else {
                        utils.pushAll(results, instantiate(
                            rules,
                            restApplied,
                            [ ...conditionsApplied, ...a.conditions ],
                            env
                        ).map((i) => ({
                            ...i,
                            bindings: { ...a.bindings, ...i.bindings },
                            explanation: [
                                {
                                    template: utils.apply(
                                        head, { ...a.bindings, ...i.bindings }),
                                    explanation: a.explanation
                                },
                                ...i.explanation
                            ]
                        })));
                    }
                }
            }

            return results;
        });
    });
}

// Returns [ <Conditional Instantiation> ]
function applyRule(rules, template, { antecedents, conditions, consequent }, env) {
    // Short circuit when clearly irrelevant.
    const [ tOp ] = utils.deast(template);
    const [ cOp ] = utils.deast(consequent);

    if (tOp !== 'object' && tOp !== 'free' && cOp !== 'free' && tOp !== cOp
            && !isSolvableAst(template) && !isSolvableAst(consequent)) {
        return [];
    }

    return debug.push('applyRule', '\n\n', { antecedents, conditions, consequent },
        '\n\n',
        template,
        () => {
            const bindCtx = { rules };

            const startFreeVars = utils.getFree(template);

            const consequentBindingAlternatives =
                    bind(consequent, template, bindCtx);

            const results = [];
            for (const cba of consequentBindingAlternatives) {
                utils.pushAll(results, applyRuleUnderConsequentBinding(
                    rules,
                    cba,
                    template,
                    antecedents,
                    conditions,
                    consequent,
                    bindCtx,
                    startFreeVars,
                    env
                ));
            }

            return results;
        });
}

function applyRuleUnderConsequentBinding(
    rules,
    consequentBinding,
    template,
    antecedents,
    conditions,
    consequent,
    bindCtx,
    startFreeVars,
    env
) {
    return debug.push('applyRuleUnderConsequentBinding', consequentBinding,
        () => {
            const templateApplied =
                    utils.apply(template, consequentBinding);

            const conditionsApplied = conditions.map(
                    c => evaluate(utils.apply(c, consequentBinding), bindCtx));

            if (conditionsApplied.some(c => c === false)) {
                return [];
            }

            const antecedentsApplied =
                    utils.apply(antecedents, consequentBinding);

            const consequentApplied =
                    utils.apply(consequent, consequentBinding);

            const antecedentInstantiations =
                    instantiate(rules, antecedentsApplied, conditionsApplied,
                        env);

            const results = [];
            for (const i of antecedentInstantiations) {
                const expandedConsequent =
                        utils.apply(consequentApplied, i.bindings);

                const expandedUndodgedConditions = [
                    ...conditionsApplied,
                    ...i.conditions
                ];

                const additionalBindingAlternatives = bind(
                        templateApplied, expandedConsequent, bindCtx);

                for (const additionalBinding of additionalBindingAlternatives) {
                    const fullTemplateBinding = utils.extendBinding(
                            consequentBinding, additionalBinding);

                    const templateBinding = Object.fromEntries(
                        Object.entries(fullTemplateBinding)
                        .filter(([k, v]) => startFreeVars.has(k))
                    );

                    const additionalResults = utils.applyAndEval(
                            templateBinding,
                            expandedUndodgedConditions,
                            bindCtx);

                    for (const r of additionalResults) {
                        for (const k of Object.keys(r.bindings)) {
                            if (!startFreeVars.has(k)) {
                                console.error('Introduced a bad var applying',
                                        antecedents, consequent);
                                console.error(r.bindings);
                                process.exit(1);
                            }
                        }
                    }

                    utils.pushAll(results, utils
                        .applyAndEval(
                            templateBinding,
                            expandedUndodgedConditions,
                            bindCtx
                        )
                        .map(r => ({
                            ...r,
                            explanation: {
                                antecedent: i.explanation,
                                additionalBinding
                            }
                        })));
                }
            }

            return results;
        });
}
