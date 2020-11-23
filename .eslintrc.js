module.exports = {
    root: true,
    extends: "eslint:recommended",
    env: {
        node: true,
        es6: true,
    },
    parserOptions: {ecmaVersion: 2017},

    // Rule settings:0 - turn off, 1 - warn, 2 - error.
    rules: {
        "no-console": 0,  // override eslint:recommended
    }
}
