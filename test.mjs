import deepEqual from 'deep-equal';
import instantiate from './instantiate.mjs';
import known from './known.mjs';
import util from 'util';
import * as utils from './utils.mjs';

import { withDebug } from './debug.mjs';

const testCases = [
    {
        name: 'basic solve',
        templates: [
            { eq: [
                4,
                { sum: [ 3, { free: 'a' } ] }
            ] }
        ],
        expected: [ { a: 1 } ]
    },

    {
        name: 'basic match',
        rules: [ fact({ foo: 'fooval' }) ],
        templates: [ { foo: { free: 'x' } } ],
        expected: [ { x: 'fooval' } ]
    },

    {
        name: 'multi match',
        rules: [
            fact({ foo: 'fooval1' }),
            fact({ foo: 'fooval2' })
        ],
        templates: [ { foo: { free: 'x' } } ],
        expected: [ { x: 'fooval1' }, { x: 'fooval2' } ]
    },

    {
        name: 'pairwise multi match',
        rules: [
            fact({ foo: 'fooval1' }),
            fact({ foo: 'fooval2' }),
            fact({ bar: 'barval1' }),
            fact({ bar: 'barval2' })
        ],
        templates: [
            { foo: { free: 'x' } },
            { bar: { free: 'y' } },
        ],
        expected: [
            { x: 'fooval1', y: 'barval1' },
            { x: 'fooval2', y: 'barval1' },
            { x: 'fooval1', y: 'barval2' },
            { x: 'fooval2', y: 'barval2' }
        ]
    },

    {
        name: 'one bad template spoils',
        rules: [
            fact({ foo: 'fooval1' }),
            fact({ foo: 'fooval2' })
        ],
        templates: [
            { foo: { free: 'x' } },
            { bar: { free: 'y' } },
        ],
        expected: []
    },

    {
        name: 'false condition spoils',
        rules: [
            fact({ foo: 'fooval1' }),
            fact({ foo: 'fooval2' })
        ],
        templates: [
            { foo: { free: 'x' } }
        ],
        conditions: [ false ],
        expected: []
    },

    {
        name: 'basic condition',
        rules: [
            fact({ foo: 'fooval1' }),
            fact({ foo: 'fooval2' })
        ],
        templates: [
            { foo: { free: 'x' } }
        ],
        conditions: [ { eq: [ { free: 'x' }, 'fooval2' ] } ],
        expected: [
            { x: 'fooval2' }
        ]
    },

    {
        name: 'basic implication',
        rules: [
            fact({ foo: 'fooval1' }),
            fact({ foo: 'fooval2' }),
            {
                antecedents: [
                    { foo: { free: 'a' } }
                ],
                consequent: { bar: { free: 'a' } },
                conditions: []
            }
        ],
        templates: [
            { bar: { free: 'x' } }
        ],
        expected: [
            { x: 'fooval1' },
            { x: 'fooval2' }
        ]
    },

    {
        name: 'simple multi antecedent implication',
        rules: [
            fact({ foo: 'fooval1' }),
            fact({ bazz: 'fooval1' }),
            {
                antecedents: [
                    { foo: { free: 'a' } },
                    { bazz: { free: 'a' } }
                ],
                consequent: { bar: { free: 'a' } },
                conditions: []
            }
        ],
        templates: [
            { bar: { free: 'x' } }
        ],
        expected: [
            { x: 'fooval1' }
        ]
    },

    {
        name: 'multi antecedent implication',
        rules: [
            fact({ foo: 'fooval1' }),
            fact({ foo: 'fooval2' }),
            fact({ foo: 'fooval3' }),
            fact({ foo: 'fooval4' }),
            fact({ bazz: 'fooval2' }),
            fact({ bazz: 'fooval4' }),
            {
                antecedents: [
                    { foo: { free: 'a' } },
                    { bazz: { free: 'a' } }
                ],
                consequent: { bar: { free: 'a' } },
                conditions: []
            }
        ],
        templates: [
            { bar: { free: 'x' } }
        ],
        expected: [
            { x: 'fooval2' },
            { x: 'fooval4' }
        ]
    },

    // length(a, n) --> length(b::a, n + 1)
    {
        name: 'recursive implication',
        rules: [
            fact({ length: [ utils.arrayToCats([]), 0 ] }),
            {
                antecedents: [
                    {
                        length: [
                            { free: 'a' },
                            { free: 'n' }
                        ]
                    }
                ],
                consequent: {
                    length: [
                        { cat: [ { free: 'b' }, { free: 'a' } ] },
                        { sum: [ { free: 'n' }, 1 ] }
                    ]
                },
                conditions: []
            }
        ],
        templates: [
            {
                length: [
                    utils.arrayToCats(['e', 'f', 'g']),
                    { free: 'x' }
                ]
            }
        ],
        expected: [
            { x: 3 }
        ]
    },

    {
        name: 'recursive implication (sugar)',
        actualFn: () => known(
            ({ _, implication }) => [
                { length: [ utils.arrayToCats([]), 0 ] },
                implication
                    .given({ length: [ _('a'), _('n') ] })
                    .conclude({
                        length: [
                            { cat: [ _('b'), _('a') ] },
                            { sum: [ _('n'), 1 ] }
                        ]
                    })
            ]
        ).instantiate((_) => ({
            length: [ utils.arrayToCats(['e', 'f', 'g']), _('x') ]
        })),
        expected: [
            { x: 3 }
        ]
    },

    {
        name: 'repeat free var same value',
        actualFn: () => known(({ _ }) => [
            { foo: [ _('x'), _('x') ] }
        ]).instantiate(
            { foo: [ 'a', 'a' ] }
        ),
        expected: [ {} ]
    },

    {
        name: 'repeat free var different value',
        actualFn: () => known(({ _ }) => [
            { foo: [ _('x'), _('x') ] }
        ]).instantiate(
            { foo: [ 'a', 'b' ] }
        ),
        expected: []
    },

    {
        name: 'minimum spanning tree',
        actualFn: () => known(
            ({ _, implication, op }) => [

                { edge: [ 'A', 'B' ] },
                { edge: [ 'B', 'C' ] },
                { edge: [ 'C', 'D' ] },
                { edge: [ 'D', 'B' ] },
                { edge: [ 'D', 'E' ] },

                {
                    dist: {
                        from: _('x'),
                        to: _('x'),
                        length: 0,
                        avoid: _('y')
                    }
                },

                { contains: [ { cat: [ _('x'), _('y') ] }, _('x') ] },
                implication
                    .given({ contains: [ _('x'), _('y') ] })
                    .conclude({
                        contains: [
                            { cat: [ _('z'), _('x') ] },
                            _('y')
                        ]
                    }),

                implication
                    .given(
                        { edge: [ _('y'), _('z') ] },
                        {
                            dist: {
                                from: _('x'),
                                to: _('y'),
                                length: _('n'),
                                avoid: { cat: [ _('z'), _('visited') ] }
                            }
                        }
                    )
                    .where(
                        {
                            not: {
                                exists: [
                                    [],
                                    [
                                        {
                                            contains: [ _('visited'), _('z') ]
                                        }
                                    ]
                                ]
                            }
                        }
                    )
                    .conclude({
                        dist: {
                            from: _('x'),
                            to: _('z'),
                            length: { sum: [ 1, _('n') ] },
                            avoid: _('visited')
                        }
                    })
            ]
        ).instantiate((_) => ({
            dist: {
                from: 'A',
                to: 'E',
                length: _('n'),
                avoid: utils.arrayToCats([])
            }
        })),
        expected: [
            { n: 4 }
        ]
    }
];

