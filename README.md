# node-persistent-json-cache

Transparently sync JSON-compatible Object to file. Useful as a cache for
smallish objects.

I've used this for small cli scripts, so the code is very simple. The whole
object is kept in memory and data is periodically written to disk (1000ms by
default, only if modified). It is also written to disk on SIGINT, SIGTERM &
exit.

Note: the cache does not do a deep clone when assigning objects/arrays.

## Install

    npm install persistent-json-cache


## Example

```js
async function main() {
    const persistent = require('persistent-json-cache')

    // Load our cache (the file will be created if it doesn't exist).
    let cache = await persistent("test_cache1.json")
    
    // Initially it is empty.
    assert.deepEqual(cache, {})

    // Use cache as a normal object.
    cache.obj = {a: 1}
    cache.arr = [1, 2, 3]
    cache.arr.push(4)
    cache.arr.push({deep: 1})

    // Functions cannot be serialized to JSON, so they are not persisted.
    // cache.fun = function() {}
    
    // Sets and Maps cannot be serialized to JSON, but the stringifier & parser
    // could be extended to transform them: https://stackoverflow.com/a/56150320
    // cache.set = new Set([1, 2, 3])
    // cache.map = new Map([[1, "one"]])

    // Your program won't exit by itself while there are caches loaded because
    // there is a setTimeout() timer running for periodic saving. You will need
    // to call process.exit() or close the cache explicitely (both ways are
    // fine).
    await persistent.close(cache)
    
    // Load our cache again, this time with a different save period.
    cache = await persistent("test_cache1.json", {savePeriod: 100})

    // Check that everything was saved.
    assert.deepEqual(cache, {
        obj: {a: 1},
        arr: [1, 2, 3, 4, {deep: 1}],
    })
 
    process.exit()
}

main()
```

