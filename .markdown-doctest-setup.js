module.exports = {
    babel: false,
    require: {
        "persistent-json-cache": require("./index")
    },
    globals: {
        assert: require('assert'),
        process: require('process'),
    },
    beforeEach: function() {
        const fs = require('fs')
        try { fs.unlinkSync('test_cache1.json') }
        catch (e) { if (e.code != 'ENOENT') throw e }
    },
}
