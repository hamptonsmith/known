import assert from 'assert';
import * as debug from './debug.mjs';
import deepEqual from 'deep-equal';
import evaluate from './evaluate.mjs';
import * as utils from './utils.mjs';

import { solveFor } from './solve.mjs';

export default function bind(template, target, ctx) {
    assert(arguments.length === 3, 'bind given 3 arguments');

    const bindings = _bind(template, target, ctx);

    if (!bindings) {
        return false;
    }

    if (utils.getFree(template).size === 0) {
        const appliedTarget = utils.apply(target, bindings);

        if (!deepEqual(evaluate(template, ctx), evaluate(appliedTarget, ctx))) {
            debug.print('rejected');
            debug.print(template);
            debug.print(target, evaluate(appliedTarget, ctx));
            return false;
        }
    }

    return bindings;
}

function _bind(template, target, ctx) {
    return debug.push('bind', template, target, () => {
        if (template?.free) {
            return { [template?.free]: target };
        }

        if (template === target) {
            return {};
        }

        if (utils.getFree(template).size === 0) {
            if (utils.getFree(target).size === 0) {
                return deepEqual(template, target) ? {} : false;
            }

            return bind(target, template, ctx);
        }

        if (Array.isArray(template)) {
            const binding = directBindArray(template, target, ctx);

            if (binding) {
                return binding;
            }
        }

        const templateObj = !Array.isArray(template) && typeof template === 'object' && template !== null;

        if (templateObj && typeof target === 'object' && target !== null) {
            const binding = directBindObject(template, target, ctx);

            if (binding) {
                return binding;
            }
        }

        if (!templateObj) {
            return false;
        }

        const binding = {};
        for (const v of utils.getFree(template)) {
            const solution = solveFor(template, target, v, ctx);

            if (!solution) {
                return false;
            }

            binding[v] = evaluate(solution, ctx);

            template = utils.apply(template, { [v]: binding[v] });
            target = utils.apply(template, { [v]: binding[v] });
        }

        return binding;
    });
}

function directBindArray(preferred, other, ctx) {
    if (!Array.isArray(other) || preferred.length !== other.length) {
        return false;
    }

    let bindings = {};
    for (let i = 0; i < preferred.length; i++) {
        const elP = preferred[i];
        const elO = other[i];

        const elBinding = bind(
                utils.apply(elP, bindings),
                utils.apply(elO, bindings),
                ctx);

        if (!elBinding) {
            return false;
        }

        bindings = { ...bindings, ...elBinding };
    }

    return bindings;
}

function directBindObject(preferred, other, ctx) {
    return debug.push('directBindObject', preferred, other, () => {
        const pKeys = new Set(Object.keys(preferred));
        const oKeys = new Set(Object.keys(other));

        if (pKeys.intersection(oKeys).size !== pKeys.size) {
            return false;
        }

        let bindings = {};
        for (const [k, v] of Object.entries(preferred)) {
            const nextBindings = bind(
                    utils.apply(v, bindings),
                    utils.apply(other[k], bindings),
                    ctx);

            debug.print('nextBindings', nextBindings);

            if (!nextBindings) {
                return false;
            }

            bindings = { ...bindings, ...nextBindings };
        }

        return bindings;
    });
}
