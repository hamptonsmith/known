import assert from 'assert';
import * as debug from './debug.mjs';
import deepEqual from 'deep-equal';
import evaluate from './evaluate.mjs';
import hash from 'object-hash';
import * as utils from './utils.mjs';

import { solveFor } from './solve.mjs';

export default function bind(template, target, ctx, env = {
    visited: new Map()
}) {
    assert(arguments.length === 3 || arguments.length === 4, 'bind given 3 arguments');

    const bindings = _bind(template, target, ctx, env);

    if (bindings.length === 0) {
        return [];
    }

    if (bindings.length === 1 && Object.keys(bindings).length === 0) {
        return deepEqual(evaluate(template, ctx), evaluate(target, ctx))
                ? [] : [{}];
    }

    return bindings;
}

const equality = [
    (x, y) => deepEqual(x, y),
    (x, y) => x?.regexp && (new RegExp(x.regexp)).test(y)
];

const matchers = [

    // Free variable matcher.
    (template, target, ctx, env) => {
        const [ templateOp ] = utils.deast(template, 'free');

        if (!templateOp) {
            return;
        }

        return [ { [template?.free]: target } ];
    },

    // Array matcher.
    (template, target, ctx, env) => {
        if (!Array.isArray(template) || !Array.isArray(target)) {
            return;
        }

        if (template.length !== target.length) {
            return;
        }

        if (template.length === 0) {
            return [{}];
        }

        const [ temHead, ...temTail ] = template;
        const [ tarHead, ...tarTail ] = target;

        const headBindings = bind(temHead, tarHead, ctx, env);

        const results = [];
        for (const h of headBindings) {
            const appliedTemTail = utils.apply(temTail, h);
            const appliedTarTail = utils.apply(tarTail, h);

            for (const t of bind(appliedTemTail, appliedTarTail, ctx, env)) {
                results.push({ ...h, ...t });
            }
        }

        return results;
    },

    // Struct matcher.
    (template, target, ctx, env) => {
        if (!isPlainObject(template) || !isPlainObject(target)) {
            return;
        }

        const temKeys = new Set(Object.keys(template));
        const tarKeys = new Set(Object.keys(target));

        if (temKeys.intersection(tarKeys).size !== temKeys.size) {
            return;
        }

        if (temKeys.size === 0) {
            return [{}];
        }

        const someKey = Object.keys(template).pop();
        const results = [];

        const someBindings = bind(template[someKey], target[someKey], ctx, env);
        for (const s of someBindings) {
            const remainingTemplate = { ...template };
            delete remainingTemplate[someKey];

            const remainingTarget = { ...target };
            delete remainingTarget[someKey];

            for (const r of bind(remainingTemplate, remainingTarget, ctx, env)) {
                results.push({ ...s, ...r });
            }
        }

        return results;
    },

    // Dynamic object matcher.
    function dynamicObjectMatcher(template, target, ctx, env) {
        const [ templateOp ] = utils.deast(template, 'object');

        if (!templateOp) {
            return;
        }

        if (!isPlainObject(target)) {
            return [];
        }

        if (template.object.length === 0) {
            return Object.keys(target).length === 0 ? [{}] : [];
        }

        let result = [];

        for (const [key, nextTarget, keyBindings] of findBindingField(
                template.object[0][0],
                template.object[0][1],
                target,
                ctx,
                env)) {

            for (const kb of keyBindings) {
                const appliedNextTarget = utils.apply(nextTarget, kb);
                for (const otherBinding of dynamicObjectMatcher(
                        { object: template.object.slice(1) },
                        appliedNextTarget,
                        ctx,
                        env)) {

                    result.push({ ...kb, ...otherBinding });
                }
            }
        }

        return result;
    }

];

function findBindingField(keyTemplate, valueTemplate, targetObj, ctx, env) {
    return debug.push('findBindingField', keyTemplate, valueTemplate, () => {
        const results = [];

        for (const k of Object.keys(targetObj)) {
            const keyBindings = bind(keyTemplate, k, ctx, env);
            let bindings = [];

            for (const kb of keyBindings) {
                const valueApplied = utils.apply(targetObj[k], kb);
                const valueBindings = bind(valueTemplate, valueApplied, ctx, env);

                for (const vb of valueBindings) {
                    bindings.push({ ...kb, ...vb });
                }
            }

            if (bindings.length > 0) {
                const newTargetObj = { ...targetObj };
                delete newTargetObj[k];

                results.push([ k, newTargetObj, bindings ]);
            }
        }

        return results;
    });
}

function isPlainObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function _bind(template, target, ctx, env) {
    return debug.push('bind', template, target, () => {
        for (const m of matchers) {
            const bindings = m(template, target, ctx, env);

            if (bindings) {
                return bindings;
            }
        }

        let solutions = solveBindings(template, target, ctx, env);

        if (solutions.length === 0 && utils.getFree(target).size > 0) {
            solutions = solveBindings(target, template, ctx, env);
        }

        return solutions;
    });
}

function solveBindings(preferred, other, ctx, env) {
    if (utils.getFree(preferred).size === 0) {
        if (utils.getFree(other).size === 0) {

            const preferredEvald = evaluate(preferred, ctx);
            const otherEvald = evaluate(other, ctx);

            for (const eq of equality) {
                if (eq(preferredEvald, otherEvald)) {
                    return [{}];
                }
            }

            return [];
        }

        return bind(other, preferred, ctx, env);
    }

    if (!isPlainObject(preferred)) {
        return [];
    }

    const binding = {};

    for (const v of utils.getFree(preferred)) {
        const solution = solveFor(preferred, other, v, ctx);

        if (!solution) {
            return [];
        }

        binding[v] = evaluate(solution, ctx);

        preferred = utils.apply(preferred, { [v]: binding[v] });
        other = utils.apply(other, { [v]: binding[v] });
    }

    return [ binding ];
}