for (const test of testCases) {
    if (test.skip) {
        console.log('Skipping ' + test.name);
        continue;
    }

    const runTestFn = test.actualFn
        ? test.actualFn
        : () => instantiate(
            test.rules ?? [],
            test.templates ?? [],
            test.conditions ?? []);

    try {
        const actual = runTestFn();

        if (!arraySetsEqual(actual, test.expected)) {
            withDebug(runTestFn);

            console.log('For test ' + test.name + ',');
            console.log();
            console.log('Expected:');
            console.log(util.inspect(test.expected, { depth: Infinity }));
            console.log();
            console.log('Actual:');
            console.log(util.inspect(actual, { depth: Infinity }));
            process.exit(1);
        }
    }
    catch (e) {
        withDebug(runTestFn);
        console.error('Error in ' + test.name + ': ' + e.stack);
        console.error();
        console.error('Error in ' + test.name + '.');
        process.exit(1);
    }
}

function fact(f) {
    return { consequent: f, antecedents: [], conditions: [] };
}

function arraySetsEqual(a1, a2) {
    const unmatched = [...a2];
    for (const toFind of a1) {
        const i = unmatched.findIndex((el) => deepEqual(el, toFind));

        if (i === -1) {
            return false;
        }

        unmatched.splice(i, 1);
    }

    if (unmatched.length > 0) {
        return false;
    }

    return true;
}
