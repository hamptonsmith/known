import bind from './bind.mjs';
import * as debug from './debug.mjs';
import deepEqual from 'deep-equal';
import util from 'util';

const testCases = [
    {
        name: 'direct free variable',
        template: { free: 'x' },
        target: 5,
        result: { x: 5 }
    },
    {
        name: 'direct object recursion',
        template: { foo: { free: 'foovar' }, bar: { free: 'barvar' } },
        target: { foo: 1, bar: 2 },
        result: { foovar: 1, barvar: 2 }
    },
    {
        name: 'direct array recursion',
        template: [ { free: 'foovar' }, { free: 'barvar' } ],
        target: [ 1, 2 ],
        result: { foovar: 1, barvar: 2 }
    },
    {
        name: 'simple solve',
        template: { sum: [ 1, { free: 'x' } ] },
        target: 3,
        result: { x: 2 }
    },
    {
        name: 'must equal',
        template: { foo: 'fooval' },
        target: 2,
        result: false
    },
    {
        name: 'yoda solve',
        template: 0,
        target: { sum: [ { free: 'x' }, -1 ] },
        result: { x: 1 }
    },
    {
        name: 'bind repeat succeeds',
        template: { foo: [ { free: 'x' }, { free: 'x' } ] },
        target: { foo: [ 'a', 'a' ] },
        result: { x: 'a' }
    },
    {
        name: 'bind repeat failure',
        template: { foo: [ { free: 'x' }, { free: 'x' } ] },
        target: { foo: [ 'a', 'b' ] },
        result: false
    },
    {
        template: {
            a: { free: 'x' },
            b: { free: 'x' }
        },
        target: {
            a: 'A',
            b: { free: 'y' }
        },
        result: false
    }
];

for (const { name, template, target, result: expected } of testCases) {
    const actual = bind(template, target, {});

    if (!deepEqual(actual, expected)) {
        debug.withDebug(() => bind(template, target, {}));

        console.log('For test ' + name + ',');
        console.log();
        console.log('Expected:');
        console.log(util.inspect(expected, { depth: Infinity }));
        console.log();
        console.log('Actual:');
        console.log(util.inspect(actual, { depth: Infinity }));
        process.exit(1);
    }
}
